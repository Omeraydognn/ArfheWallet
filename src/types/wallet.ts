/**
 * Shared wallet & token display types
 * Used across Home, Portfolio, DataCacheService, and other pages/components
 */

import type { TokenBalance } from "../backend/NetworkTypes.js";
import type { NFTCacheItem } from "../backend/NFTCache.js";

// ─── Token Display (used in Home.tsx token list) ───────────────────

/** A token enriched with spam/display metadata for the UI */
export interface DisplayToken {
  name: string;
  symbol: string;
  logoSrc: string;
  contractAddress: string;
  decimals: number;
  isShielded: boolean;
  isSpam: boolean;
  isSuspicious: boolean;
  isHidden: boolean;
  spamScore: number;
}

// ─── Balance Map (Home.tsx balance state) ──────────────────────────

/** Extended balance entry stored in the Home balanceMap */
export interface BalanceEntry extends TokenBalance {
  isShielded?: boolean;
  symbol?: string;
  name?: string;
}

export type BalanceMap = Record<string, BalanceEntry>;

// ─── Wrapped Balance (FHE shielded tokens) ────────────────────────

export interface WrappedBalance {
  contractAddress: string;
  tokenBalance: string;
  isNative: boolean;
  isShielded: boolean;
  priceUsd?: number;
  totalValueUsd?: number;
}

// ─── NFT Display (Home NFT tab) ──────────────────────────────────

export interface NFTDisplayItem extends NFTCacheItem {
  balance: number;
}

// ─── Cached Portfolio Data (DataCacheService) ─────────────────────

export interface CachedPortfolioData {
  balances: BalanceMap;
  tokens: DisplayToken[] | Array<{ name: string; symbol: string; logoSrc: string; contractAddress: string; decimals: number; isShielded?: boolean }>;
  prices: Record<string, number>;
  totalUsd: number;
}
