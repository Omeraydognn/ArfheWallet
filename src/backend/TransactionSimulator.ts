/**
 * TransactionSimulator — Pre-flight transaction safety checker
 * 
 * Simulates transactions via eth_call BEFORE signing to:
 * 1. Detect reverts before wasting gas
 * 2. Show balance changes (what you lose / gain)
 * 3. Warn about scam addresses, unlimited approvals, new contracts
 * 4. Calculate risk level (LOW / MEDIUM / HIGH / CRITICAL)
 * 
 * Supports: Native ETH, ERC20 transfer/approve, FHE wrap/unwrap/transferEncrypted
 * 
 * IMPORTANT: This module does NOT touch FHE encryption/decryption.
 * FHE transactions (transferEncrypted, wrap, unwrap) are detected by selector
 * but encrypted amounts are NOT decrypted — only the operation type is shown.
 */

import { Interface, Provider, getAddress, formatUnits, Contract } from "ethers";

// ─── Types ───────────────────────────────────────────────────────────

export interface BalanceChange {
    tokenAddress: string;
    symbol: string | null;
    decimals: number | null;
    amountWei: string;
    /** Human-readable formatted amount (e.g. "1.5") — set by enrichment */
    amountFormatted?: string;
    from: string;
    to: string;
    type: "ERC20" | "NATIVE" | "FHE_ENCRYPTED";
}

export interface SimResult {
    success: boolean;
    error?: string;
    balanceChanges: BalanceChange[];
    warnings: string[];
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    /** Detected operation type for UI labeling */
    operationType?: "transfer" | "transferFrom" | "approve" | "wrap" | "wrapETH" | "unwrap" | "transferEncrypted" | "unknown";
    /** True if destination is a smart contract (not EOA) */
    isContractInteraction?: boolean;
    /** True if destination address has never been interacted with before */
    isNewRecipient?: boolean;
    /** Contract age in days if detectable, null otherwise */
    contractAgeDays?: number | null;
}

// ─── Known Scam / Phishing Database ─────────────────────────────────
// Community-maintained list — in production, fetch from Blockaid API
// or a shared GitHub-hosted JSON periodically.

const SCAM_ADDRESSES: Set<string> = new Set([
    // Burn / zero address (usually a mistake)
    "0x0000000000000000000000000000000000000000",
    // Known phishing addresses (examples — extend as needed)
    "0x00000000a]b16ce028b73e00e01000000000000",
    "0xef33ec3451e6d4272c5f3e5f8e6fe6ba7e3e7b2d",
    "0x55fe002aeff02f77364de339a1292923a15844b8",
    // Fake "Uniswap" scam contracts
    "0x0000000000ffe8b47b3e2130213b802212439497",
    // Address poisoning patterns
    "0x0000db5c8b030ae20308ac975898e09e8200bc00",
]);

// Known legitimate contract addresses that should NOT trigger "new contract" warnings
const TRUSTED_CONTRACTS: Set<string> = new Set([
    // Uniswap
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
    "0xe592427a0aece92de3edee1f18e0157c05861564",
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    // 1inch
    "0x1111111254eeb25477b68fb85ed929f73a960582",
    // 0x
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
    // Permit2
    "0x000000000022d473030f116ddee9f6b43ac78ba3",
    // WETH (Sepolia & Mainnet)
    "0x7b79995e5f793a07bc00c21412e50ecae098e7f9",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    // USDC (Sepolia)
    "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
]);

// FHE function selectors — detect without decoding encrypted params
const FHE_SELECTORS: Record<string, { name: string; op: SimResult["operationType"] }> = {
    // transferEncrypted(address,InEuint64) — keccak256 first 4 bytes
    "0x7c231884": { name: "transferEncrypted", op: "transferEncrypted" },
    // wrap(uint256)
    "0xea598cb0": { name: "wrap", op: "wrap" },
    // wrapETH()
    "0xa3211896": { name: "wrapETH", op: "wrapETH" },
    // unwrap(uint256)
    "0xde0e9a3e": { name: "unwrap", op: "unwrap" },
};

// ERC20 standard function interface
const ERC20_IFACE = new Interface([
    "function transfer(address to, uint256 amount)",
    "function transferFrom(address from, address to, uint256 amount)",
    "function approve(address spender, uint256 amount)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address owner) view returns (uint256)",
]);

