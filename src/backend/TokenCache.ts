// TokenCache.ts

import { NetworkId } from "./Network.js";

export interface TokenCacheItem {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  logoSrc: string;
}

export default class TokenCache {
  // Outer map: networkId → Inner map (contractAddress → TokenCacheItem)
  private cache: Map<NetworkId, Map<string, TokenCacheItem>>;

  constructor() {
    this.cache = new Map();
  }

  private getNetworkMap(networkId: NetworkId): Map<string, TokenCacheItem> {
    if (!this.cache.has(networkId)) {
      this.cache.set(networkId, new Map());
    }
    return this.cache.get(networkId)!;
  }

  /**
   * Add or update a token in the cache for a given network
   */
  setToken(networkId: NetworkId, item: TokenCacheItem): void {
    const networkMap = this.getNetworkMap(networkId);
    networkMap.set(item.contractAddress.toLowerCase(), item);
  }

  /**
   * Retrieve a token from the cache by its contract address on a specific network
   */
  getToken(networkId: NetworkId, contractAddress: string): TokenCacheItem | undefined {
    const networkMap = this.getNetworkMap(networkId);
    return networkMap.get(contractAddress.toLowerCase());
  }

  /**
   * Check if a token exists in the cache on a specific network
   */
  hasToken(networkId: NetworkId, contractAddress: string): boolean {
    const networkMap = this.getNetworkMap(networkId);
    return networkMap.has(contractAddress.toLowerCase());
  }

  /**
   * Remove a token from the cache for a specific network
   */
  removeToken(networkId: NetworkId, contractAddress: string): boolean {
    const networkMap = this.getNetworkMap(networkId);
    return networkMap.delete(contractAddress.toLowerCase());
  }

  /**
   * Get all cached tokens for a specific network
   */
  getAllTokens(networkId: NetworkId): TokenCacheItem[] {
    const networkMap = this.getNetworkMap(networkId);
    return Array.from(networkMap.values());
  }

  /**
   * Clear all tokens for a specific network
   */
  clearNetwork(networkId: NetworkId): void {
    this.cache.delete(networkId);
  }

  /**
   * Clear the entire token cache across all networks
   */
  clearAll(): void {
    this.cache.clear();
  }
}
