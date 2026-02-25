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
    call: async (transaction: any): Promise<string> => {
      const result = await ethersProvider.call(transaction);
      return result;
    },
    send: async (method: string, params: any[]): Promise<any> => {
      return await ethersProvider.send(method, params);
    },
  };
}

/**
 * Build cofhejs AbstractSigner from ethers Wallet
 */
function buildAbstractSigner(ethersWallet: Wallet, abstractProvider: any) {
  return {
    getAddress: async (): Promise<string> => {
      return await ethersWallet.getAddress();
    },
    signTypedData: async (domain: any, types: any, value: any): Promise<string> => {
      return await ethersWallet.signTypedData(domain, types, value);
    },
    provider: abstractProvider,
    sendTransaction: async (tx: any): Promise<any> => {
      return await ethersWallet.sendTransaction(tx);
    },
  };
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
      console.log("[FheCofheService] Already initialized for account:", signerAddress, "on chain:", chainId);
      return;
    }

    // If initialized with a DIFFERENT account or chain or networkId, reset first
    if (this._isReady && (this.currentAccount?.toLowerCase() !== signerAddress.toLowerCase() || this.currentChainId !== chainId || this.currentNetworkId !== networkId)) {
      console.log(`[FheCofheService] ⚠️ Environment changed: Account ${this.currentAccount} → ${signerAddress}, Chain ${this.currentChainId} → ${chainId}, Network ${this.currentNetworkId} → ${networkId}`);
      console.log("[FheCofheService] Resetting cofhejs for new environment...");
      this.reset();
    }

    if (this.initPromise) {
      console.log("[FheCofheService] Init already in progress...");
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.initError = null;
        this.provider = provider;
        this.signer = signer;

        console.log(`[FheCofheService] 🚀 Initializing cofhejs on chain ${chainId}...`);
        console.log("[FheCofheService] Signer:", signerAddress);

        // Build abstract provider/signer for cofhejs
        const abstractProvider = buildAbstractProvider(provider);
        const abstractSigner = buildAbstractSigner(signer, abstractProvider);

        // Use low-level initialize() directly - bypasses viemProviderSignerTransformer
        // that causes "An internal error occurred" when given ethers objects
        // NOTE: ignoreErrors MUST be false (or omitted) so WASM (tfhe) initializes properly.
        // If WASM init is skipped, TfheCompactPublicKey.deserialize() will crash later.
        const permit = await initialize({
          provider: abstractProvider,
          signer: abstractSigner,
          environment: "TESTNET",
          generatePermit: false,
        });

        console.log("[FheCofheService] ✅ cofhejs core initialized!");

        // Create permit - REQUIRED for unseal/sealoutput operations
        // Without a valid permit, unseal will get 403 from sealoutput endpoint
        await this.ensurePermit();

        this._isReady = true;
        this.currentAccount = signerAddress;
        this.currentChainId = chainId;
        this.currentNetworkId = networkId;
        this.currentNetworkId = networkId;

      } catch (error: any) {
        this.initError = error?.message || String(error);
        const cause = error?.cause?.message || error?.cause || "";
        console.error("[FheCofheService] ❌ Init failed:", this.initError);
        if (cause) console.error("[FheCofheService] ❌ Cause:", cause);
        console.error("[FheCofheService] ❌ Full error:", error);
        this._isReady = false;
        this.initPromise = null;
        throw error;
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

    console.log(`[FheCofheService] 🔒 Encrypting: ${value}`);

    const result = await cofhejs.encrypt([Encryptable.uint64(value)]);

    if (!result.success) {
      throw new Error(`Encryption failed: ${result.error}`);
    }

    const encrypted = result.data[0] as unknown as CoFheInUint64;
    console.log(`[FheCofheService] ✅ Encrypted (ctHash: ${encrypted.ctHash})`);
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
      console.log("[FheCofheService] 🔓 No permit, creating before unseal...");
      const permitOk = await this.ensurePermit();
      if (!permitOk) {
        throw new Error("Cannot unseal: permit creation failed. Permit is required for sealoutput endpoint.");
      }
    }

    console.log(`[FheCofheService] 🔓 Unsealing ctHash: ${ctHash}`);
    console.log(`[FheCofheService] 🔓 ctHash hex: 0x${ctHash.toString(16).padStart(64, '0')}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try cofhejs.unseal first
        const result = await cofhejs.unseal(ctHash, FheTypes.Uint64);

        if (!result.success) {
          const errorMsg = (result.error as any)?.message || String(result.error);
          console.error(`[FheCofheService] ❌ Unseal failed (attempt ${attempt}):`, errorMsg);

          // If permit-related error, mark permit as invalid for retry next time
          if (errorMsg.includes("403") || errorMsg.includes("Permit") || errorMsg.includes("permit") || errorMsg.includes("IssuerSignature")) {
            console.log("[FheCofheService] Marking permit as invalid for retry");
            this._hasPermit = false;
          }

          // Fallback to manual unseal (which throws if it fails)
          console.log(`[FheCofheService] 🔄 Trying manual sealoutput (attempt ${attempt})...`);

          const value = await this.manualUnseal(ctHash);
          console.log(`[FheCofheService] ✅ Unsealed via manual (attempt ${attempt}): ${value}`);
          return value;
        }

        const value = BigInt(result.data as any);
        console.log(`[FheCofheService] ✅ Unsealed: ${value}`);
        return value;

      } catch (err: any) {
        const errorMsg = (err?.message || String(err)).toLowerCase();

        // CoFHE is still processing (428 or manual unseal 'CT source is not ready')
        const isPending =
          errorMsg.includes("sealed data not found") ||
          errorMsg.includes("428") ||
          errorMsg.includes("precondition") ||
          errorMsg.includes("ct source is not ready");

        if (isPending && attempt < maxRetries) {
          console.log(`[FheCofheService] ⏳ CoFHE processing... waiting ${retryDelayMs / 1000}s before attempt ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue; // Move to next loop iteration
        }

        // If it's a completely different error, or we reached max retries
        if (attempt >= maxRetries) {
          console.error(`[FheCofheService] ❌ Reached max retries. Unseal failed.`);
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

    console.log("[FheCofheService] Manual unseal - permission:", JSON.stringify({
      issuer: permission.issuer,
      expiration: permission.expiration,
      recipient: permission.recipient,
      sealingKey: permission.sealingKey?.slice(0, 20) + "...",
      issuerSignature: permission.issuerSignature?.slice(0, 20) + "...",
      recipientSignature: permission.recipientSignature?.slice(0, 20) + "...",
    }));

    const thresholdNetworkUrl = "https://testnet-cofhe-tn.fhenix.zone";
    const body = {
      ct_tempkey: ctHash.toString(16).padStart(64, "0"),
      host_chain_id: this.currentChainId,
      permit: permission,
    };

    console.log("[FheCofheService] Manual unseal - POST body:", JSON.stringify({
      ct_tempkey: body.ct_tempkey,
      host_chain_id: body.host_chain_id,
    }));

    const response = await fetch(`${thresholdNetworkUrl}/sealoutput`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();
    console.log("[FheCofheService] Manual unseal - response status:", response.status);
    console.log("[FheCofheService] Manual unseal - response:", JSON.stringify(responseData));

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
      console.log("[FheCofheService] Permit already exists");
      return true;
    }

    console.log("[FheCofheService] 📝 Creating permit...");

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const permitResult = await cofhejs.createPermit();
        if (permitResult.success) {
          this._hasPermit = true;
          console.log("[FheCofheService] ✅ Permit created successfully (attempt " + attempt + ")");

          // Log permit details for debugging
          try {
            const permissionResult = cofhejs.getPermission();
            if (permissionResult.success) {
              const perm = permissionResult.data;
              console.log("[FheCofheService] Permit details:");
              console.log("  issuer:", perm.issuer);
              console.log("  expiration:", perm.expiration);
              console.log("  recipient:", perm.recipient);
              console.log("  sealingKey:", perm.sealingKey?.slice(0, 20) + "...");
              console.log("  issuerSignature length:", perm.issuerSignature?.length);
              console.log("  issuerSignature:", perm.issuerSignature?.slice(0, 20) + "...");
              console.log("  recipientSignature:", perm.recipientSignature);
            }
          } catch (logErr) {
            console.warn("[FheCofheService] Could not log permit details:", logErr);
          }

          return true;
        } else {
          const errorMsg = (permitResult.error as any)?.message || String(permitResult.error);
          console.warn(`[FheCofheService] ⚠️ Permit creation failed (attempt ${attempt}):`, errorMsg);
        }
      } catch (permitErr: any) {
        console.warn(`[FheCofheService] ⚠️ Permit creation error (attempt ${attempt}):`, permitErr?.message);
        console.warn(`[FheCofheService] ⚠️ Full error:`, permitErr);
      }

      if (attempt < 2) {
        console.log("[FheCofheService] Retrying permit creation...");
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.error("[FheCofheService] ❌ Permit creation failed after retries - unseal will not work");
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

    console.log("[FheCofheService] 📝 Creating permit...");

    const result = await cofhejs.createPermit();

    if (!result.success) {
      throw new Error(`Permit creation failed: ${result.error}`);
    }

    console.log("[FheCofheService] ✅ Permit created");
    return result.data;
  }

  /**
   * Reset service state
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
    console.log("[FheCofheService] Service reset");
  }
}

export default FheCofheService;
