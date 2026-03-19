
export enum NetworkId {
    Unknown = -1,
    Ethereum_Mainnet = 1,
    Zama = 2,
    Ethereum_Sepolia = 4,
    Ethereum_Hoodi = 5,
    Optimism = 10,
    BNB_Chain = 56,
    Polygon = 137,
    Sei = 1329,
    Monad_Testnet = 10143,
    Arbitrum_One = 42161,
    Arbitrum_Sepolia = 421614,
    Base_Mainnet = 8453,
    Base_Sepolia = 84532,
    Avalanche = 43114,
    Avalanche_Fuji = 43113,
    Linea = 59144,
}

export type TokenBalance = {
    contractAddress: string;   // "ETH" for native
    tokenBalance: string;      // human-readable string
    isNative: boolean;         // true if ETH, false if ERC20
    priceUsd?: number;         // Price in USD
    totalValueUsd?: number;    // Total value in USD
    isAlchemySpam?: boolean;   // true if Alchemy flagged this as spam
};

export type TransactionHistory = {
    hash: string;              // Transaction hash
    from: string;              // Sender address
    to: string;                // Receiver address
    contractAddress: string;   // "ETH" for native, otherwise token contract
    value: string;             // Human-readable value (ETH or token amount)
    timestamp: string;         // ISO timestamp of the block
    blockNum: string;          // Hex block number for pagination
    isNative: boolean;         // true if native token (ETH), false if ERC20
    status: "Success" | "Fail" | "Pending";
    explorerUrl: string;
    isShielded: boolean;       // true if interaction with cETH/cUSDC FHE contracts
    methodLabel: string;       // "Transfer" | "Wrap" | "Unwrap" | "Shield Transfer" | "Approve" etc.
};

/** Tracks a pending transaction for speed-up / cancel support */
export type PendingTransaction = {
    hash: string;              // Original transaction hash
    nonce: number;             // Nonce used — critical for replacement
    from: string;              // Sender address
    to: string;                // Receiver address
    value: string;             // Value in wei (hex or decimal string)
    data: string;              // Calldata
    gasPrice?: string;         // Legacy gas price in wei
    maxFeePerGas?: string;     // EIP-1559 max fee in wei
    maxPriorityFeePerGas?: string; // EIP-1559 priority fee in wei
    timestamp: number;         // Unix ms when submitted
    networkId: NetworkId;      // Network this tx belongs to
};

export type TokenWithMetadata = TokenBalance & {
    name: string;
    symbol: string;
    decimals: number;
    logoSrc: string;
};

/**
 * Set of network IDs that support FHE (Fully Homomorphic Encryption) operations.
 * Currently only testnets — mainnet FHE will be added when contracts are deployed.
 */
export const FHE_NETWORK_IDS = new Set<NetworkId>([
    NetworkId.Ethereum_Sepolia,
    NetworkId.Arbitrum_Sepolia,
    NetworkId.Base_Sepolia,
]);

/** Check whether a given network supports FHE operations */
export function isFheNetwork(networkId: NetworkId): boolean {
    return FHE_NETWORK_IDS.has(networkId);
}

/** Set of testnet network IDs */
export const TESTNET_IDS = new Set<NetworkId>([
    NetworkId.Ethereum_Sepolia,
    NetworkId.Arbitrum_Sepolia,
    NetworkId.Base_Sepolia,
    NetworkId.Monad_Testnet,
    NetworkId.Avalanche_Fuji,
]);

/** Check whether a given network is a testnet */
export function isTestnetNetwork(networkId: NetworkId): boolean {
    return TESTNET_IDS.has(networkId);
}

/** User-defined custom network configuration (persisted in localStorage) */
export type CustomNetworkConfig = {
    chainId: number;           // EVM chain ID (used as NetworkId)
    networkName: string;       // Display name (e.g. "Polygon Mainnet")
    rpcUrl: string;            // JSON-RPC endpoint
    explorerUrl: string;       // Block explorer base URL (e.g. "https://polygonscan.com")
    currencySymbol: string;    // Native currency symbol (e.g. "MATIC")
    currencyDecimals?: number; // Native currency decimals (default 18)
    iconColor?: string;        // Dot color for network menu
};
