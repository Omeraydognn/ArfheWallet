import { NetworkId } from "./NetworkTypes.js";
import StorageManager from "./StorageManager.js";

export interface NFTCacheItem {
    contractAddress: string;
    name: string;
    symbol: string;
    logoSrc: string;
}

export default class NFTCache {
    private cache: Map<NetworkId, Map<string, NFTCacheItem>>;
    private storageManager?: StorageManager;
    private readonly STORAGE_KEY = 'arfhe_nft_cache';

    constructor(storageManager?: StorageManager) {
        this.cache = new Map();
        this.storageManager = storageManager;
        this.loadFromStorage();
    }

    private loadFromStorage() {
        if (!this.storageManager) return;

        const savedData = this.storageManager.getLocal<any>(this.STORAGE_KEY);
        if (savedData && typeof savedData === 'object') {
            try {
                Object.keys(savedData).forEach((netStr) => {
                    const netId = parseInt(netStr) as NetworkId;
                    const nftsObj = savedData[netStr];

                    const nftMap = new Map<string, NFTCacheItem>();
                    Object.keys(nftsObj).forEach((contract) => {
                        nftMap.set(contract, nftsObj[contract]);
                    });

                    this.cache.set(netId, nftMap);
                });
            } catch (e) {
                console.warn("Failed to parse saved NFT cache", e);
            }
        }
    }

    private saveToStorage() {
        if (!this.storageManager) return;

        try {
            const exportObj: any = {};
            this.cache.forEach((nftMap, netId) => {
                exportObj[netId] = {};
                nftMap.forEach((nft, contract) => {
                    exportObj[netId][contract] = nft;
                });
            });

            this.storageManager.setLocal(this.STORAGE_KEY, exportObj);
        } catch (e) {
            console.warn("Failed to save NFT cache", e);
        }
    }

    private getNetworkMap(networkId: NetworkId): Map<string, NFTCacheItem> {
        if (!this.cache.has(networkId)) {
            this.cache.set(networkId, new Map());
        }
        return this.cache.get(networkId)!;
    }

    setNFT(networkId: NetworkId, item: NFTCacheItem): void {
        const networkMap = this.getNetworkMap(networkId);
        networkMap.set(item.contractAddress.toLowerCase(), item);
        this.saveToStorage();
    }

    getNFT(networkId: NetworkId, contractAddress: string): NFTCacheItem | undefined {
        const networkMap = this.getNetworkMap(networkId);
        return networkMap.get(contractAddress.toLowerCase());
    }

    hasNFT(networkId: NetworkId, contractAddress: string): boolean {
        const networkMap = this.getNetworkMap(networkId);
        return networkMap.has(contractAddress.toLowerCase());
    }

    removeNFT(networkId: NetworkId, contractAddress: string): boolean {
        const networkMap = this.getNetworkMap(networkId);
        const result = networkMap.delete(contractAddress.toLowerCase());
        if (result) this.saveToStorage();
        return result;
    }

    getAllNFTs(networkId: NetworkId): NFTCacheItem[] {
        const networkMap = this.getNetworkMap(networkId);
        return Array.from(networkMap.values());
    }

    clearNetwork(networkId: NetworkId): void {
        this.cache.delete(networkId);
        this.saveToStorage();
    }

    clearAll(): void {
        this.cache.clear();
        if (this.storageManager) {
            this.storageManager.removeLocal(this.STORAGE_KEY);
        }
    }
}
