/**
 * SpamFilter.ts — Spam Token & NFT Detection + Filtering
 *
 * Features:
 * 1. Known spam token contract blocklist
 * 2. Heuristic spam scoring (symbol patterns, decimal anomalies, honeypot names)
 * 3. Manual "hide" / "unhide" per network per token (persisted in localStorage)
 * 4. "Suspicious" badge for newly appeared unknown tokens
 * 5. NFT spam: phishing link detection in metadata
 *
 * IMPORTANT: This module is purely filtering/UI-based.
 * It does NOT touch FHE encryption, private keys, or on-chain data.
 */

import StorageManager from "./StorageManager.js";
import { NetworkId } from "./NetworkTypes.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface SpamCheckResult {
  /** Is this token flagged as spam? */
  isSpam: boolean;
  /** Is this token suspicious (not confirmed spam, but sketchy)? */
  isSuspicious: boolean;
  /** Was this token manually hidden by the user? */
  isHidden: boolean;
  /** Spam confidence score 0–100 (higher = more likely spam) */
  score: number;
  /** Human-readable reasons for the score */
  reasons: string[];
}

export interface NFTSpamCheckResult {
  isSpam: boolean;
  hasPhishingLink: boolean;
  reasons: string[];
}

// ─── Known Spam Token Contracts ─────────────────────────────────────
// Lowercase addresses of confirmed spam/scam tokens across networks.
// These are auto-hidden regardless of score.

const KNOWN_SPAM_CONTRACTS: Set<string> = new Set([
  // ── Ethereum Mainnet Scam Tokens ──
  "0x0000000000004946c0e9f43f4dee607b0ef1fa1c", // Chi Gas Token (spam airdrop)
  "0xf2bb6b94afad54d72e43cf84c46fb8e3ded3c8b8", // Fake Uniswap airdrop
  "0xbbd1706d16418bb136e1497a73d3af4164586da0", // Spam token
  "0x88dae0672cbbcee0a8e3d3e4c3e5e8ad73d8c444", // Spam airdrop
  "0x2b0fde4f1b272e7c8e5d2c7e8e1cfbf3e5ea3a9d", // Fake ETH reward
  "0xb5ea6b6c7f7e8a9f3c5d2a1b0e6f4c3d2a1b0e6f", // Generic spam
]);

// ─── Spam Name / Symbol Patterns ────────────────────────────────────
// Regex patterns that indicate probable spam tokens

// ─── Whitelisted Token Symbols ──────────────────────────────────────
// These symbols are NEVER flagged as spam regardless of any other signal.
const WHITELISTED_SYMBOLS: Set<string> = new Set([
  "ETH", "WETH", "USDC", "USDT", "DAI", "EURC", "WBTC", "BTC",
  "LINK", "UNI", "AAVE", "ARB", "OP", "MATIC", "POL",
  "AVAX", "BNB", "SOL", "DOGE", "SHIB", "PEPE",
  "MKR", "CRV", "COMP", "LDO", "SNX", "MON",
  "cETH", "cUSDC",  // FHE wrapped tokens
]);

const SPAM_NAME_PATTERNS: RegExp[] = [
  /free\s*(claim|mint|airdrop|reward)/i,
  /claim\s*(reward|token|now|free|at|on|your)/i,
  /airdrop\s*(claim|free|reward|token)/i,
  /visit\s*(https?:\/\/|www\.)/i,
  /https?:\/\//i,                         // URL in token name
  /www\./i,                               // URL in token name
  /\.com|\.io|\.xyz|\.org|\.net/i,        // Domain in token name
  /\$\d+.*reward/i,                       // "$1000 Reward"
  /you\s*(won|received|earned)/i,
  /congratulations/i,
  /uniswap.*airdrop/i,
  /opensea.*reward/i,
  /metamask.*claim/i,
  /eligible\s*for/i,
  /swap.*at.*\.com/i,
];

