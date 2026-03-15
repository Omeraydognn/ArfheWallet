/**
 * useBalance — Access cached portfolio balance data without refetching.
 *
 * Reads from DataCacheService (populated by Home.tsx fetchData).
 * Ideal for components that need balance info without triggering network calls.
 *
 * Usage:
 *   const { totalUsd, prices, balances, hasCachedData } = useBalance();
 */

import { useState, useEffect, useMemo } from "react";
import { useWallet } from "./useWallet.js";
import { useNetwork } from "./useNetwork.js";
import { useAccount } from "./useAccount.js";
import type { TokenBalance } from "../backend/NetworkTypes.js";

/** Extended balance record with runtime metadata */
type BalanceRecord = TokenBalance & {
  isShielded?: boolean;
  priceUsd?: number;
  totalValueUsd?: number;
  [key: string]: unknown;
};

export interface UseBalanceReturn {
  /** Total portfolio value in USD */
  totalUsd: number;
  /** Token prices by address */
  prices: Record<string, number>;
  /** Balance records by contract address */
  balances: Record<string, BalanceRecord>;
  /** Whether cached data is available */
  hasCachedData: boolean;
  /** Cache age in seconds (or null if no cache) */
  cacheAgeSeconds: number | null;
}

export function useBalance(): UseBalanceReturn {
  const wallet = useWallet();
  const { networkId } = useNetwork();
  const { address } = useAccount();

  const cached = useMemo(() => {
    if (!address || !wallet.dataCacheService) return null;
    return wallet.dataCacheService.get(address, networkId);
  }, [address, networkId, wallet.dataCacheService]);

  const cacheAgeSeconds = useMemo(() => {
    if (!address || !wallet.dataCacheService) return null;
    const age = wallet.dataCacheService.getAge(address, networkId);
    return age !== null && age !== undefined ? Math.round(age / 1000) : null;
  }, [address, networkId, wallet.dataCacheService]);

  return {
    totalUsd: cached?.totalUsd ?? 0,
    prices: cached?.prices ?? {},
    balances: (cached?.balances ?? {}) as Record<string, BalanceRecord>,
    hasCachedData: cached !== null,
    cacheAgeSeconds,
  };
}

export default useBalance;
