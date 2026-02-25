
export enum NetworkId {
    Unknown = -1,
    Ethereum_Mainnet = 1,
    Zama = 2,
    Fhenix = 3,
    Ethereum_Sepolia = 4,
    Ethereum_Hoodi = 5,
    Fhenix_Sepolia = 8008135, // Fhenix Sepolia Testnet
    Arbitrum_One = 42161,
    Arbitrum_Sepolia = 421614,
    Base_Mainnet = 8453,
    Base_Sepolia = 84532,
}

export type TokenBalance = {
    contractAddress: string;   // "ETH" for native
    tokenBalance: string;      // human-readable string
    isNative: boolean;         // true if ETH, false if ERC20
    priceUsd?: number;         // Price in USD
    totalValueUsd?: number;    // Total value in USD
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
    status: "Success" | "Fail";
    explorerUrl: string;
    isShielded: boolean;       // true if interaction with cETH/cUSDC FHE contracts
    methodLabel: string;       // "Transfer" | "Wrap" | "Unwrap" | "Shield Transfer" | "Approve" etc.
};

export type TokenWithMetadata = TokenBalance & {
    name: string;
    symbol: string;
    decimals: number;
    logoSrc: string;
};