const SPAM_SYMBOL_PATTERNS: RegExp[] = [
  /https?/i,           // URL in symbol
  /\.com|\.io|\.xyz/i, // Domain in symbol
  /claim|free|airdrop|visit|reward/i,
  /^.{20,}$/,          // Extremely long symbols (>20 chars)
];

// ─── Phishing Link Patterns (for NFTs) ──────────────────────────────

const PHISHING_LINK_PATTERNS: RegExp[] = [
  /claim.*token/i,
  /free.*mint/i,
  /airdrop.*claim/i,
  /metamask.*verify/i,
  /connect.*wallet/i,
  /approve.*token/i,
  /swap.*reward/i,
];

const PHISHING_DOMAINS: Set<string> = new Set([
  "uniswapp.com",
  "opensea-rewards.com",
  "metamask-claim.com",
  "airdrop-claim.xyz",
  "free-mint.com",
  "claim-rewards.xyz",
  "token-approval.com",
  "defi-rewards.com",
  "nft-mint-free.com",
]);

// ─── SpamFilter Class ───────────────────────────────────────────────

export default class SpamFilter {
  private storageManager?: StorageManager;
  private readonly HIDDEN_KEY = "arfhe_hidden_tokens";
  private readonly KNOWN_KEY = "arfhe_known_tokens";

  // Per-network sets of manually hidden contract addresses (lowercase)
  private hiddenTokens: Map<number, Set<string>> = new Map();
  // Per-network sets of "previously seen" contract addresses (to detect new tokens)
  private knownTokens: Map<number, Set<string>> = new Map();

  constructor(storageManager?: StorageManager) {
    this.storageManager = storageManager;
    this.loadFromStorage();
  }

  // ─── Core Check ──────────────────────────────────────────────────

  /**
   * Evaluate a token for spam indicators.
   *
   * @param networkId   Current network
   * @param contract    Token contract address (lowercase)
   * @param symbol      Token symbol
   * @param name        Token name
   * @param decimals    Token decimals
   * @param hasAlchemyLogo  Whether Alchemy returned a logo for this token
   * @param isAlchemySpam   Whether Alchemy flagged this contract as spam
   */
  checkToken(
    networkId: NetworkId | number,
    contract: string,
    symbol: string,
    name: string,
    decimals: number,
    hasAlchemyLogo: boolean = false,
    isAlchemySpam: boolean = false,
  ): SpamCheckResult {
    const lowerContract = contract.toLowerCase();

    const result: SpamCheckResult = {
      isSpam: false,
      isSuspicious: false,
      isHidden: this.isTokenHidden(networkId, lowerContract),
      score: 0,
      reasons: [],
    };

    // ── 0. Native token is never spam ──
    if (contract === "ETH" || contract === "NATIVE") return result;

    // ── 0.5 Whitelisted symbol → never spam ──
    if (WHITELISTED_SYMBOLS.has(symbol) || WHITELISTED_SYMBOLS.has(symbol.toUpperCase())) return result;

    // ── 1. Alchemy spam classification → high confidence flag ──
    if (isAlchemySpam) {
      result.score += 60;
      result.reasons.push("Flagged as spam by Alchemy");
    }

    // ── 2. Known spam contract → instant flag ──
    if (KNOWN_SPAM_CONTRACTS.has(lowerContract)) {
      result.isSpam = true;
      result.isHidden = true; // Auto-hide
      result.score = 100;
      result.reasons.push("Known spam contract");
      this.hideToken(networkId, lowerContract); // Persist
      return result;
    }

    // ── 3. Name-based spam patterns ──
    for (const pattern of SPAM_NAME_PATTERNS) {
      if (pattern.test(name)) {
        result.score += 40;
        result.reasons.push(`Suspicious name pattern: "${name}"`);
        break; // Only count name once
      }
    }

    // ── 4. Symbol-based spam patterns ──
    for (const pattern of SPAM_SYMBOL_PATTERNS) {
      if (pattern.test(symbol)) {
        result.score += 35;
        result.reasons.push(`Suspicious symbol: "${symbol}"`);
        break;
      }
    }

    // ── 5. Decimal anomalies ──
    // Most legit tokens use 18, 8, 6, or 0 decimals
    if (decimals > 24 || (decimals > 0 && decimals < 4 && decimals !== 2)) {
      result.score += 15;
      result.reasons.push(`Unusual decimals: ${decimals}`);
    }

    // ── 6. Very long or empty name ──
    if (name.length > 50) {
      result.score += 20;
      result.reasons.push("Excessively long token name");
    }
    if (!name || name === "Unknown Token") {
      result.score += 10;
      result.reasons.push("Missing token name");
    }

    // ── 7. No Alchemy logo ──
    // Legitimate tokens almost always have an Alchemy logo on established networks
    if (!hasAlchemyLogo) {
      result.score += 5;
      result.reasons.push("No verified logo source");
    }

    // ── 8. New/unseen token → "suspicious" badge ──
    const isNew = !this.isTokenKnown(networkId, lowerContract);
    if (isNew) {
      result.isSuspicious = true;
      result.score += 10;
      result.reasons.push("Newly appeared token");
      // Mark as known for future visits
      this.markTokenKnown(networkId, lowerContract);
    }

    // ── Determine final flags ──
    result.score = Math.min(result.score, 100);
    if (result.score >= 60) {
      result.isSpam = true;
      result.isHidden = true;
      this.hideToken(networkId, lowerContract);
    } else if (result.score >= 25) {
      result.isSuspicious = true;
    }

    return result;
  }