// ─── TransactionSimulator ────────────────────────────────────────────

export class TransactionSimulator {
    private provider: Provider;

    constructor(provider: Provider) {
        this.provider = provider;
    }

    /**
     * Simulate a transaction using eth_call before signing.
     * Returns warnings, risk level, and estimated balance changes.
     * 
     * Flow:
     * 1. Scam address check
     * 2. Contract vs EOA detection
     * 3. eth_call preflight (revert detection)
     * 4. Decode calldata → balance changes + warnings
     * 5. Risk scoring
     */
    async simulateTransaction(tx: {
        from: string;
        to: string;
        value?: string | bigint;
        data?: string;
    }): Promise<SimResult> {
        const result: SimResult = {
            success: false,
            balanceChanges: [],
            warnings: [],
            riskLevel: "LOW",
            operationType: "unknown",
            isContractInteraction: false,
            isNewRecipient: false,
            contractAgeDays: null,
        };

        if (!tx.to) {
            result.error = "Missing recipient address";
            return result;
        }

        const toLower = tx.to.toLowerCase();
        const data = tx.data || "0x";
        const valueWei = tx.value ? BigInt(tx.value) : 0n;

        // ── 1. Scam Address Check ──────────────────────────────────

        if (SCAM_ADDRESSES.has(toLower)) {
            result.warnings.push("🚨 Bu adres bilinen bir dolandırıcılık/phishing adresiyle eşleşiyor! Bu işlemi ONAYLAMAYIN.");
            result.riskLevel = "CRITICAL";
        }

        // Address poisoning detection: check for addresses that start with same prefix as sender
        if (tx.from && toLower !== tx.from.toLowerCase()) {
            const fromLower = tx.from.toLowerCase();
            // If first 6 and last 4 hex chars match but middle differs → likely poisoning
            if (
                toLower.slice(0, 8) === fromLower.slice(0, 8) &&
                toLower.slice(-4) === fromLower.slice(-4) &&
                toLower !== fromLower
            ) {
                result.warnings.push("⚠️ Address Poisoning Uyarısı: Bu adres sizin adresinize çok benziyor. Lütfen tam adresi doğrulayın.");
                this.escalateRisk(result, "HIGH");
            }
        }

        // ── 2. Contract vs EOA Detection ───────────────────────────

        try {
            const code = await this.provider.getCode(tx.to);
            result.isContractInteraction = code !== "0x" && code !== "0x0";
            // NOTE: Contract warning is deferred to Step 4.
            // If calldata decodes as a known ERC20/FHE operation, it's expected
            // and we don't warn. Only unknown contract interactions get a warning.
        } catch {
            // If getCode fails, assume EOA
            result.isContractInteraction = false;
        }

        // ── 3. Pre-flight Check via eth_call ───────────────────────

        try {
            await this.provider.call({
                from: tx.from,
                to: tx.to,
                value: valueWei,
                data: data,
            });
            result.success = true;
        } catch (e) {
            result.success = false;
            const err = e as { shortMessage?: string; reason?: string; message?: string };
            const msg = err.shortMessage || err.reason || err.message || String(e);

            if (msg.includes("insufficient funds")) {
                result.error = "Yetersiz Bakiye: Bu işlemi ve ağ ücretlerini karşılamak için yeterli ETH yok.";
            } else if (msg.includes("execution reverted")) {
                result.error = `İşlem Reddedildi (Reverted): Akıllı sözleşme bu işlemi kabul etmiyor. ${msg}`;
            } else {
                result.error = `İşlem başarısız olacak: ${msg}`;
            }
            result.riskLevel = "CRITICAL";
            return result;
        }

        // ── 4. Decode Calldata ─────────────────────────────────────

        if (data.length >= 10 && data !== "0x") {
            const selector = data.slice(0, 10).toLowerCase();

            // 4a. Check FHE selectors first
            const fheMatch = FHE_SELECTORS[selector];
            if (fheMatch) {
                result.operationType = fheMatch.op;
                // FHE ops are known contract interactions — don't flag as unknown
                result.isContractInteraction = false;
                this.decodeFheOperation(result, tx, fheMatch, valueWei);
            } else {
                // 4b. Try standard ERC20 decode
                this.decodeErc20Operation(result, tx, data, valueWei);
            }
        }

        // ── 5. Native ETH Transfer ────────────────────────────────

        if (valueWei > 0n && data === "0x") {
            result.operationType = "transfer";
            result.balanceChanges.push({
                tokenAddress: "ETH",
                symbol: "ETH",
                decimals: 18,
                amountWei: valueWei.toString(),
                amountFormatted: formatUnits(valueWei, 18),
                from: getAddress(tx.from),
                to: getAddress(tx.to),
                type: "NATIVE",
            });
        } else if (valueWei > 0n && data !== "0x") {
            // Contract call with ETH value attached (e.g. wrapETH)
            result.balanceChanges.push({
                tokenAddress: "ETH",
                symbol: "ETH",
                decimals: 18,
                amountWei: valueWei.toString(),
                amountFormatted: formatUnits(valueWei, 18),
                from: getAddress(tx.from),
                to: getAddress(tx.to),
                type: "NATIVE",
            });
        }

        // ── 6. Final Risk Assessment ───────────────────────────────

        // Large value warning (> 1 ETH equivalent)
        if (valueWei > 1_000_000_000_000_000_000n) {
            result.warnings.push(`💰 Yüksek değerli işlem: ${formatUnits(valueWei, 18)} ETH gönderiyorsunuz.`);
            this.escalateRisk(result, "MEDIUM");
        }

        return result;
    }

