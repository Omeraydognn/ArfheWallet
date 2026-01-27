import { cofhejs, Encryptable, FheTypes } from "cofhejs/web";

/**
 * FHE Service for Fhenix CoFHE Integration
 * 
 * Fhenix CoFHE (Confidential Fully Homomorphic Encryption) servisi.
 * Blockchain üzerinde tamamen gizli token işlemleri yapılmasını sağlar.
 * 
 * Özellikler:
 * - Encryption: cofhejs.encrypt() ile veri şifreleme
 * - Unsealing: cofhejs.unseal() ile şifreli veriyi okuma
 * - Permit Management: Kullanıcı kimlik doğrulaması
 * 
 * @see https://cofhe-docs.fhenix.zone/cofhejs/introduction/overview
 */
class FheService {
    private static instance: FheService;
    private _isReady: boolean = false;
    private initializationPromise: Promise<void> | null = null;

    // Error state for UI
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
     * CoFHE SDK'yı başlatır
     * @param ethersProvider - Ethers JsonRpcProvider
     * @param ethersSigner - Ethers Wallet/Signer
     */
    public async init(ethersProvider: any, ethersSigner: any): Promise<void> {
        if (this._isReady) {
            console.log("[FHE] Already initialized");
            return;
        }

        if (this.initializationPromise) {
            console.log("[FHE] Initialization in progress, waiting...");
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                this.initError = null;
                console.log("[FHE] Initializing CoFHE SDK...");

                // Initialize CoFHE with Ethers
                await cofhejs.initializeWithEthers({
                    ethersProvider: ethersProvider,
                    ethersSigner: ethersSigner,
                    environment: "TESTNET" // Fhenix Sepolia/Arbitrum Sepolia
                });

                console.log("[FHE] ✅ CoFHE SDK initialized successfully");
                this._isReady = true;

            } catch (error: any) {
                console.error("[FHE] ❌ Initialization failed:", error);
                this.initError = error.message || "FHE initialization failed";
                this._isReady = false;
                throw error;
            } finally {
                this.initializationPromise = null;
            }
        })();

        return this.initializationPromise;
    }

                if (!this._isReady) {
                    throw new Error("FHE keys failed to load after timeout");
                }

                console.log("✅ [FHE] System Ready! Encryption enabled.");
                this._isReady = true;

            } catch (e: any) {
                console.error("❌ [FheService] Initialization Failed:", e);
                this._isReady = false;
                this.initError = e.message;
                throw e;
            } finally {
                this.initializationPromise = null;
            }
        })();

        return this.initializationPromise;
    }

    /**
     * Değeri şifreler (Encryption)
     * 
     * @param value - Şifrelenecek değer (BigInt string formatında - Wei cinsinden)
     * @param type - FHE tipi (uint8, uint16, uint32, uint64, address)
     * @returns Şifrelenmiş veri (bytes formatında)
     */
    public async encrypt(
        value: number | bigint | string, 
        type: "uint8" | "uint16" | "uint32" | "uint64" | "address" = "uint32"
    ): Promise<string> {
        if (!this._isReady) {
            throw new Error("FHE Service not ready. Call init() first.");
        }

        console.log(`[FHE] Encrypting value: ${value} as ${type}`);

        let encryptable;
        try {
            // BigInt dönüşümü (decimal nokta varsa sil)
            if (type === "address") {
                encryptable = Encryptable.address(value as string);
            } else {
                const valBig = typeof value === 'string' && value.includes('.') 
                    ? BigInt(value.split('.')[0]) 
                    : BigInt(value);

                switch (type) {
                    case "uint8": encryptable = Encryptable.uint8(valBig); break;
                    case "uint16": encryptable = Encryptable.uint16(valBig); break;
                    case "uint32": encryptable = Encryptable.uint32(valBig); break;
                    case "uint64": encryptable = Encryptable.uint64(valBig); break;
                    default: encryptable = Encryptable.uint32(valBig);
                }
            }
        } catch (e) {
            throw new Error(`Invalid value for encryption: ${value} (${e})`);
        }

        // Şifreleme işlemi
        const result = await cofhejs.encrypt([encryptable], (state) => {
            console.log(`[FHE] Encryption State: ${state}`);
        });

        // @ts-ignore
        if (!result.success && !result.data) {
            // @ts-ignore
            throw new Error(`Encryption failed: ${result.error?.message || 'Unknown error'}`);
        }

        // @ts-ignore
        const encrypted = result.data?.[0];

        if (!encrypted) {
            throw new Error("Encryption returned empty data");
        }

        // CoFHE encrypted object'i bytes formatına çevir
        if (typeof encrypted === 'string') {
            return encrypted; // Zaten serialize edilmiş
        }

        // Manuel serialization (gerekirse)
        // @ts-ignore
        if (typeof encrypted.serialize === 'function') {
            // @ts-ignore
            return encrypted.serialize();
        }

        // Fallback: Manual encoding
        if (encrypted.ctHash) {
            console.warn("[FHE] Using manual serialization");
            const ethers = await import("ethers");
            
            return ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint256, uint8, bytes, uint8)"],
                [[
                    BigInt(encrypted.ctHash),
                    Number(encrypted.securityZone || 0),
                    encrypted.signature || "0x",
                    Number(encrypted.utype || 0)
                ]]
            );
        }

        throw new Error("Unable to serialize encrypted data");
    }

    /**
     * Permit oluşturur (Kullanıcı kimlik doğrulaması için)
     * 
     * @param contractAddress - Contract adresi
     * @param userAddress - Kullanıcı adresi
     * @returns Permit objesi
     */
    public async createPermit(contractAddress: string, userAddress: string): Promise<any> {
        if (!this._isReady) {
            throw new Error("FHE Service not ready");
        }

        // Cache'de varsa döndür
        const cacheKey = `${contractAddress.toLowerCase()}_${userAddress.toLowerCase()}`;
        if (this.permits.has(cacheKey)) {
            console.log("[FHE] Using cached permit");
            return this.permits.get(cacheKey);
        }

        console.log(`[FHE] Creating permit for ${contractAddress}...`);

        const result = await cofhejs.createPermit({ 
            type: "self", 
            issuer: userAddress 
        });

        // @ts-ignore
        if (!result.success && !result.data) {
            // @ts-ignore
            throw new Error(`Permit creation failed: ${result.error?.message}`);
        }

        // @ts-ignore
        const permit = result.data || result.value || result;

        // Cache'e kaydet
        this.permits.set(cacheKey, permit);
        
        console.log("✅ [FHE] Permit created and cached");
        return permit;
    }

    /**
     * Şifreli veriyi çözer (Unsealing)
     * 
     * @param handle - Blockchain'den dönen encrypted handle (uint256)
     * @param userAddress - Kullanıcı adresi
     * @param contractAddress - Contract adresi
     * @param fheType - FHE tipi
     * @returns Çözülmüş değer (BigInt)
     */
    public async unseal(
        handle: string | bigint, 
        userAddress: string,
        contractAddress: string,
        fheType: "uint8" | "uint16" | "uint32" | "uint64" = "uint32"
    ): Promise<bigint | null> {
        if (!this._isReady) {
            console.warn("[FHE] Service not ready, cannot unseal");
            return null;
        }

        try {
            // Permit al (cache'den veya oluştur)
            const permit = await this.createPermit(contractAddress, userAddress);
            
            const handleBigInt = typeof handle === "string" ? BigInt(handle) : handle;

            console.log(`[FHE] Unsealing handle: ${handleBigInt}`);

            // FheTypes mapping
            let type: any = FheTypes.Uint32;
            switch (fheType) {
                case "uint8": type = FheTypes.Uint8; break;
                case "uint16": type = FheTypes.Uint16; break;
                case "uint32": type = FheTypes.Uint32; break;
                case "uint64": type = FheTypes.Uint64; break;
            }

            const result = await cofhejs.unseal(handleBigInt, type, permit);

            // @ts-ignore
            if (!result.success && result.data === undefined) {
                // @ts-ignore
                console.error("[FHE] Unseal failed:", result.error);
                return null;
            }

            // @ts-ignore
            const unsealed = result.data ?? result.value ?? result;

            console.log(`✅ [FHE] Unsealed value: ${unsealed}`);
            return BigInt(unsealed);

        } catch (e) {
            console.error("[FHE] Unseal error:", e);
            return null;
        }
    }

    /**
     * Cache'i temizle (Logout için)
     */
    public clearCache(): void {
        this.permits.clear();
        console.log("[FHE] Permit cache cleared");
    }

    /**
     * Servisi sıfırla (Yeniden başlatma için)
     */
    public reset(): void {
        this._isReady = false;
        this.permits.clear();
        this.initError = null;
        this.initializationPromise = null;
        console.log("[FHE] Service reset");
    }
}

export default FheService;