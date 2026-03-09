/**
 * PhishingDetector — Domain-level phishing protection for WalletConnect dApps
 *
 * Checks dApp URLs against:
 * 1. Local blocklist of known phishing domains
 * 2. Fuzzy matching for common typosquatting patterns
 * 3. Suspicious TLD detection
 * 4. MetaMask's open-source phishing list (fetched periodically)
 *
 * IMPORTANT: This module is purely domain/URL-based.
 * It does NOT touch FHE encryption, private keys, or on-chain data.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface PhishingCheckResult {
    /** Is the domain flagged as phishing? */
    isPhishing: boolean;
    /** Risk level for UI coloring */
    riskLevel: "SAFE" | "SUSPICIOUS" | "DANGEROUS";
    /** Human-readable warnings (Turkish) */
    warnings: string[];
    /** Which check triggered the flag */
    source?: "blocklist" | "fuzzy" | "tld" | "metamask" | "newDomain";
    /** The domain that was checked */
    domain: string;
}

// ─── Local Blocklist ─────────────────────────────────────────────────
// Known phishing domains — extend as needed.
// In production, this should be periodically synced from MetaMask's list.

const LOCAL_BLOCKLIST: Set<string> = new Set([
    // Common phishing patterns
    "uniswapp.com",
    "uniswap-airdrop.com",
    "uniswap-claim.com",
    "uniswapv4.com",
    "opensea-rewards.com",
    "opensea-airdrop.com",
    "metamask-login.com",
    "metamask-wallet.com",
    "metamask-update.com",
    "metamask-verify.com",
    "metamask-support.org",
    "pancakeswap-finance.com",
    "aave-protocol.com",
    "aave-rewards.com",
    "compound-finance.com",
    "lido-staking.com",
    "lido-finance.org",
    "etherscan-verify.com",
    "collab-land.xyz",
    "collabland-verify.com",
    "wallet-connect.app",
    "walletconnect-bridge.com",
    "walletconnect-app.com",
    "dydx-airdrop.com",
    "arbitrum-airdrop.com",
    "arbitrum-claim.com",
    "optimism-claim.com",
    "base-bridge.org",
    "revoke-approvals.com",
    "approve-token.com",
    "eth-merge-claim.com",
    "nft-mint-free.com",
    "free-nft-drop.com",
    "claim-rewards.xyz",
    "token-approval.com",
    "defi-rewards.com",
    "arfhewallet-claim.com",
    "arfhe-airdrop.com",
]);

// ─── Trusted Domains (Allowlist) ─────────────────────────────────────
// These are always considered safe — skip all checks.

const TRUSTED_DOMAINS: Set<string> = new Set([
    "app.uniswap.org",
    "uniswap.org",
    "opensea.io",
    "lido.fi",
    "app.aave.com",
    "aave.com",
    "compound.finance",
    "app.compound.finance",
    "curve.fi",
    "1inch.io",
    "app.1inch.io",
    "pancakeswap.finance",
    "dydx.exchange",
    "etherscan.io",
    "arbiscan.io",
    "basescan.org",
    "polygonscan.com",
    "optimistic.etherscan.io",
    "safe.global",
    "app.safe.global",
    "metamask.io",
    "walletconnect.com",
    "relay.walletconnect.com",
    "bridge.walletconnect.org",
    "revoke.cash",
    "zapper.fi",
    "zerion.io",
    "debank.com",
    "snapshot.org",
    "ens.domains",
    "app.ens.domains",
    "gnosis-safe.io",
    "arfhewallet.com",
    "localhost",
    "127.0.0.1",
]);

// ─── Suspicious TLDs ────────────────────────────────────────────────
// These TLDs are commonly used for phishing domains.

const SUSPICIOUS_TLDS: Set<string> = new Set([
    ".xyz",
    ".top",
    ".click",
    ".club",
    ".buzz",
    ".gq",
    ".ml",
    ".tk",
    ".cf",
    ".ga",
    ".icu",
    ".cam",
    ".rest",
    ".monster",
    ".surf",
    ".bond",
    ".quest",
    ".sbs",
]);

// ─── Known Brand Names (for fuzzy/typosquat detection) ───────────────

const BRAND_NAMES: string[] = [
    "uniswap",
    "opensea",
    "metamask",
    "aave",
    "compound",
    "lido",
    "pancakeswap",
    "sushiswap",
    "curve",
    "1inch",
    "dydx",
    "arbitrum",
    "optimism",
    "ethereum",
    "etherscan",
    "walletconnect",
    "arfhe",
    "arfhewallet",
    "coinbase",
    "binance",
    "ledger",
    "trezor",
];

// ─── MetaMask Remote List Cache ──────────────────────────────────────

