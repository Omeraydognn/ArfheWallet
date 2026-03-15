// TokenCache.ts

import { NetworkId } from "./NetworkTypes.js";
import StorageManager from "./StorageManager.js";

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
  private storageManager?: StorageManager;
  private readonly STORAGE_KEY = 'arfhe_token_cache';
  private readonly CACHE_VERSION_KEY = 'arfhe_token_cache_version';
  private readonly CURRENT_VERSION = 2;  // Bump this to invalidate cached logos

  constructor(storageManager?: StorageManager) {
    this.cache = new Map();
    this.storageManager = storageManager;
    this.migrateIfNeeded();
    this.loadFromStorage();
  }

  /**
   * Check cache version and clear stale logo data if version changed.
   * This ensures that when we fix logo URLs, old cached URLs get purged.
   */
  private migrateIfNeeded() {
    if (!this.storageManager) return;
    const savedVersion = this.storageManager.getLocal<number>(this.CACHE_VERSION_KEY);
    if (savedVersion !== this.CURRENT_VERSION) {
      // Version mismatch — clear the entire token cache so fresh data is fetched
      this.storageManager.removeLocal(this.STORAGE_KEY);
      this.storageManager.setLocal(this.CACHE_VERSION_KEY, this.CURRENT_VERSION);
    }
  }

  private loadFromStorage() {
    if (!this.storageManager) return;

    const savedData = this.storageManager.getLocal<Record<string, Record<string, TokenCacheItem>>>(this.STORAGE_KEY);
    if (savedData && typeof savedData === 'object') {
      try {
        // Deserialize JSON object back into Maps
        Object.keys(savedData).forEach((netStr) => {
          const netId = parseInt(netStr) as NetworkId;
          const tokensObj = savedData[netStr];

          const tokenMap = new Map<string, TokenCacheItem>();
          Object.keys(tokensObj).forEach((contract) => {
            tokenMap.set(contract, tokensObj[contract]);
          });

          this.cache.set(netId, tokenMap);
        });
      } catch (e) {
      }
    }
  }

  private saveToStorage() {
    if (!this.storageManager) return;

    try {
      // Serialize Maps into JSON object
      const exportObj: Record<string, Record<string, TokenCacheItem>> = {};
      this.cache.forEach((tokenMap, netId) => {
        exportObj[netId] = {};
        tokenMap.forEach((token, contract) => {
          exportObj[netId][contract] = token;
        });
      });

      this.storageManager.setLocal(this.STORAGE_KEY, exportObj);
    } catch (e) {
    }
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
    this.saveToStorage();
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
    const result = networkMap.delete(contractAddress.toLowerCase());
    if (result) this.saveToStorage();
    return result;
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
    this.saveToStorage();
  }

  /**
   * Clear the entire token cache across all networks
   */
  clearAll(): void {
    this.cache.clear();
    if (this.storageManager) {
      this.storageManager.removeLocal(this.STORAGE_KEY);
    }
  }
}
