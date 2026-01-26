import { Alchemy, AssetTransfersCategory, AssetTransfersWithMetadataResult, Utils } from "alchemy-sdk";
import { isAddress, getAddress } from "ethers";

export interface TrackedTransaction {
    uniqueId: string;
    hash: string;
    from: string;
    to: string | null;
    value: number | string;
    formattedValue: string;
    blockNum: string;
    timestamp: string; // ISO string
    metadata: {
        blockTimestamp: string;
    };
    direction: 'Sent' | 'Received';
    status: 'Success' | 'Fail' | 'Reverted'; // Simplified status
    methodLabel: string; // 'Transfer', 'Swap', etc.
    errorReason?: string;
}

export interface ExplorerSearchResult {
    type: 'ADDRESS' | 'TRANSACTION' | 'BLOCK' | 'NOT_FOUND';
    data: any;
}

export interface GraphNode {
    id: string; // Address
    label: string;
    type: 'wallet' | 'contract' | 'exchange';
    value: number; // For styling size
}

export interface GraphEdge {
    source: string;
    target: string;
    value: number; // Float value
    asset: string; // 'ETH', 'USDC', etc.
    hash: string;
    direction: 'IN' | 'OUT';
    timestamp: string;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// Known Exchange Addresses (Simplified list for demo)
const KNOWN_EXCHANGES: Record<string, string> = {
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045': 'Vitalik', // Demo
    '0x28C6c06298d514Db089934071355E5743bf21d60': 'Binance 14',
    '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503': 'Binance 15',
    '0x503828976D22510aad0201ac7EC88293211D23Da': 'Coinbase 2',
    '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3': 'Coinbase 3',
    '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549': 'Binance 3',
    '0x0000000000000000000000000000000000000000': 'Null Address'
};

export class ExplorerService {
    private alchemy: Alchemy;

    constructor(alchemyInstance: Alchemy) {
        this.alchemy = alchemyInstance;
    }

    /**
     * Checks if the service is ready (has valid alchemy instance)
     */
    isReady(): boolean {
        return !!this.alchemy;
    }

    /**
     * Fetch formatted history for an address
     */
    async fetchHistory(address: string, pageKey?: string): Promise<{ transactions: TrackedTransaction[], pageKey?: string }> {
        if (!this.alchemy) throw new Error("Alchemy SDK not initialized");

        // Use conditional spreading to handle strict optional property types
        const params: any = {
            fromBlock: "0x0",
            toBlock: "latest",
            category: [
                AssetTransfersCategory.EXTERNAL,
                AssetTransfersCategory.ERC20,
            ],
            withMetadata: true,
            excludeZeroValue: false,
            maxCount: 20,
            fromAddress: address
        };

        if (pageKey) {
            params.pageKey = pageKey;
        }

        const response = await this.alchemy.core.getAssetTransfers({
            fromBlock: "0x0",
            toBlock: "latest",
            fromAddress: address,
            category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
            withMetadata: true,
            maxCount: 20,
            ...(pageKey ? { pageKey } : {})
        });

        // We will ignore `pageKey` for the complex merge scenario and just fetch recent "latest"

        const [sent, received] = await Promise.all([
            this.alchemy.core.getAssetTransfers({
                fromBlock: "0x0",
                toBlock: "latest",
                fromAddress: address,
                category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                withMetadata: true,
                maxCount: 50,
                order: 'desc' as any // Alchemy SDK might not strongly type 'desc' in all versions but it supports it
            }),
            this.alchemy.core.getAssetTransfers({
                fromBlock: "0x0",
                toBlock: "latest",
                toAddress: address,
                category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                withMetadata: true,
                maxCount: 50,
                order: 'desc' as any
            })
        ]);

        const all = [...sent.transfers, ...received.transfers];

        // Sort by time desc
        all.sort((a, b) => {
            return new Date(b.metadata.blockTimestamp).getTime() - new Date(a.metadata.blockTimestamp).getTime();
        });

        // Take top 30
        const displayed = all.slice(0, 30);

        const mapped = displayed.map(tx => this.mapTransferToTracked(tx, address));

        return {
            transactions: mapped,
            pageKey: undefined // disable pagination for mixed view for now
        };
    }