  // ─── NFT Spam Check ──────────────────────────────────────────────

  /**
   * Check NFT metadata for phishing links and spam patterns.
   *
   * @param name        NFT collection name
   * @param description NFT description (may contain phishing URLs)
   * @param externalUrl External URL from metadata
   */
  checkNFT(name: string, description?: string, externalUrl?: string): NFTSpamCheckResult {
    const result: NFTSpamCheckResult = {
      isSpam: false,
      hasPhishingLink: false,
      reasons: [],
    };

    const textToCheck = `${name} ${description ?? ""} ${externalUrl ?? ""}`;

    // Check phishing link patterns
    for (const pattern of PHISHING_LINK_PATTERNS) {
      if (pattern.test(textToCheck)) {
        result.isSpam = true;
        result.hasPhishingLink = true;
        result.reasons.push(`Phishing pattern detected in metadata`);
        break;
      }
    }

    // Check for phishing domains in URLs
    const urlRegex = /https?:\/\/([^\s\/\)"']+)/gi;
    let match;
    while ((match = urlRegex.exec(textToCheck)) !== null) {
      const domain = match[1].toLowerCase();
      if (PHISHING_DOMAINS.has(domain)) {
        result.isSpam = true;
        result.hasPhishingLink = true;
        result.reasons.push(`Known phishing domain: ${domain}`);
      }
    }

    // Name-based spam (same patterns as tokens)
    for (const pattern of SPAM_NAME_PATTERNS) {
      if (pattern.test(name)) {
        result.isSpam = true;
        result.reasons.push(`Spam NFT name pattern: "${name}"`);
        break;
      }
    }

    return result;
  }

  // ─── Manual Hide / Unhide ────────────────────────────────────────

  hideToken(networkId: NetworkId | number, contractAddress: string): void {
    const key = Number(networkId);
    if (!this.hiddenTokens.has(key)) this.hiddenTokens.set(key, new Set());
    this.hiddenTokens.get(key)!.add(contractAddress.toLowerCase());
    this.saveToStorage();
  }

  unhideToken(networkId: NetworkId | number, contractAddress: string): void {
    const key = Number(networkId);
    const set = this.hiddenTokens.get(key);
    if (set) {
      set.delete(contractAddress.toLowerCase());
      this.saveToStorage();
    }
  }

  isTokenHidden(networkId: NetworkId | number, contractAddress: string): boolean {
    const key = Number(networkId);
    return this.hiddenTokens.get(key)?.has(contractAddress.toLowerCase()) ?? false;
  }

  /**
   * Get all manually hidden contract addresses for a network.
   */
  getHiddenTokens(networkId: NetworkId | number): string[] {
    const key = Number(networkId);
    return Array.from(this.hiddenTokens.get(key) ?? []);
  }

  // ─── Known Token Tracking ────────────────────────────────────────

  private isTokenKnown(networkId: NetworkId | number, contractAddress: string): boolean {
    const key = Number(networkId);
    return this.knownTokens.get(key)?.has(contractAddress.toLowerCase()) ?? false;
  }

  private markTokenKnown(networkId: NetworkId | number, contractAddress: string): void {
    const key = Number(networkId);
    if (!this.knownTokens.has(key)) this.knownTokens.set(key, new Set());
    this.knownTokens.get(key)!.add(contractAddress.toLowerCase());
    this.saveKnownToStorage();
  }

  /**
   * Register an array of contracts as "known" — call this after first successful balance load.
   */
  markAllKnown(networkId: NetworkId | number, contracts: string[]): void {
    const key = Number(networkId);
    if (!this.knownTokens.has(key)) this.knownTokens.set(key, new Set());
    const set = this.knownTokens.get(key)!;
    for (const c of contracts) {
      set.add(c.toLowerCase());
    }
    this.saveKnownToStorage();
  }

  // ─── Persistence ─────────────────────────────────────────────────

  private loadFromStorage(): void {
    if (!this.storageManager) return;

    // Hidden tokens
    const hidden = this.storageManager.getLocal<Record<string, string[]>>(this.HIDDEN_KEY);
    if (hidden && typeof hidden === "object") {
      for (const [netStr, addrs] of Object.entries(hidden)) {
        this.hiddenTokens.set(Number(netStr), new Set(addrs));
      }
    }

    // Known tokens
    const known = this.storageManager.getLocal<Record<string, string[]>>(this.KNOWN_KEY);
    if (known && typeof known === "object") {
      for (const [netStr, addrs] of Object.entries(known)) {
        this.knownTokens.set(Number(netStr), new Set(addrs));
      }
    }
  }

  private saveToStorage(): void {
    if (!this.storageManager) return;
    const obj: Record<string, string[]> = {};
    this.hiddenTokens.forEach((set, netId) => {
      obj[String(netId)] = Array.from(set);
    });
    this.storageManager.setLocal(this.HIDDEN_KEY, obj);
  }

  private saveKnownToStorage(): void {
    if (!this.storageManager) return;
    const obj: Record<string, string[]> = {};
    this.knownTokens.forEach((set, netId) => {
      obj[String(netId)] = Array.from(set);
    });
    this.storageManager.setLocal(this.KNOWN_KEY, obj);
  }

  // ─── Public Utilities ────────────────────────────────────────────

  /**
   * Add a contract to the known spam list at runtime.
   */
  addToSpamList(contractAddress: string): void {
    KNOWN_SPAM_CONTRACTS.add(contractAddress.toLowerCase());
  }

  /**
   * Reset all hidden tokens for a specific network.
   */
  resetHiddenForNetwork(networkId: NetworkId | number): void {
    this.hiddenTokens.delete(Number(networkId));
    this.saveToStorage();
  }

  /**
   * Clear all data (for testing or full reset).
   */
  clearAll(): void {
    this.hiddenTokens.clear();
    this.knownTokens.clear();
    if (this.storageManager) {
      this.storageManager.removeLocal(this.HIDDEN_KEY);
      this.storageManager.removeLocal(this.KNOWN_KEY);
    }
  }
}
