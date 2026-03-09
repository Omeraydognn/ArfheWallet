/**
 * Shared FHE (Fully Homomorphic Encryption) types
 * Used across FheCofheService.ts and related files
 */

// ─── Abstract Provider (cofhejs adapter) ──────────────────────────

/** cofhejs AbstractProvider built from ethers JsonRpcProvider */
export interface AbstractProvider {
  getChainId: () => Promise<string>;
  call: (transaction: { to?: string; data?: string }) => Promise<string>;
  send: (method: string, params: unknown[]) => Promise<unknown>;
}

// ─── Abstract Signer (cofhejs adapter) ────────────────────────────

/** cofhejs AbstractSigner built from ethers Wallet */
export interface AbstractSigner {
  getAddress: () => Promise<string>;
  signTypedData: (
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ) => Promise<string>;
  provider: AbstractProvider;
  sendTransaction: (tx: { to?: string; value?: bigint; data?: string }) => Promise<{ hash: string }>;
}