    /**
     * Fetch Graph Data: Nodes & Edges
     */
    async fetchGraphData(centerAddress: string): Promise<GraphData> {
        if (!this.alchemy) throw new Error("SDK missing");
        const address = centerAddress.toLowerCase();

        // 1. Fetch raw transfers (limit 100 as requested for performance)
        const [sent, received] = await Promise.all([
            this.alchemy.core.getAssetTransfers({
                fromBlock: "0x0",
                toBlock: "latest",
                fromAddress: address,
                category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                maxCount: 100, // Increased limit
                withMetadata: true,
                order: 'desc' as any
            }),
            this.alchemy.core.getAssetTransfers({
                fromBlock: "0x0",
                toBlock: "latest",
                toAddress: address,
                category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                maxCount: 100, // Increased limit
                withMetadata: true,
                order: 'desc' as any
            })
        ]);

        const allTransfers = [...sent.transfers, ...received.transfers];
        const uniqueNodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];

        // Add Center Node
        uniqueNodes.set(address, {
            id: address,
            label: "Me (" + address.slice(0, 6) + ")",
            type: 'wallet',
            value: 50
        });

        // Process Transfers
        for (const tx of allTransfers) {
            if (!tx.from || !tx.to) continue;
            const from = tx.from.toLowerCase();
            const to = tx.to.toLowerCase();
            const val = tx.value ?? 0;
            const isIncoming = to === address;
            const assetSymbol = tx.asset || 'ETH'; // Capture correct symbol

            // Ensure nodes exist
            [from, to].forEach(addr => {
                if (!uniqueNodes.has(addr)) {
                    // Try to get name if possible
                    let name = undefined;
                    try {
                        name = KNOWN_EXCHANGES[getAddress(addr)] // Check checksummed
                            || KNOWN_EXCHANGES[addr];
                    } catch { }

                    uniqueNodes.set(addr, {
                        id: addr,
                        label: name || `${addr.slice(0, 6)}...`,
                        type: name ? 'exchange' : 'wallet',
                        value: 10
                    });
                }
            });

            edges.push({
                source: from,
                target: to,
                value: val,
                asset: assetSymbol, // USE IT
                hash: tx.hash,
                direction: isIncoming ? 'IN' : 'OUT',
                timestamp: tx.metadata.blockTimestamp
            });
        }

        return {
            nodes: Array.from(uniqueNodes.values()),
            edges
        };
    }

    private mapTransferToTracked(tx: AssetTransfersWithMetadataResult, ownerAddress: string): TrackedTransaction {
        const isSent = tx.from.toLowerCase() === ownerAddress.toLowerCase();

        return {
            uniqueId: tx.uniqueId,
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value ?? 0,
            formattedValue: (tx.value ?? 0).toFixed(4) + " " + (tx.asset || "ETH"),
            blockNum: tx.blockNum,
            timestamp: tx.metadata.blockTimestamp,
            metadata: {
                blockTimestamp: tx.metadata.blockTimestamp
            },
            direction: isSent ? 'Sent' : 'Received',
            status: 'Success', // Asset transfers are mainly successful ones
            methodLabel: 'Transfer',
        };
    }


    /**
     * Unified Search
     */
    async search(queryInput: string): Promise<ExplorerSearchResult> {
        if (!this.alchemy) throw new Error("SDK missing");

        // Explicitly type query as string
        const query: string = queryInput.trim();

        // 1. Check if Address
        if (isAddress(query)) {
            return { type: 'ADDRESS', data: query };
        }

        // 2. Check if Tx Hash
        if (query.length === 66 && query.startsWith("0x")) {
            const tx = await this.alchemy.core.getTransaction(query);
            if (tx) {
                return { type: 'TRANSACTION', data: tx };
            }
        }

        // 3. Check if Block Number (numeric)
        if (/^\d+$/.test(query)) {
            const block = await this.alchemy.core.getBlock(parseInt(query));
            if (block) {
                return { type: 'BLOCK', data: block };
            }
        }

        return { type: 'NOT_FOUND', data: null };
    }

    async getTransactionDetails(hash: string) {
        return this.alchemy.core.getTransaction(hash);
    }
}