let metamaskBlacklist: Set<string> = new Set();
let metamaskFuzzyList: Set<string> = new Set();
let lastFetchTimestamp = 0;
const FETCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const METAMASK_PHISHING_CONFIG_URL =
    "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/master/src/config.json";

// ─── PhishingDetector ────────────────────────────────────────────────

export class PhishingDetector {
    /**
     * Check a dApp URL for phishing indicators.
     *
     * @param url The full URL or domain from dApp metadata
     * @returns PhishingCheckResult with risk assessment
     */
    static async checkDomain(url: string): Promise<PhishingCheckResult> {
        const domain = this.extractDomain(url);

        const result: PhishingCheckResult = {
            isPhishing: false,
            riskLevel: "SAFE",
            warnings: [],
            domain,
        };

        if (!domain) {
            result.warnings.push("⚠️ dApp URL'si bulunamadı.");
            result.riskLevel = "SUSPICIOUS";
            return result;
        }

        // ── 0. Trusted allowlist — skip everything ──
        if (TRUSTED_DOMAINS.has(domain) || TRUSTED_DOMAINS.has(domain.replace("www.", ""))) {
            return result; // SAFE
        }

        // ── 1. Local blocklist ──
        if (LOCAL_BLOCKLIST.has(domain) || LOCAL_BLOCKLIST.has(domain.replace("www.", ""))) {
            result.isPhishing = true;
            result.riskLevel = "DANGEROUS";
            result.source = "blocklist";
            result.warnings.push("🚨 BİLİNEN PHİSHİNG SİTESİ: Bu domain phishing veritabanında kayıtlı. Bağlantıyı ONAYLAMAYIN!");
            return result;
        }

        // ── 2. MetaMask remote list ──
        await this.ensureMetaMaskListLoaded();
        if (metamaskBlacklist.has(domain)) {
            result.isPhishing = true;
            result.riskLevel = "DANGEROUS";
            result.source = "metamask";
            result.warnings.push("🚨 MetaMask PHİSHİNG LİSTESİ: Bu domain MetaMask'ın açık kaynak phishing veritabanında kayıtlı!");
            return result;
        }
        if (metamaskFuzzyList.has(domain)) {
            result.isPhishing = true;
            result.riskLevel = "DANGEROUS";
            result.source = "metamask";
            result.warnings.push("🚨 MetaMask FUZZY TESPİT: Bu domain bilinen bir markayla karıştırılabilecek şekilde tasarlanmış!");
            return result;
        }

        // ── 3. Typosquatting / fuzzy match ──
        const fuzzyResult = this.checkFuzzyMatch(domain);
        if (fuzzyResult) {
            result.isPhishing = true;
            result.riskLevel = "DANGEROUS";
            result.source = "fuzzy";
            result.warnings.push(fuzzyResult);
            return result;
        }

        // ── 4. Suspicious TLD ──
        const tldWarning = this.checkSuspiciousTLD(domain);
        if (tldWarning) {
            result.riskLevel = "SUSPICIOUS";
            result.source = "tld";
            result.warnings.push(tldWarning);
            // Don't set isPhishing — just warn
        }

        // ── 5. Very new / short domain heuristic ──
        if (this.looksLikeRandomDomain(domain)) {
            result.riskLevel = "SUSPICIOUS";
            result.source = "newDomain";
            result.warnings.push("⚠️ Bu domain rastgele oluşturulmuş gibi görünüyor. Dikkatli olun.");
        }

        return result;
    }

    // ─── Domain Extraction ─────────────────────────────────────────

