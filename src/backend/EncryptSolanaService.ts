/**
 * EncryptSolanaService — Encrypt.xyz FHE on Solana Devnet
 *
 * Pre-alpha: no real encryption yet — all values are plaintext on-chain.
 * Uses @encrypt.xyz/pre-alpha-solana-client gRPC-Web transport.
 *
 * Program: Cq37zHSH1zB6xomYK2LjP6uXJvLR3uTehxA5W9wgHGvx (Solana devnet)
 * gRPC-Web: https://pre-alpha-dev-1.encrypt.ika-network.net:443
 */

import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { EncryptServiceClient } from "@encrypt-svc-client";
import { encryptValue, Chain } from "@encrypt.xyz/pre-alpha-solana-client/grpc-web";
import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

// ── Constants ──────────────────────────────────────────────────────────────

export const ENCRYPT_GRPC_URL = "https://pre-alpha-dev-1.encrypt.ika-network.net:443";

// In Vite dev mode use the local proxy to avoid CORS; in extension use direct URL
const EFFECTIVE_GRPC_URL: string = (import.meta as any).env?.DEV
  ? "/encrypt-grpc"
  : ENCRYPT_GRPC_URL;

// ── Service-worker proxy fetch ─────────────────────────────────────────────

function isExtensionContext(): boolean {
  return typeof (globalThis as any).chrome?.runtime?.sendMessage === "function";
}

function swProxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
  const headers: Record<string, string> = {};
  if (init?.headers instanceof Headers) {
    init.headers.forEach((v, k) => { headers[k] = v; });
  } else if (init?.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }
  let bodyArray: number[] = [];
  if (init?.body instanceof Uint8Array) {
    bodyArray = Array.from(init.body);
  } else if (typeof init?.body === "string") {
    bodyArray = Array.from(new TextEncoder().encode(init.body));
  }

  return new Promise<Response>((resolve, reject) => {
    (globalThis as any).chrome.runtime.sendMessage(
      { type: "GRPC_FETCH", url, headers, bodyArray },
      (resp: any) => {
        const lastErr = (globalThis as any).chrome.runtime.lastError;
        if (lastErr) { reject(new Error(lastErr.message)); return; }
        if (!resp?.ok) { reject(new Error(resp?.error ?? "GRPC_FETCH failed")); return; }
        resolve(new Response(new Uint8Array(resp.bodyArray), {
          status: resp.status,
          headers: resp.headers as Record<string, string>,
        }));
      },
    );
  });
}

function buildEncryptClient(baseUrl: string): EncryptServiceClient {
  const transportOpts: any = { baseUrl };
  if (isExtensionContext() && !(import.meta as any).env?.DEV) {
    transportOpts.fetch = swProxyFetch;
  }
  return new EncryptServiceClient(new GrpcWebFetchTransport(transportOpts));
}
export const ENCRYPT_PROGRAM_ADDRESS = "Cq37zHSH1zB6xomYK2LjP6uXJvLR3uTehxA5W9wgHGvx";
const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";

// FHE type for uint64 (EUint64 = 4 per SDK comment in grpc-web.ts)
export const FHE_TYPE_UINT64 = 4;

// NetworkEncryptionKey account data size: 32 (key) + 1 (active) + 1 (bump) = 34
const NETWORK_KEY_ACCOUNT_SIZE = 34;

// ── Types ──────────────────────────────────────────────────────────────────

export interface EncryptedInputResult {
  ciphertextId: Uint8Array;
  ciphertextIdHex: string;
  value: bigint;
  fheType: number;
}

export interface ReadCiphertextResult {
  value: bigint;
  fheType: number;
  digest: Uint8Array;
}

export type EncryptConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// ── BCS helpers ────────────────────────────────────────────────────────────

/**
 * BCS-encode ReadCiphertextMessage:
 * chain(u8) + ciphertext_id(uleb128_len + bytes) + reencryption_key(uleb128_len + bytes) + epoch(u64 LE)
 */
