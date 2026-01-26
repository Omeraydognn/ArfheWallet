import { cofhejs, Encryptable } from "cofhejs/web";

/**
 * FHE Service for Fhenix Integration
 * Fixed: Manual Serialization for 'missing .serialize()' error.
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

    public async init(ethersProvider: any, ethersSigner: any): Promise<void> {
        if (this._isReady) return;

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                this.initError = null;
                console.log("[FHE] Initializing with Ethers...");

                await cofhejs.initializeWithEthers({
                    ethersProvider,
                    ethersSigner,
                    environment: "TESTNET",
                });

                console.log("[FHE] SDK init done, waiting for keys...");

                let retries = 0;
                const maxRetries = 80;

                while (retries < maxRetries) {
                    // @ts-ignore
                    const state = cofhejs.store?.getState();
                    if (state?.fheKeysInitialized || (cofhejs.getPublicKey && cofhejs.getPublicKey())) {
                        this._isReady = true;
                        break;
                    }
                    await new Promise(r => setTimeout(r, 500));
                    retries++;
                }

                if (!this._isReady) {
                    throw new Error("[FHE] Keys missing after timeout.");
                }

                console.log("SUCCESS: [FHE] System Ready!");
                this._isReady = true;

            } catch (e: any) {
                console.error("[FheService] Init Failed:", e);
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
     * Encrypts a value and FORCES correct serialization.
     */
    public async encrypt(value: number | bigint | string, type: "uint8" | "uint16" | "uint32" | "uint64" | "address" = "uint64"): Promise<string> {
        if (!this._isReady) throw new Error("FHE Service not ready");

        let item;
        try {
            // Güvenli BigInt dönüşümü
            const valBig = typeof value === 'string' && value.includes('.') ? BigInt(value.split('.')[0]) : BigInt(value);

            switch (type) {
                case "uint8": item = Encryptable.uint8(valBig); break;
                case "uint16": item = Encryptable.uint16(valBig); break;
                case "uint32": item = Encryptable.uint32(valBig); break;
                case "uint64": item = Encryptable.uint64(valBig); break;
                case "address": item = Encryptable.address(value as string); break;
                default: item = Encryptable.uint64(valBig);
            }
        } catch (e) {
            throw new Error(`Invalid value for encryption: ${value}`);
        }

        const result = await cofhejs.encrypt([item]);
        
        // @ts-ignore
        if (result.success || result.status === "ok" || result.data) {
            // @ts-ignore
            const encryptedObject = result.data?.[0] || result.value?.[0];

            if (!encryptedObject) throw new Error("Encryption returned no data.");

            // 1. Durum: Zaten string (HEX) gelirse direkt döndür
            if (typeof encryptedObject === 'string') {
                return encryptedObject;
            }

            // 2. Durum: .serialize() fonksiyonu varsa kullan
            // @ts-ignore
            if (typeof encryptedObject.serialize === 'function') {
                return encryptedObject.serialize();
            }

            // 3. Durum (SENİN HATANIN ÇÖZÜMÜ): Fonksiyon yoksa, veriyi Ethers ile biz paketliyoruz
            // Fhenix Ciphertext Formatı: Tuple(uint256 ctHash, uint8 securityZone, bytes signature, uint8 utype)
            if (encryptedObject.ctHash) {
                console.log("[FHE] Manual Serialization Triggered");
                const ethers = await import("ethers");
                
                const values = [
                    BigInt(encryptedObject.ctHash),
                    Number(encryptedObject.securityZone || 0),
                    encryptedObject.signature || "0x",
                    Number(encryptedObject.utype || 0)
                ];

                // AbiCoder ile paketle
                return ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint256, uint8, bytes, uint8)"],
                    [values]
                );
            }
            
            throw new Error("Encrypted object format not recognized.");
        } else {
            // @ts-ignore
            throw new Error(`Encryption Failed: ${result.error?.message}`);
        }
    }

    public async createPermit(contractAddress: string, userAddress: string): Promise<any> {
        if (!this._isReady) throw new Error("FHE Service not ready");
        // @ts-ignore
        const result = await cofhejs.createPermit({ type: "self", issuer: userAddress });
        // @ts-ignore
        return result.data || result.value || result;
    }

    public async unseal(contractAddress: string, userAddress: string, handle: string, permit: any): Promise<any> {
        if (!this._isReady || !permit) return null;
        try {
            const handleBigInt = typeof handle === "string" ? BigInt(handle) : handle;
            // @ts-ignore
            const result = await cofhejs.unseal(handleBigInt, "uint64", permit);
            // @ts-ignore
            return result.data ?? result.value ?? result;
        } catch (e) {
            console.error("Unseal Error:", e);
        }
        return null;
    }
}

export default FheService;