    static extractDomain(url: string): string {
        if (!url) return "";
        try {
            // Handle cases where URL might not have protocol
            let cleanUrl = url.trim();
            if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
                cleanUrl = "https://" + cleanUrl;
            }
            const parsed = new URL(cleanUrl);
            return parsed.hostname.toLowerCase();
        } catch {
            // Fallback: treat the whole string as domain
            return url.toLowerCase().replace(/^www\./, "").split("/")[0].split(":")[0];
        }
    }

    // ─── Fuzzy / Typosquatting Detection ───────────────────────────

    private static checkFuzzyMatch(domain: string): string | null {
        const domainBase = domain.replace(/\.(com|org|net|io|fi|xyz|app|co|me|dev|finance|exchange)$/, "");
        const cleanBase = domainBase.replace(/[^a-z0-9]/g, ""); // remove dashes/dots

        for (const brand of BRAND_NAMES) {
            // Skip if it's exactly the brand (would be in trusted list)
            if (cleanBase === brand) continue;

            // 1. Contains brand but has extra chars (e.g. "uniswapp", "uniswap-v4-claim")
            if (cleanBase.includes(brand) && cleanBase !== brand) {
                // Check if the trusted domain already covers this
                const isTrustedVariant = Array.from(TRUSTED_DOMAINS).some(td =>
                    td.includes(brand) && td.includes(domain)
                );
                if (isTrustedVariant) continue;

                return `🚨 TYPOSQUAT TESPİT: "${domain}" bilinen marka "${brand}" ile karıştırılabilecek şekilde tasarlanmış!`;
            }

            // 2. Levenshtein distance ≤ 2 (e.g. "umiswap", "uniiswap")
            if (this.levenshteinDistance(cleanBase, brand) <= 2 && cleanBase.length >= 4) {
                return `🚨 TYPOSQUAT TESPİT: "${domain}" — "${brand}" markasına çok benziyor (olası typosquatting)!`;
            }

            // 3. Homoglyph detection: common letter substitutions
            const homoglyphClean = cleanBase
                .replace(/0/g, "o")
                .replace(/1/g, "l")
                .replace(/3/g, "e")
                .replace(/4/g, "a")
                .replace(/5/g, "s")
                .replace(/rn/g, "m") // rn → m
                .replace(/vv/g, "w"); // vv → w

            if (homoglyphClean === brand && cleanBase !== brand) {
                return `🚨 HOMOGLYPH TESPİT: "${domain}" — "${brand}" markasını taklit ediyor (harf aldatması)!`;
            }
        }

        return null;
    }

    // ─── Suspicious TLD Check ──────────────────────────────────────

    private static checkSuspiciousTLD(domain: string): string | null {
        for (const tld of SUSPICIOUS_TLDS) {
            if (domain.endsWith(tld)) {
                return `⚠️ Şüpheli domain uzantısı: "${tld}" — Bu TLD sıklıkla phishing sitelerinde kullanılmaktadır.`;
            }
        }
        return null;
    }

    // ─── Random Domain Heuristic ───────────────────────────────────

    private static looksLikeRandomDomain(domain: string): boolean {
        const base = domain.split(".")[0];
        if (base.length < 4) return false;

        // High consonant ratio (e.g. "xkjvqz.com")
        const consonants = base.replace(/[aeiouy0-9\-]/g, "").length;
        const ratio = consonants / base.length;

        // If >80% consonants and length > 6, suspicious
        if (ratio > 0.8 && base.length > 6) return true;

        // Contains many numbers mixed with letters (e.g. "a3x9b2.com")
        const digitCount = (base.match(/\d/g) || []).length;
        if (digitCount >= 3 && base.length <= 10) return true;

        return false;
    }

    // ─── Levenshtein Distance ──────────────────────────────────────

    private static levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= a.length; i++) matrix[i] = [i];
        for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,       // deletion
                    matrix[i][j - 1] + 1,       // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }

        return matrix[a.length][b.length];
    }

    // ─── MetaMask Remote List ──────────────────────────────────────

    private static async ensureMetaMaskListLoaded(): Promise<void> {
        const now = Date.now();
        if (metamaskBlacklist.size > 0 && now - lastFetchTimestamp < FETCH_INTERVAL_MS) {
            return; // Cache is still fresh
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(METAMASK_PHISHING_CONFIG_URL, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) {
                return;
            }

            const config = await response.json();

            // MetaMask config has: blacklist[], fuzzylist[], whitelist[]
            if (Array.isArray(config.blacklist)) {
                metamaskBlacklist = new Set(config.blacklist.map((d: string) => d.toLowerCase()));
            }
            if (Array.isArray(config.fuzzylist)) {
                metamaskFuzzyList = new Set(config.fuzzylist.map((d: string) => d.toLowerCase()));
            }
            // Apply whitelist: remove whitelisted domains from blacklist
            if (Array.isArray(config.whitelist)) {
                for (const w of config.whitelist) {
                    metamaskBlacklist.delete(w.toLowerCase());
                    metamaskFuzzyList.delete(w.toLowerCase());
                }
            }

            lastFetchTimestamp = now;
        } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") {
            } else {
            }
            // Keep using local blocklist as fallback
        }
    }

    // ─── Public Utilities ──────────────────────────────────────────

    /**
     * Add a domain to the runtime blocklist.
     */
    static addToBlocklist(domain: string): void {
        LOCAL_BLOCKLIST.add(domain.toLowerCase());
    }

    /**
     * Add a domain to the trusted allowlist.
     */
    static addToAllowlist(domain: string): void {
        TRUSTED_DOMAINS.add(domain.toLowerCase());
    }

    /**
     * Quick synchronous check against local blocklist only (no network).
     * Use this for instant UI feedback before async check completes.
     */
    static quickCheck(url: string): boolean {
        const domain = this.extractDomain(url);
        if (!domain) return false;
        return LOCAL_BLOCKLIST.has(domain) || LOCAL_BLOCKLIST.has(domain.replace("www.", ""));
    }
}