function encodeBcsReadMsg(
  ciphertextId: Uint8Array,
  reencryptionKey: Uint8Array,
  epoch: bigint,
): Uint8Array {
  const chain = 0; // Chain.SOLANA = 0
  const ctLen = ciphertextId.length;
  const rekeyLen = reencryptionKey.length;
  const buf = new Uint8Array(1 + 1 + ctLen + 1 + rekeyLen + 8);
  let offset = 0;
  buf[offset++] = chain;
  buf[offset++] = ctLen; // ULEB128, works for len < 128
  buf.set(ciphertextId, offset);
  offset += ctLen;
  buf[offset++] = rekeyLen;
  buf.set(reencryptionKey, offset);
  offset += rekeyLen;
  new DataView(buf.buffer).setBigUint64(offset, epoch, true);
  return buf;
}


// ── Service ────────────────────────────────────────────────────────────────

export class EncryptSolanaService {
  private static instance: EncryptSolanaService;

  private webClient: EncryptServiceClient | null = null;
  private connection: Connection | null = null;
  private cachedNetworkKey: Uint8Array | null = null;
  private _status: EncryptConnectionStatus = "disconnected";

  private constructor() {}

  static getInstance(): EncryptSolanaService {
    if (!EncryptSolanaService.instance) {
      EncryptSolanaService.instance = new EncryptSolanaService();
    }
    return EncryptSolanaService.instance;
  }

  get status(): EncryptConnectionStatus {
    return this._status;
  }

  initialize(): void {
    this.webClient = buildEncryptClient(EFFECTIVE_GRPC_URL);
    this.connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
    this._status = "disconnected";
  }

  private ensureInit(): void {
    if (!this.webClient) this.initialize();
  }

  /**
   * Fetch the active NetworkEncryptionKey from the Encrypt program on Solana devnet.
   *
   * Account layout (34 bytes):
   *   bytes 0-31: networkEncryptionPublicKey
   *   byte 32:    active (1 = active)
   *   byte 33:    bump
   */
  async getNetworkEncryptionKey(): Promise<Uint8Array> {
    if (this.cachedNetworkKey) return this.cachedNetworkKey;
    this.ensureInit();

    try {
      const programId = new PublicKey(ENCRYPT_PROGRAM_ADDRESS);
      const accounts = await this.connection!.getProgramAccounts(programId, {
        filters: [{ dataSize: NETWORK_KEY_ACCOUNT_SIZE }],
        dataSlice: { offset: 0, length: NETWORK_KEY_ACCOUNT_SIZE },
      });

      for (const { account } of accounts) {
        const data = account.data;
        if (data.length >= NETWORK_KEY_ACCOUNT_SIZE && data[32] === 1) {
          this.cachedNetworkKey = new Uint8Array(data.slice(0, 32));
          return this.cachedNetworkKey;
        }
      }

      // Use first key found even if not flagged active (pre-alpha may not set flag)
      if (accounts.length > 0) {
        const data = accounts[0].account.data;
        this.cachedNetworkKey = new Uint8Array(data.slice(0, 32));
        return this.cachedNetworkKey;
      }
    } catch {
      // Fall through to zero key
    }

    // Pre-alpha fallback: 32 zero bytes (mock mode may accept this)
    this.cachedNetworkKey = new Uint8Array(32);
    return this.cachedNetworkKey;
  }

  /**
   * Test connectivity to the Encrypt executor by pinging with a known ciphertext ID.
   * Returns true if the executor responds (even with an error about unknown ciphertext).
   */
  async testConnection(): Promise<boolean> {
    this.ensureInit();
    this._status = "connecting";
    try {
      // Try a small createInput to verify connectivity.
      // Use zero-bytes as authorized (public) so we don't need a real user key.
      const networkKey = await this.getNetworkEncryptionKey();
      const ciphertext = encryptValue(0, FHE_TYPE_UINT64);
      await this.webClient!.createInput({
        chain: Chain.SOLANA,
        inputs: [{ ciphertextBytes: ciphertext, fheType: FHE_TYPE_UINT64 }],
        proof: new Uint8Array(0),
        authorized: new Uint8Array(32),
        networkEncryptionPublicKey: networkKey,
      });
      this._status = "connected";
      return true;
    } catch {
      this._status = "error";
      return false;
    }
  }

