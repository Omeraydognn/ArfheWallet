/**
 * useTokens — Access token cache data for the active network.
 *
 * Provides cached token metadata (name, symbol, decimals, logo) from TokenCache.
 * Does NOT trigger network calls — reads from cache populated by Home.tsx.
 *
 * Usage:
 *   const { tokens, getToken, nativeToken } = useTokens();
 */

import { useMemo } from "react";
import { useWallet } from "./useWallet.js";
import { useNetwork } from "./useNetwork.js";
import type { TokenCacheItem } from "../backend/TokenCache.js";

export interface UseTokensReturn {
  /** All cached tokens for the active network */
  tokens: TokenCacheItem[];
  /** Get a specific token by contract address */
  getToken: (contractAddress: string) => TokenCacheItem | undefined;
  /** The native token entry (ETH, etc.) */
  nativeToken: TokenCacheItem | undefined;
  /** Number of cached tokens */
  tokenCount: number;
}

export function useTokens(): UseTokensReturn {
  const wallet = useWallet();
  const { networkId } = useNetwork();

  const tokens = useMemo(
    () => wallet.tokenCache?.getAllTokens(networkId) ?? [],
    [wallet.tokenCache, networkId]
  );

  const getToken = useMemo(
    () => (contractAddress: string) =>
      wallet.tokenCache?.getToken(networkId, contractAddress),
    [wallet.tokenCache, networkId]
  );

  const nativeToken = useMemo(
    () => tokens.find(t => t.contractAddress === "ETH" || t.contractAddress === "NATIVE"),
    [tokens]
  );

  return {
    tokens,
    getToken,
    nativeToken,
    tokenCount: tokens.length,
  };
}

export default useTokens;