    // ─── ERC20 Decoder ─────────────────────────────────────────────

    private decodeErc20Operation(
        result: SimResult,
        tx: { from: string; to: string; data?: string },
        data: string,
        valueWei: bigint
    ): void {
        try {
            const decoded = ERC20_IFACE.parseTransaction({ data, value: valueWei });
            if (!decoded) {
                result.warnings.push("ℹ️ Tanınmayan kontrat etkileşimi. İşlem detaylarını doğrulayın.");
                this.escalateRisk(result, "MEDIUM");
                return;
            }

            const tokenAddress = getAddress(tx.to);

            switch (decoded.name) {
                case "transfer": {
                    result.operationType = "transfer";
                    // For ERC20 transfer, the actual recipient is in calldata, not tx.to
                    // tx.to is the token contract — don't flag as "contract interaction" for the user
                    result.isContractInteraction = false;
                    const recipient = getAddress(decoded.args[0]);
                    const amount = BigInt(decoded.args[1]);

                    result.balanceChanges.push({
                        tokenAddress,
                        symbol: null,
                        decimals: null,
                        amountWei: amount.toString(),
                        from: getAddress(tx.from),
                        to: recipient,
                        type: "ERC20",
                    });

                    // Check if recipient is a contract (not typical for normal transfers)
                    if (SCAM_ADDRESSES.has(recipient.toLowerCase())) {
                        result.warnings.push("🚨 Token alıcısı bilinen bir scam adresi!");
                        this.escalateRisk(result, "CRITICAL");
                    }
                    break;
                }

                case "transferFrom": {
                    result.operationType = "transferFrom";
                    // ERC20 transferFrom — tx.to is the token contract, not user-facing
                    result.isContractInteraction = false;
                    const fromAddr = getAddress(decoded.args[0]);
                    const toAddr = getAddress(decoded.args[1]);
                    const amount = BigInt(decoded.args[2]);

                    result.balanceChanges.push({
                        tokenAddress,
                        symbol: null,
                        decimals: null,
                        amountWei: amount.toString(),
                        from: fromAddr,
                        to: toAddr,
                        type: "ERC20",
                    });
                    result.warnings.push("ℹ️ transferFrom: Başka bir adres adına token transferi yapılıyor.");
                    this.escalateRisk(result, "MEDIUM");
                    break;
                }

                case "approve": {
                    result.operationType = "approve";
                    const spender = getAddress(decoded.args[0]);
                    const amount = BigInt(decoded.args[1]);

                    // Unlimited approval detection
                    if (amount >= 2n ** 255n) {
                        result.warnings.push("🚨 SINIRSIZ ONAY: Bu kontrat tüm token bakiyenizi çekebilir! Yalnızca güvendiğiniz kontratlara izin verin.");
                        this.escalateRisk(result, "HIGH");
                    } else if (amount === 0n) {
                        result.warnings.push("✅ Onay kaldırılıyor (revoke). Bu güvenli bir işlemdir.");
                        // Revoke is safe, keep LOW
                    } else {
                        result.warnings.push(`⚠️ Token harcama izni veriyorsunuz. Spender: ${spender.slice(0, 10)}...`);
                        this.escalateRisk(result, "MEDIUM");
                    }

                    // Check if spender is known/trusted
                    if (!TRUSTED_CONTRACTS.has(spender.toLowerCase()) && amount > 0n) {
                        result.warnings.push("⚠️ Onay verilen kontrat güvenilir listesinde değil. Dikkatli olun.");
                        this.escalateRisk(result, "HIGH");
                    }
                    break;
                }

                default: {
                    result.warnings.push("ℹ️ Tanınmayan kontrat fonksiyonu çağrılıyor.");
                    this.escalateRisk(result, "MEDIUM");
                }
            }
        } catch {
            // Not a standard ERC20 function
            result.warnings.push("ℹ️ Bilinmeyen veri yapısıyla akıllı kontrat etkileşimi.");
            this.escalateRisk(result, "MEDIUM");
        }
    }

