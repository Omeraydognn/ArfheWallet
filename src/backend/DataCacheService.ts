/**
 * DataCacheService — In-memory TTL cache for portfolio data
 * Prevents excessive API calls when navigating between pages.
 * 
 * - Balances + tokens: 60s TTL
 * - Prices: 120s TTL
 * - Manual refresh or WC tx: invalidate()
 */

interface CachedPortfolio {
    balances: Record<string, any>;
    tokens: any[];
    prices: Record<string, number>;
    totalUsd: number;
    balanceTimestamp: number;
    priceTimestamp: number;
}

const BALANCE_TTL_MS = 60_000;   // 60 seconds
const PRICE_TTL_MS = 120_000;    // 120 seconds

export class DataCacheService {
    private cache = new Map<string, CachedPortfolio>();

    private makeKey(address: string, networkId: string | number): string {
        return `${address.toLowerCase()}:${networkId}`;
    }

    /**
     * Get cached portfolio data if fresh.
     * Returns null if cache is stale or missing.
     */
    get(address: string, networkId: string | number): CachedPortfolio | null {
        const key = this.makeKey(address, networkId);
        const cached = this.cache.get(key);
        if (!cached) return null;

        const now = Date.now();
        const balanceFresh = (now - cached.balanceTimestamp) < BALANCE_TTL_MS;
        if (!balanceFresh) return null;

        return cached;
    }

    /**
     * Check if prices are still fresh (separate longer TTL).
     */
    arePricesFresh(address: string, networkId: string | number): boolean {
        const key = this.makeKey(address, networkId);
        const cached = this.cache.get(key);
        if (!cached) return false;
        return (Date.now() - cached.priceTimestamp) < PRICE_TTL_MS;
    }

    /**
     * Store portfolio data in cache.
     */
    set(
        address: string,
        networkId: string | number,
        data: {
            balances: Record<string, any>;
            tokens: any[];
            prices: Record<string, number>;
            totalUsd: number;
        }
    ): void {
        const key = this.makeKey(address, networkId);
        const now = Date.now();
        this.cache.set(key, {
            ...data,
            balanceTimestamp: now,
            priceTimestamp: now,
        });
    }

    /**
     * Invalidate cache. 
     * Called after sending transactions, WC approvals, etc.
     */
    invalidate(address?: string, networkId?: string | number): void {
        if (address && networkId !== undefined) {
            const key = this.makeKey(address, networkId);
            this.cache.delete(key);
        } else {
            // Clear all
            this.cache.clear();
        }
    }

    /**
     * Check how old the cache is (for debug/display).
     */
    getAge(address: string, networkId: string | number): number | null {
        const key = this.makeKey(address, networkId);
        const cached = this.cache.get(key);
        if (!cached) return null;
        return Date.now() - cached.balanceTimestamp;
    }
}

export default DataCacheService;
