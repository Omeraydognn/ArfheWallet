/**
 * FheCofheService - TRUE FHE with cofhejs on Sepolia
 * 
 * Uses cofhejs library for real Fully Homomorphic Encryption.
 * Sepolia is a supported CoFHE network (confirmed in docs).
 * 
 * Flow:
 * 1. cofhejs.initialize() → loads TFHE keys from CoFHE
 * 2. cofhejs.encrypt([Encryptable.uint64(val)]) → encrypted input
 * 3. Send encrypted input to FHE contract on-chain
 * 4. cofhejs.unseal(ctHash, FheTypes.Uint64) → decrypt sealed output
 * 
 * @see https://cofhe-docs.fhenix.zone/cofhejs/introduction/installation
 */

import { JsonRpcProvider, Wallet } from "ethers";
import { cofhejs, FheTypes, Encryptable, initialize, type CoFheInUint64 } from "cofhejs/web";

/**
 * Build cofhejs AbstractProvider from ethers JsonRpcProvider
 */
function buildAbstractProvider(ethersProvider: JsonRpcProvider) {
  return {
    getChainId: async (): Promise<string> => {
      const network = await ethersProvider.getNetwork();
      return network.chainId.toString();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cofhejs AbstractProvider interface
    call: async (transaction: any): Promise<string> => {
      const result = await ethersProvider.call(transaction);
      return result;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cofhejs AbstractProvider interface
    send: async (method: string, params: any[]): Promise<any> => {
      return await ethersProvider.send(method, params);
    },
  };
}

/**
 * Build cofhejs AbstractSigner from ethers Wallet
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cofhejs AbstractSigner adapter
function buildAbstractSigner(ethersWallet: Wallet, abstractProvider: ReturnType<typeof buildAbstractProvider>) {
  return {
    getAddress: async (): Promise<string> => {
      return await ethersWallet.getAddress();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cofhejs signTypedData interface
    signTypedData: async (domain: any, types: any, value: any): Promise<string> => {
      return await ethersWallet.signTypedData(domain, types, value);
    },
    provider: abstractProvider,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cofhejs sendTransaction interface
    sendTransaction: async (tx: any): Promise<any> => {
      return await ethersWallet.sendTransaction(tx);
    },
  };
}

function requestUrlString(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  try {
    return String((input as { url?: string })?.url ?? "");
  } catch {
    return "";
  }
}

/** Only cofhejs TFHE module — never intercept other .wasm (e.g. IKA dwallet_mpc_wasm_bg*.wasm). */
function isTfheBgWasmRequest(url: string): boolean {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  return path.endsWith(".wasm") && path.includes("tfhe_bg");
}

class FheCofheService {
  private static instance: FheCofheService;
  private provider: JsonRpcProvider | null = null;
  private signer: Wallet | null = null;
  private _isReady: boolean = false;
  private _hasPermit: boolean = false; // Track whether permit was successfully created
  private initPromise: Promise<void> | null = null;
  public initError: string | null = null;
  private currentAccount: string | null = null; // Track which account cofhejs was initialized with
  private currentChainId: number = 11155111; // Track which chain cofhejs was initialized with
  private currentNetworkId?: number; // Track which NetworkId enum cofhejs was initialized with

  private constructor() { }

  static getInstance(): FheCofheService {
    if (!FheCofheService.instance) {
      FheCofheService.instance = new FheCofheService();
    }
    return FheCofheService.instance;
  }

  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Check if cofhejs is initialized for the given account.
   * If initialized with a different account, returns false so it gets re-initialized.
   * This prevents InvalidSigner errors caused by cofhejs using the wrong account address
   * when computing the verification hash.
   */
  isReadyForAccount(accountAddress: string, networkId?: number): boolean {
    if (!this._isReady) return false;
    if (!this.currentAccount) return false;
    if (this.currentAccount.toLowerCase() !== accountAddress.toLowerCase()) return false;
    if (networkId !== undefined && this.currentNetworkId !== networkId) return false;
    return true;
  }

  /**
   * Initialize cofhejs with ethers provider and signer.
   * Uses low-level initialize() to avoid viemProviderSignerTransformer bug.
   * 
   * IMPORTANT: cofhejs uses signer.getAddress() as the account for encryption.
   * The verifier signs the hash with this account address.
   * TaskManager verifies using msg.sender (the tx sender).
   * These MUST match, or InvalidSigner error occurs.
   */
  async init(provider: JsonRpcProvider, signer: Wallet, networkId?: number): Promise<void> {
    const signerAddress = await signer.getAddress();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    // If already initialized with the SAME account AND chain AND networkId, skip
    if (this._isReady && this.currentAccount?.toLowerCase() === signerAddress.toLowerCase() && this.currentChainId === chainId && this.currentNetworkId === networkId) {
      return;
    }

    // If initialized with a DIFFERENT account or chain or networkId, reset first
    if (this._isReady && (this.currentAccount?.toLowerCase() !== signerAddress.toLowerCase() || this.currentChainId !== chainId || this.currentNetworkId !== networkId)) {
      this.reset();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const originalFetch = globalThis.fetch;
      let fetchWasPatched = false;
      try {
        this.initError = null;
        this.provider = provider;
        this.signer = signer;


        // Build abstract provider/signer for cofhejs
        const abstractProvider = buildAbstractProvider(provider);
        const abstractSigner = buildAbstractSigner(signer, abstractProvider);

        // Prefetch tfhe wasm; during initialize() only, steer tfhe_bg.wasm fetches to those bytes.
        // IMPORTANT: Do not blanket-replace all .wasm requests — IKA (@ika.xyz/ika-wasm) loads dwallet_mpc_wasm_bg*.wasm via fetch.
        let fallbackWasmBuffer: ArrayBuffer | null = null;
        try {
          if (typeof originalFetch === "function") {
            const fb = await originalFetch("/tfhe_bg.wasm").catch(() => null);
            if (fb && fb.ok) {
              try {
                fallbackWasmBuffer = await fb.arrayBuffer();
              } catch {
                fallbackWasmBuffer = null;
              }
            }
          }
        } catch {
          /* ignore */
        }

        if (typeof originalFetch === "function" && fallbackWasmBuffer) {
          globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            if (isTfheBgWasmRequest(requestUrlString(input))) {
              return new Response(fallbackWasmBuffer!.slice(0), {
                headers: { "content-type": "application/wasm" },
              });
            }
            return originalFetch(input as RequestInfo, init);
          };
          fetchWasPatched = true;
        }

        // Use low-level initialize() directly - bypasses viemProviderSignerTransformer
        // that causes "An internal error occurred" when given ethers objects
        // NOTE: ignoreErrors MUST be false (or omitted) so WASM (tfhe) initializes properly.
        // If WASM init is skipped, TfheCompactPublicKey.deserialize() will crash later.
        await initialize({
          provider: abstractProvider,
          signer: abstractSigner,
          environment: "TESTNET",
          generatePermit: false,
        });

        // Create permit - REQUIRED for unseal/sealoutput operations
        // Without a valid permit, unseal will get 403 from sealoutput endpoint
        await this.ensurePermit();

        this._isReady = true;
        this.currentAccount = signerAddress;
        this.currentChainId = chainId;
        this.currentNetworkId = networkId;

      } catch (error) {
        this.initError = error instanceof Error ? error.message : String(error);
        this._isReady = false;
        this.initPromise = null;
        throw error;
      } finally {
        if (fetchWasPatched && typeof originalFetch === "function") {
          globalThis.fetch = originalFetch;
        }
      }
    })();

    return this.initPromise;
  }

  // ============ ENCRYPTION ============

  /**
   * Encrypt a uint64 value using cofhejs.
   * Returns CoFheInUint64 (ctHash + signature) to send to contract.
   * Contract expects InEuint64 (utype=5), so we MUST use Encryptable.uint64().
   * 
   * @see https://cofhe-docs.fhenix.zone/cofhejs/guides/encryption
   */
  async encrypt(value: bigint): Promise<CoFheInUint64> {
    if (!this._isReady) throw new Error("cofhejs not initialized");


    const result = await cofhejs.encrypt([Encryptable.uint64(value)]);

    if (!result.success) {
      throw new Error(`Encryption failed: ${result.error}`);
    }

    const encrypted = result.data[0] as unknown as CoFheInUint64;
    return encrypted;
  }

  // ============ DECRYPTION (UNSEALING) ============

  /**
   * Unseal a sealed ciphertext hash returned from contract.
   * Requires a valid permit (created during init or manually).
   * 
   * @see https://cofhe-docs.fhenix.zone/cofhejs/guides/sealing-unsealing
   */
  async unseal(ctHash: bigint, maxRetries = 10, retryDelayMs = 10000): Promise<bigint> {
    if (!this._isReady) throw new Error("cofhejs not initialized");

    // Ensure permit exists before attempting unseal
    if (!this._hasPermit) {
      const permitOk = await this.ensurePermit();
      if (!permitOk) {
        throw new Error("Cannot unseal: permit creation failed. Permit is required for sealoutput endpoint.");
      }
    }


    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try cofhejs.unseal first
        const result = await cofhejs.unseal(ctHash, FheTypes.Uint64);

        if (!result.success) {
          const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);

          // If permit-related error, mark permit as invalid for retry next time
          if (errorMsg.includes("403") || errorMsg.includes("Permit") || errorMsg.includes("permit") || errorMsg.includes("IssuerSignature")) {
            this._hasPermit = false;
          }

          // Fallback to manual unseal (which throws if it fails)

          const value = await this.manualUnseal(ctHash);
          return value;
        }

        const value = BigInt(result.data as bigint | number | string);
        return value;

      } catch (err) {
        const errorMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();

        // "Ciphertext not found" from the CoFHE service means the data genuinely doesn't exist
        // (account has never shielded, or testnet was reset). Stop retrying immediately — no point
        // waiting 100 seconds for data that will never appear.
        const isMissing =
          errorMsg.includes("ciphertext not found") ||
          errorMsg.includes("failed to fetch full ciphertext");

        if (isMissing) {
          throw new Error("Ciphertext not found: no shielded balance");
        }

        // CoFHE is still processing (428 or manual unseal 'CT source is not ready')
        const isPending =
          errorMsg.includes("sealed data not found") ||
          errorMsg.includes("428") ||
          errorMsg.includes("precondition") ||
          errorMsg.includes("ct source is not ready");

        if (isPending && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue; // Move to next loop iteration
        }

        // If it's a completely different error, or we reached max retries
        if (attempt >= maxRetries) {
          throw err;
        }
      }
    }

    throw new Error("Unseal failed after retries");
  }


  /**
   * Manual unseal: Directly call sealoutput endpoint bypassing cofhejs
   */
  private async manualUnseal(ctHash: bigint): Promise<bigint> {
    // Get permit from cofhejs
    const permitResult = cofhejs.getPermission();
    if (!permitResult.success) {
      throw new Error(`No permission available: ${permitResult.error}`);
    }
    const permission = permitResult.data;

    const thresholdNetworkUrl = "https://testnet-cofhe-tn.fhenix.zone";
    const body = {
      ct_tempkey: ctHash.toString(16).padStart(64, "0"),
      host_chain_id: this.currentChainId,
      permit: permission,
    };

    const response = await fetch(`${thresholdNetworkUrl}/sealoutput`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    if (responseData.error_message) {
      throw new Error(`sealoutput error: ${responseData.error_message}`);
    }

    if (!responseData.sealed) {
      throw new Error("sealoutput returned null sealed data");
    }

    // Unseal using permit's sealing key
    const allPermits = cofhejs.getAllPermits();
    if (!allPermits.success) throw new Error("Cannot get permits for unsealing");

    const activePermit = Object.values(allPermits.data)[0];
    if (!activePermit) throw new Error("No active permit found");

    const unsealed = activePermit.unseal(responseData.sealed);
    return unsealed;
  }

  // ============ PERMIT MANAGEMENT ============

  /**
   * Ensure a valid permit exists for the current account.
   * Called during init and before unseal operations.
   * Retries once if permit creation fails.
   */
  private async ensurePermit(): Promise<boolean> {
    if (this._hasPermit) {
      return true;
    }


    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const permitResult = await cofhejs.createPermit();
        if (permitResult.success) {
          this._hasPermit = true;

          // Log permit details for debugging
          try {
            const permissionResult = cofhejs.getPermission();
            if (permissionResult.success) {
              const perm = permissionResult.data;
            }
          } catch (logErr) {
          }

          return true;
        } else {
          const errorMsg = permitResult.error instanceof Error ? permitResult.error.message : String(permitResult.error);
        }
      } catch (permitErr) {
      }

      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return false;
  }

  /**
   * Create a permit for accessing encrypted data.
   * Public method for manual permit creation.
   * 
   * @see https://cofhe-docs.fhenix.zone/cofhejs/guides/permits-management
   */
  async createPermit() {
    if (!this._isReady) throw new Error("cofhejs not initialized");


    const result = await cofhejs.createPermit();

    if (!result.success) {
      throw new Error(`Permit creation failed: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Reset service state — clears signer, provider, and permit from memory.
   * Called during wallet lock to ensure no sensitive cryptographic material remains.
   * Next FHE operation will require full re-initialization.
   */
  reset(): void {
    this._isReady = false;
    this._hasPermit = false;
    this.provider = null;
    this.signer = null;
    this.initPromise = null;
    this.initError = null;
    this.currentAccount = null;
    this.currentChainId = 11155111;
    this.currentNetworkId = undefined;
  }
}

export default FheCofheService;