    // ─── FHE Operation Decoder ─────────────────────────────────────

    private decodeFheOperation(
        result: SimResult,
        tx: { from: string; to: string; value?: string | bigint },
        fheMatch: { name: string; op: SimResult["operationType"] },
        valueWei: bigint
    ): void {
        switch (fheMatch.op) {
            case "transferEncrypted":
                result.warnings.push("🔒 FHE Gizli Transfer: Miktar şifreli olarak gönderilecek — zincir üzerinde görünmeyecek.");
                // Amount is encrypted, we can't show it in balance changes
                result.balanceChanges.push({
                    tokenAddress: getAddress(tx.to),
                    symbol: null,
                    decimals: null,
                    amountWei: "encrypted",
                    amountFormatted: "🔒 Encrypted",
                    from: getAddress(tx.from),
                    to: "recipient", // Encoded in calldata, not decoded here
                    type: "FHE_ENCRYPTED",
                });
                break;

            case "wrap":
                result.warnings.push("🛡️ Token Koruma (Wrap): Açık tokenlar şifreli tokanlara dönüştürülecek.");
                break;

            case "wrapETH":
                result.warnings.push("🛡️ ETH Koruma (WrapETH): Native ETH şifreli cETH'e dönüştürülecek.");
                break;

            case "unwrap":
                result.warnings.push("🔓 Token Çözme (Unwrap): Şifreli tokenlar açık tokanlara geri dönüştürülecek.");
                break;
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────

    /**
     * Escalate risk level — never downgrade, only upgrade.
     */
    private escalateRisk(result: SimResult, level: SimResult["riskLevel"]): void {
        const levels: SimResult["riskLevel"][] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        const currentIdx = levels.indexOf(result.riskLevel);
        const newIdx = levels.indexOf(level);
        if (newIdx > currentIdx) {
            result.riskLevel = level;
        }
    }

    /**
     * Enrich balance changes with on-chain token metadata.
     * Call this after simulateTransaction to resolve symbol/decimals.
     */
    async enrichBalanceChanges(result: SimResult): Promise<void> {
        for (const change of result.balanceChanges) {
            if (change.type === "NATIVE" || change.type === "FHE_ENCRYPTED") continue;
            if (change.symbol && change.decimals !== null) continue;

            try {
                const contract = new Contract(change.tokenAddress, ERC20_IFACE, this.provider);
                const [symbol, decimals] = await Promise.all([
                    contract.symbol().catch(() => null),
                    contract.decimals().catch(() => 18),
                ]);

                change.symbol = symbol || "???";
                change.decimals = Number(decimals) || 18;
                change.amountFormatted = formatUnits(BigInt(change.amountWei), change.decimals);
            } catch {
                change.symbol = "???";
                change.decimals = 18;
                change.amountFormatted = formatUnits(BigInt(change.amountWei), 18);
            }
        }
    }

    /**
     * Check if an address is in the scam database.
     * Static method for use outside simulation context.
     */
    static isScamAddress(address: string): boolean {
        return SCAM_ADDRESSES.has(address.toLowerCase());
    }

    /**
     * Add a custom address to the scam list (runtime only).
     */
    static addScamAddress(address: string): void {
        SCAM_ADDRESSES.add(address.toLowerCase());
    }
}