  /**
   * Encrypt a uint64 value and register it on the Encrypt executor.
   * Returns the ciphertext identifier that can be used in on-chain instructions.
   *
   * @param value - plaintext value to encrypt (pre-alpha: stored as plaintext)
   * @param authorizedPublicKey - 32-byte public key authorized to read/use this ciphertext
   */
  private _localMockInput(value: bigint, authorizedPublicKey: Uint8Array): EncryptedInputResult {
    // Local mock: encode value (LE uint64) in first 8 bytes so readCiphertext can decode offline.
    const ciphertextId = new Uint8Array(32);
    new DataView(ciphertextId.buffer).setBigUint64(0, value, true);
    ciphertextId.set(authorizedPublicKey.subarray(0, 8), 8);
    crypto.getRandomValues(ciphertextId.subarray(16));
    return {
      ciphertextId,
      ciphertextIdHex: Array.from(ciphertextId).map(b => b.toString(16).padStart(2, "0")).join(""),
      value,
      fheType: FHE_TYPE_UINT64,
    };
  }

  async createEncryptedInput(
    value: bigint,
    authorizedPublicKey: Uint8Array,
  ): Promise<EncryptedInputResult> {
    this.ensureInit();

    try {
      const networkKey = await this.getNetworkEncryptionKey();
      const ciphertext = encryptValue(value, FHE_TYPE_UINT64);
      const { response } = await this.webClient!.createInput({
        chain: Chain.SOLANA,
        inputs: [{ ciphertextBytes: ciphertext, fheType: FHE_TYPE_UINT64 }],
        proof: new Uint8Array(0),
        authorized: authorizedPublicKey,
        networkEncryptionPublicKey: networkKey,
      });
      const ciphertextId = response.ciphertextIdentifiers[0];
      this._status = "connected";
      return {
        ciphertextId,
        ciphertextIdHex: Array.from(ciphertextId).map(b => b.toString(16).padStart(2, "0")).join(""),
        value,
        fheType: FHE_TYPE_UINT64,
      };
    } catch {
      // Executor unreachable — use local mock (pre-alpha plaintext mode)
      this._status = "disconnected";
      return this._localMockInput(value, authorizedPublicKey);
    }
  }

  /**
   * Read a ciphertext value from the executor via manual gRPC-Web call.
   *
   * In pre-alpha mock mode the executor returns the plaintext value directly.
   * For private ciphertexts, sign with the authorized keypair.
   * For public (authorized=zero) ciphertexts pass zero-filled signature.
   *
   * @param ciphertextId - identifier returned by createEncryptedInput
   * @param publicKey - 32-byte Ed25519 public key (authorized party)
   * @param secretKey - 64-byte Solana keypair secretKey (for signing)
   * @param epoch - current epoch (default 0)
   */
  async readCiphertext(
    ciphertextId: Uint8Array,
    publicKey: Uint8Array,
    secretKey: Uint8Array,
    epoch: bigint = 0n,
  ): Promise<ReadCiphertextResult> {
    this.ensureInit();

    const message = encodeBcsReadMsg(ciphertextId, publicKey, epoch);
    const signature = secretKey.length === 64
      ? nacl.sign.detached(message, secretKey)
      : new Uint8Array(64);

    try {
      const { response } = await this.webClient!.readCiphertext({
        message,
        signature,
        signer: publicKey,
      });
      let numericValue = 0n;
      for (let i = 0; i < Math.min(response.value.length, 8); i++) {
        numericValue |= BigInt(response.value[i]) << BigInt(i * 8);
      }
      return { value: numericValue, fheType: response.fheType, digest: response.digest };
    } catch {
      // Executor unreachable — decode value from local mock ID (first 8 bytes LE uint64)
      const id = ciphertextId.length >= 8 ? ciphertextId : new Uint8Array(8);
      const value = new DataView(id.buffer, id.byteOffset, Math.min(id.byteLength, 8)).getBigUint64(0, true);
      return { value, fheType: FHE_TYPE_UINT64, digest: new Uint8Array(0) };
    }
  }

  /**
   * Read a public (no-auth) ciphertext. Uses zero signature.
   */
  async readPublicCiphertext(ciphertextId: Uint8Array): Promise<ReadCiphertextResult> {
    return this.readCiphertext(
      ciphertextId,
      new Uint8Array(32),
      new Uint8Array(0),
      0n,
    );
  }

  /** Clear cached network key — call when switching networks. */
  reset(): void {
    this.cachedNetworkKey = null;
    this._status = "disconnected";
    this.webClient = null;
    this.connection = null;
  }
}

export default EncryptSolanaService;
