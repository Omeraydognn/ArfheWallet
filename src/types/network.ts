/**
 * Shared network & RPC types
 * Used across Network.ts, History.tsx, and other backend/page files
 */

// ─── JSON-RPC Types ───────────────────────────────────────────────

/** Generic JSON-RPC call parameters */
export type RpcParams = unknown[];

// ─── Transaction Request (for sendTransaction) ───────────────────

/** Transaction options passed to Network.sendTransaction() */
export interface TransactionRequest {
  to: string;
  value: string;
  data?: string;
  gasLimit?: string | bigint;
  gasPrice?: string;
  gasMultiplier?: number;
}

// ─── Ethereum Log (from eth_getLogs RPC) ──────────────────────────

/** Raw Ethereum log entry returned by eth_getLogs */
export interface EthLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  removed: boolean;
}

// ─── Transaction Data (from eth_getTransactionByHash) ─────────────

/** Raw transaction data returned by eth_getTransactionByHash */
export interface RawTransactionData {
  hash: string;
  nonce: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  input: string;
  blockNumber: string | null;
  blockHash: string | null;
  transactionIndex: string | null;
}

// ─── Explorer Search Data ─────────────────────────────────────────

/** Data payload for ExplorerSearchResult */
export interface ExplorerSearchData {
  address?: string;
  hash?: string;
  blockNumber?: number;
  balance?: string;
  txCount?: number;
  isContract?: boolean;
}

// ─── Explorer API Params ──────────────────────────────────────────

/** Alchemy asset transfer request params */
export interface AssetTransferParams {
  fromBlock: string;
  toBlock: string;
  category: string[];
  withMetadata: boolean;
  excludeZeroValue: boolean;
  maxCount: number;
  fromAddress?: string;
  toAddress?: string;
  pageKey?: string;
}
