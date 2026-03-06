import { Interface, Provider, getAddress } from "ethers";

export interface BalanceChange {
    tokenAddress: string;
    symbol: string | null;
    decimals: number | null;
    amountWei: string;
    from: string;
    to: string;
    type: "ERC20" | "NATIVE";
}

export interface SimResult {
    success: boolean;
    error?: string;
    balanceChanges: BalanceChange[];
    warnings: string[];
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

// A generic list of known scam/phishing addresses. 
// In a real app, this should be fetched from a dynamic API like Blockaid or an actively maintained community list.
const SCAM_ADDRESSES = [
    "0x0000000000000000000000000000000000000000", // Zero address usually a mistake or burn
    "0x111111125434b319222cdbf8c261674a1b450000", // Known bad actor
    "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", // Known bad actor
];

export class TransactionSimulator {
    provider: Provider;

    constructor(provider: Provider) {
        this.provider = provider;
    }

    /**
     * Simulates a transaction using eth_call to check if it reverts,
     * then analyzes the input data to determine expected balance changes and risks.
     * 
     * @param tx The transaction object
     * @returns SimResult containing warnings, risk level, and estimated balance changes
     */
    async simulateTransaction(tx: { from: string, to: string, value?: string | bigint, data?: string }): Promise<SimResult> {
        const result: SimResult = {
            success: false,
            balanceChanges: [],
            warnings: [],
            riskLevel: "LOW",
        };

        if (!tx.to) {
            result.success = false;
            result.error = "Missing recipient address";
            return result;
        }

        // 1. Phishing / Scam Check
        if (SCAM_ADDRESSES.includes(tx.to.toLowerCase())) {
            result.warnings.push("🚨 URGENT: The destination address matches a known scam/phishing database!");
            result.riskLevel = "HIGH";
        }

        // 2. Pre-flight Check via eth_call
        try {
            await this.provider.call({
                from: tx.from,
                to: tx.to,
                value: tx.value || 0n,
                data: tx.data || "0x"
            });
            result.success = true;
        } catch (e: any) {
            result.success = false;
            let reason = e.shortMessage || e.message;
            if (reason.includes("insufficient funds")) {
                result.error = "Insufficient funds for gas + value. The transaction will fail.";
            } else {
                result.error = `Transaction will REVERT: ${reason}`;
            }
            result.riskLevel = "HIGH";
            return result; // If it reverts, execution will stop anyway
        }

        // 3. Decode Input Data for Balance Changes & Warnings
        const data = tx.data || "0x";
        const valueWei = tx.value ? BigInt(tx.value) : 0n;

        if (data.length >= 10 && data !== "0x") {
            try {
                const iface = new Interface([
                    "function transfer(address to, uint256 amount)",
                    "function transferFrom(address from, address to, uint256 amount)",
                    "function approve(address spender, uint256 amount)"
                ]);

                const decoded = iface.parseTransaction({ data, value: valueWei });
                if (decoded) {
                    const tokenAddress = getAddress(tx.to);

                    if (decoded.name === "transfer") {
                        result.balanceChanges.push({
                            tokenAddress,
                            symbol: null, // UI will resolve this
                            decimals: null,
                            amountWei: decoded.args[1].toString(),
                            from: getAddress(tx.from),
                            to: getAddress(decoded.args[0]),
                            type: "ERC20"
                        });
                    } else if (decoded.name === "transferFrom") {
                        result.balanceChanges.push({
                            tokenAddress,
                            symbol: null,
                            decimals: null,
                            amountWei: decoded.args[2].toString(),
                            from: getAddress(decoded.args[0]),
                            to: getAddress(decoded.args[1]),
                            type: "ERC20"
                        });
                    } else if (decoded.name === "approve") {
                        const amountToApprove = BigInt(decoded.args[1]);
                        // Check for infinite approval (typically max uint256)
                        if (amountToApprove >= (2n ** 255n)) {
                            result.warnings.push("⚠️ CRITICAL: You are granting UNLIMITED approval. This contract could drain your entire token balance.");
                            result.riskLevel = "HIGH";
                        } else {
                            result.warnings.push("⚠️ You are granting allowance to a contract to spend your tokens. Ensure you trust this contract.");
                            if (result.riskLevel === "LOW") result.riskLevel = "MEDIUM";
                        }
                    }
                } else {
                    result.warnings.push("Unrecognized contract interaction. Please verify the transaction details.");
                    if (result.riskLevel === "LOW") result.riskLevel = "MEDIUM";
                }
            } catch (e) {
                // Not a standard ERC20 function, ignore or add warning
                if (result.riskLevel === "LOW") result.riskLevel = "MEDIUM";
                result.warnings.push("You are interacting with a smart contract using an unknown data structure.");
            }
        }

        // Add Native ETH Transfer
        if (valueWei > 0n) {
            result.balanceChanges.push({
                tokenAddress: "ETH",
                symbol: "ETH",
                decimals: 18,
                amountWei: valueWei.toString(),
                from: getAddress(tx.from),
                to: getAddress(tx.to),
                type: "NATIVE"
            });
        }

        return result;
    }
}
