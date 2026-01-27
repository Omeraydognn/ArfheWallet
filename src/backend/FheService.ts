import { FhenixClient, EncryptionTypes } from "fhenixjs";
import { JsonRpcProvider, Wallet } from "ethers";

/**
 * Fhenix CoFHE Service
 * 
 * Client-side Fully Homomorphic Encryption servisi.
 * Verileri client tarafında şifreler, blockchain'de şifreli tutar.
 * 
 * @see https://docs.fhenix.zone/
 */
class FheService {
    private static instance: FheService;
    private client: FhenixClient | null = null;
    private _isReady: boolean = false;
    private initializationPromise: Promise<void> | null = null;

    public initError: string | null = null;

    private constructor() { }

    public static getInstance(): FheService {
        if (!FheService.instance) {
            FheService.instance = new FheService();
        }
        return FheService.instance;
    }

    public isReady(): boolean {
        return this._isReady;
    }

    /**
     * FhenixClient'i başlatır
     * @param ethersProvider JsonRpcProvider instance
     * @param ethersSigner Wallet instance (not used for encryption)
     */
    public async init(ethersProvider: JsonRpcProvider, ethersSigner: Wallet): Promise<void> {
        if (this._isReady && this.client) {
            console.log("[FheService] Already initialized");
            return;
        }

        if (this.initializationPromise) {
            console.log("[FheService] Initialization in progress...");
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                this.initError = null;
                console.log("[FheService] Initializing FhenixClient...");

                // Initialize FhenixClient with provider
                this.client = new FhenixClient({ provider: ethersProvider as any });

                this._isReady = true;
                console.log("[FheService] ✅ Initialized successfully!");

            } catch (error: any) {
                this.initError = error?.message || String(error);
                console.error("[FheService] ❌ Initialization failed:", this.initError);
                this._isReady = false;
                throw error;
            }
        })();

        return this.initializationPromise;
    }

    /**
     * Şifreler bir değeri (client-side)
     * @param value Şifrelenecek değer (number veya bigint)
     * @param fheType FHE tipi (uint8, uint16, uint32, uint64, uint128, uint256)
     * @returns Şifrelenmiş veri (hex string)
     */
    public async encrypt(value: number | bigint, fheType: string = "uint64"): Promise<string> {
        if (!this.client || !this._isReady) {
            throw new Error("FhenixClient not initialized. Call init() first.");
        }

        try {
            console.log(`[FheService] Encrypting value: ${value} as ${fheType}`);

            let encrypted;
            const val = typeof value === 'bigint' ? value : BigInt(value);

            switch (fheType.toLowerCase()) {
                case "uint8":
                    encrypted = await this.client.encrypt_uint8(Number(val));
                    break;
                case "uint16":
                    encrypted = await this.client.encrypt_uint16(Number(val));
                    break;
                case "uint32":
                    encrypted = await this.client.encrypt_uint32(Number(val));
                    break;
                case "uint64":
                    encrypted = await this.client.encrypt_uint64(val);
                    break;
                case "uint128":
                    encrypted = await this.client.encrypt_uint128(val);
                    break;
                case "uint256":
                    encrypted = await this.client.encrypt_uint256(val);
                    break;
                default:
                    encrypted = await this.client.encrypt_uint64(val);
            }

            // encrypted is an object with data property (Uint8Array)
            const dataHex = "0x" + Buffer.from(encrypted.data).toString('hex');
            console.log(`[FheService] ✅ Encrypted successfully:`, dataHex.slice(0, 20) + "...");
            
            return dataHex;

        } catch (error: any) {
            console.error("[FheService] ❌ Encryption failed:", error);
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Şifreli veriyi çözer (unseal)
     * NOT: Bu fonksiyon permit gerektirir ve genelde backend tarafında kullanılır
     * @param sealedValue Sealed (şifrelenmiş) değer
     * @param fheType FHE tipi
     * @returns Çözülmüş değer
     */
    public async unseal(sealedValue: string, fheType: string = "uint64"): Promise<bigint> {
        if (!this.client || !this._isReady) {
            throw new Error("FhenixClient not initialized");
        }

        try {
            console.log(`[FheService] Unsealing value (type: ${fheType})`);

            // FhenixClient.unseal requires contract address and permit
            // This is a simplified version - real implementation needs permit
            console.warn("[FheService] Unseal requires permit - not fully implemented");
            
            // For now, return 0 - this needs proper permit implementation
            return 0n;

        } catch (error: any) {
            console.error("[FheService] ❌ Unseal failed:", error);
            throw new Error(`Unseal failed: ${error.message}`);
        }
    }

    /**
     * Permit oluşturur (access control için)
     * @param contractAddress Contract adresi
     * @returns Permit
     */
    public async createPermit(contractAddress: string): Promise<any> {
        if (!this.client || !this._isReady) {
            throw new Error("FhenixClient not initialized");
        }

        try {
            console.log(`[FheService] Creating permit for contract: ${contractAddress}`);

            // FhenixClient.generatePermit implementation
            // This requires signer which we don't have in client directly
            console.warn("[FheService] Permit generation requires signer - not implemented");
            
            return null;

        } catch (error: any) {
            console.error("[FheService] ❌ Permit creation failed:", error);
            throw new Error(`Permit creation failed: ${error.message}`);
        }
    }

    /**
     * Reset service
     */
    public reset(): void {
        this.client = null;
        this._isReady = false;
        this.initializationPromise = null;
        this.initError = null;
        console.log("[FheService] Service reset");
    }
}

export default FheService;
