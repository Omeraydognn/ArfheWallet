import { ethers } from "ethers";
import bs58 from "bs58";
import {
  createRandomSessionIdentifier,
  Curve,
  getNetworkConfig,
  IkaClient,
  IkaTransaction,
  prepareDKGAsync,
  publicKeyFromDWalletOutput,
  UserShareEncryptionKeys,
  type DWalletWithState,
  type Network,
} from "@ika.xyz/sdk";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import type { Signer } from "@mysten/sui/cryptography";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

export type IkaDWalletChain = "solana" | "evm";

export type DKGStep =
  | "funding-check"
  | "preparing-dkg"
  | "submitting"
  | "waiting-activation"
  | "complete";

export interface DKGProgress {
  step: DKGStep;
  message: string;
}

export interface IkaCoinPaymentRefs {
  ikaCoinObjectId: string;
  ikaMistAmount?: bigint | number | string;
  suiMistAmount?: bigint | number | string;
}

export interface CreateIkaDWalletParams extends IkaCoinPaymentRefs {
  signer: Signer;
  seed: Uint8Array;
  chain: IkaDWalletChain;
  waitForActive?: boolean;
  timeoutMs?: number;
  onProgress?: (progress: DKGProgress) => void;
}

export interface RegisterUserShareEncryptionKeyParams {
  signer: Signer;
  seed: Uint8Array;
  curve: Curve;
}

export interface IkaDWalletResult {
  chain: IkaDWalletChain;
  curve: Curve;
  address: string;
  publicKeyBytes: Uint8Array;
  dWalletId: string;
  dWalletCapId?: string;
  sessionIdentifier: Uint8Array;
  userShareEncryptionKeyAddress: string;
  userShareEncryptionKeysBytes: Uint8Array;
  userSecretKeyShare: Uint8Array;
  userPublicOutput: Uint8Array;
  transactionDigest: string | undefined;
}

export interface FundingStatus {
  suiBalanceMist: bigint;
  ikaBalanceMist: bigint;
  ikaCoinType: string;
  paymentIkaCoinObjectId?: string;
  isFunded: boolean;
}

const DEFAULT_IKA_PAYMENT = 1_000_000n;
const DEFAULT_SUI_PAYMENT = 1_000_000n;
export const MIN_SUI_FOR_GAS = 10_000_000n;
export const MIN_IKA_FOR_DKG = 1_000_000n;
const SUI_COIN_TYPE = "0x2::sui::SUI";
const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";

export class IkaService {
  private static instance: IkaService;

  public ikaClient: IkaClient | null = null;
  public userShareKeys: UserShareEncryptionKeys | null = null;

  private readonly network: Network = "testnet";
  private readonly networkConfig = getNetworkConfig("testnet");
  private suiClient: SuiJsonRpcClient | null = null;
  private solanaConnection: Connection | null = null;

  private constructor() {}

  static getInstance(): IkaService {
    if (!this.instance) {
      this.instance = new IkaService();
    }
    return this.instance;
  }

  async initializeIkaClient(): Promise<IkaClient> {
    if (this.ikaClient) return this.ikaClient;

    this.suiClient = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(this.network),
      network: this.network,
    });

    this.ikaClient = new IkaClient({
      suiClient: this.suiClient,
      config: this.networkConfig,
      cache: true,
      encryptionKeyOptions: { autoDetect: true },
    });

    await this.ikaClient.initialize();
    return this.ikaClient;
  }

  // Reads the sessions_manager lock field directly from Sui RPC.
  // The lock (locked_last_user_initiated_session_to_complete_in_current_epoch) activates
  // briefly before an epoch switch; new sessions are rejected while it's true.
  private async isSessionsManagerLocked(): Promise<boolean> {
    try {
      const coordinatorId = this.networkConfig.objects.ikaDWalletCoordinator.objectID;
      const dfs = await this.suiClient!.core.getDynamicFields({ parentId: coordinatorId });
      const innerDFId = dfs.data[dfs.data.length - 1]?.objectId;
      if (!innerDFId) return false;
      const obj = await this.suiClient!.core.getObject({ id: innerDFId, options: { showContent: true } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sm = (obj as any)?.data?.content?.fields?.value?.fields?.sessions_manager?.fields;
      return sm?.locked_last_user_initiated_session_to_complete_in_current_epoch === true;
    } catch {
      return false;
    }
  }

  getSolanaConnection(): Connection {
    if (!this.solanaConnection) {
      this.solanaConnection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
    }
    return this.solanaConnection;
  }

  async getSolanaBalance(address: string): Promise<number> {
    try {
      const connection = this.getSolanaConnection();
      const pubkey = new PublicKey(address);
      const lamports = await connection.getBalance(pubkey);
      return lamports / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  async generateUserShareKeys(
    seed: Uint8Array,
    curve: Curve = Curve.ED25519,
  ): Promise<UserShareEncryptionKeys> {
    this.userShareKeys = await UserShareEncryptionKeys.fromRootSeedKey(
      normalizeRootSeed(seed),
      curve,
    );
    return this.userShareKeys;
  }

  restoreUserShareKeys(serializedKeys: Uint8Array): UserShareEncryptionKeys {
    this.userShareKeys = UserShareEncryptionKeys.fromShareEncryptionKeysBytes(serializedKeys);
    return this.userShareKeys;
  }

  getIkaCoinType(): string {
    return `${this.networkConfig.packages.ikaPackage}::ika::IKA`;
  }

  async getFundingStatus(owner: string): Promise<FundingStatus> {
    await this.initializeIkaClient();
    const ikaCoinType = this.getIkaCoinType();

    const [suiCoins, ikaCoins] = await Promise.all([
      this.suiClient!.core.listCoins({ owner, coinType: SUI_COIN_TYPE, limit: 20 }),
      this.suiClient!.core.listCoins({ owner, coinType: ikaCoinType, limit: 20 }),
    ]);

    const suiObjects = (suiCoins as any).objects ?? [];
    const ikaObjects = (ikaCoins as any).objects ?? [];

    const suiBalanceMist = sumCoinBalances(suiObjects);
    const ikaBalanceMist = sumCoinBalances(ikaObjects);
    const paymentObj = pickLargestCoin(ikaObjects);

    return {
      suiBalanceMist,
      ikaBalanceMist,
      ikaCoinType,
      paymentIkaCoinObjectId: paymentObj ? coinStructObjectId(paymentObj) : undefined,
      isFunded: suiBalanceMist >= MIN_SUI_FOR_GAS && ikaBalanceMist >= MIN_IKA_FOR_DKG,
    };
  }

  async createDWallet({
    signer,
    seed,
    chain,
    ikaCoinObjectId,
    ikaMistAmount = DEFAULT_IKA_PAYMENT,
    suiMistAmount = DEFAULT_SUI_PAYMENT,
    waitForActive = true,
    timeoutMs = 120_000,
    onProgress,
  }: CreateIkaDWalletParams): Promise<IkaDWalletResult> {
    onProgress?.({ step: "preparing-dkg", message: "DKG hazırlanıyor..." });

    const ikaClient = await this.initializeIkaClient();
    const curve = curveForChain(chain);
    const signerAddress = signer.toSuiAddress();
    const userShareEncryptionKeys = await this.generateUserShareKeys(seed, curve);

    // Register encryption key first and wait for on-chain indexing before submitting DKG.
    try {
      await this.registerUserShareEncryptionKey({ signer, seed, curve });
      await new Promise(resolve => setTimeout(resolve, 8000));
    } catch {
      // Key may already be registered from a previous attempt — safe to continue.
    }

    // capsBefore is fetched once to detect newly created caps after any attempt.
    const PRE_LOOP_TIMEOUT_MS = 30_000;
    const capsBefore = await Promise.race([
      ikaClient.getOwnedDWalletCaps(signerAddress),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ERR_NETWORK_FETCH_TIMEOUT")), PRE_LOOP_TIMEOUT_MS)),
    ]);
    const capIdsBefore = new Set(capsBefore.dWalletCaps.map((cap) => cap.id));

    onProgress?.({ step: "submitting", message: "IKA ağına gönderiliyor..." });

    // Retry loop handles transient sessions_manager lock errors and network timeouts.
    // Each attempt uses a fresh session identifier — prepareDKGAsync binds it into the proof,
    // so reusing one from a failed attempt would produce a proof mismatch.
    // networkEncryptionKey is re-fetched each attempt because epoch transitions can rotate it.
    // IKA testnet epoch transitions lock sessions_manager for 2-15 minutes.
    // 20 retries: 60s lock-delay × ~15 = ~15 min coverage for epoch transitions.
    const MAX_RETRIES = 20;
    const RETRY_DELAY_MS = 30_000;
    // Per-attempt timeout covers prepareDKGAsync (gRPC) + transaction build + signAndExecuteTransaction.
    // IKA testnet gRPC and Sui RPC can hang indefinitely without this guard.
    const ATTEMPT_TIMEOUT_MS = 45_000;
    let lastError: unknown;
    // Saved across retries so we can recover if signAndExecuteTransaction timed out but tx landed.
    let savedDkgRequestInput: Awaited<ReturnType<typeof prepareDKGAsync>> | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // A previous attempt may have timed out after signAndExecuteTransaction landed on-chain.
        // Check for orphan caps before retrying to avoid a duplicate transaction.
        const orphanCap = await this.ikaClient!.getOwnedDWalletCaps(signerAddress)
          .then(r => r.dWalletCaps.find(c => !capIdsBefore.has(c.id)))
          .catch(() => undefined);

        if (orphanCap?.dwallet_id && savedDkgRequestInput) {
          onProgress?.({ step: "waiting-activation", message: "İşlem bulundu, aktivasyon bekleniyor..." });
          const dkgRequestInput = savedDkgRequestInput;
          const dWallet = waitForActive
            ? await ikaClient.getDWalletInParticularState(orphanCap.dwallet_id, "Active", { timeout: timeoutMs })
            : await ikaClient.getDWallet(orphanCap.dwallet_id);
          const activeDWallet = assertActiveDWallet(dWallet);
          const publicKeyBytes = await publicKeyFromDWalletOutput(
            curve, Uint8Array.from(activeDWallet.state.Active.public_output),
          );
          onProgress?.({ step: "complete", message: "dWallet oluşturuldu!" });
          return {
            chain, curve,
            address: addressFromDWalletPublicKey(chain, publicKeyBytes),
            publicKeyBytes,
            dWalletId: orphanCap.dwallet_id,
            dWalletCapId: orphanCap.id,
            sessionIdentifier: new Uint8Array(),
            userShareEncryptionKeyAddress: userShareEncryptionKeys.getSuiAddress(),
            userShareEncryptionKeysBytes: userShareEncryptionKeys.toShareEncryptionKeysBytes(),
            userSecretKeyShare: dkgRequestInput.userSecretKeyShare,
            userPublicOutput: dkgRequestInput.userPublicOutput,
            transactionDigest: undefined,
          };
        }

        const isLocked = String(lastError).includes("sessions_manager") || String(lastError).includes("SessionsManager") || String(lastError).includes("abort code: 1");
        if (isLocked) {
          // Poll the sessions_manager lock field directly — lock clears in minutes (not hours),
          // retry as soon as it becomes false without waiting for a full epoch transition.
          let waitedMs = 0;
          const LOCK_POLL_MS = 10_000;
          const MAX_LOCK_WAIT_MS = 30 * 60_000; // 30 min safety cap
          onProgress?.({ step: "submitting", message: `IKA ağı kilitli, açılması bekleniyor... (deneme ${attempt + 1}/${MAX_RETRIES})` });
          while (waitedMs < MAX_LOCK_WAIT_MS) {
            await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
            waitedMs += LOCK_POLL_MS;
            const stillLocked = await this.isSessionsManagerLocked();
            if (!stillLocked) break;
            const waitedMin = Math.round(waitedMs / 60_000);
            onProgress?.({ step: "submitting", message: `IKA ağı kilitli, bekleniyor... ${waitedMin > 0 ? `${waitedMin}dk` : `${waitedMs / 1000}s`} (deneme ${attempt + 1}/${MAX_RETRIES})` });
          }
        } else {
          onProgress?.({ step: "submitting", message: `Bekleniyor... (${attempt}/${MAX_RETRIES - 1})` });
          const waitSteps = RETRY_DELAY_MS / 5_000;
          for (let w = 0; w < waitSteps; w++) {
            await new Promise(resolve => setTimeout(resolve, 5_000));
            const remaining = Math.round((RETRY_DELAY_MS - (w + 1) * 5_000) / 1_000);
            if (remaining > 0) {
              onProgress?.({ step: "submitting", message: `Bekleniyor (${remaining}s) — deneme ${attempt + 1}/${MAX_RETRIES}` });
            }
          }
        }
        onProgress?.({ step: "submitting", message: `Tekrar deneniyor... (${attempt + 1}/${MAX_RETRIES})` });
      }

      // Re-fetch network encryption key each attempt — epoch transitions can rotate it.
      const networkEncryptionKey = await Promise.race([
        ikaClient.getLatestNetworkEncryptionKey(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ERR_NETWORK_FETCH_TIMEOUT")), PRE_LOOP_TIMEOUT_MS)),
      ]);

      try {
        const sessionIdentifier = createRandomSessionIdentifier();
        savedDkgRequestInput = null;

        type SubmitResult = { dkgRequestInput: Awaited<ReturnType<typeof prepareDKGAsync>>; result: Awaited<ReturnType<SuiJsonRpcClient["core"]["signAndExecuteTransaction"]>> };

        let heartbeatSecs = 0;
        const heartbeat = setInterval(() => {
          heartbeatSecs += 5;
          onProgress?.({ step: "submitting", message: `IKA ağına gönderiliyor... (${heartbeatSecs}s)` });
        }, 5_000);

        const submitAttempt: Promise<SubmitResult> = (async () => {
          const dkgRequestInput = await prepareDKGAsync(
            ikaClient, curve, userShareEncryptionKeys, sessionIdentifier, signerAddress,
          );
          // Save immediately so orphan-cap recovery can use it if signAndExecuteTransaction times out.
          savedDkgRequestInput = dkgRequestInput;

          // Build a single PTB that registers the session identifier and requests DKG atomically.
          const transaction = new Transaction();
          const ikaTx = new IkaTransaction({
            ikaClient,
            transaction,
            userShareEncryptionKeys,
          });

          const [ikaCoin] = transaction.splitCoins(transaction.object(ikaCoinObjectId), [asMistAmount(ikaMistAmount)]);
          const [suiCoin] = transaction.splitCoins(transaction.gas, [asMistAmount(suiMistAmount)]);

          const sessionIdentifierArg = ikaTx.registerSessionIdentifier(sessionIdentifier);

          const [dWalletCapArg] = await ikaTx.requestDWalletDKG({
            dkgRequestInput,
            ikaCoin,
            suiCoin,
            sessionIdentifier: sessionIdentifierArg,
            dwalletNetworkEncryptionKeyId: networkEncryptionKey.id,
            curve,
          });

          transaction.transferObjects([dWalletCapArg, ikaCoin, suiCoin], signerAddress);

          const result = await this.suiClient!.core.signAndExecuteTransaction({
            transaction,
            signer,
            include: { effects: true },
          });

          return { dkgRequestInput, result };
        })();

        const attemptTimeout: Promise<never> = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("ERR_ATTEMPT_TIMEOUT")), ATTEMPT_TIMEOUT_MS),
        );

        let submitResult: SubmitResult;
        try {
          submitResult = await Promise.race([submitAttempt, attemptTimeout]);
        } finally {
          clearInterval(heartbeat);
        }

        const { dkgRequestInput, result } = submitResult;

        onProgress?.({ step: "waiting-activation", message: "Aktivasyon bekleniyor (~2 dakika)..." });

        const dWalletCap = await this.findNewDWalletCap(signerAddress, capIdsBefore);
        if (!dWalletCap?.dwallet_id) {
          throw new Error("ERR_CAP_NOT_FOUND");
        }

        const dWallet = waitForActive
          ? await ikaClient.getDWalletInParticularState(dWalletCap.dwallet_id, "Active", {
              timeout: timeoutMs,
            })
          : await ikaClient.getDWallet(dWalletCap.dwallet_id);

        const activeDWallet = assertActiveDWallet(dWallet);
        const publicKeyBytes = await publicKeyFromDWalletOutput(
          curve,
          Uint8Array.from(activeDWallet.state.Active.public_output),
        );

        onProgress?.({ step: "complete", message: "dWallet oluşturuldu!" });

        return {
          chain,
          curve,
          address: addressFromDWalletPublicKey(chain, publicKeyBytes),
          publicKeyBytes,
          dWalletId: dWalletCap.dwallet_id,
          dWalletCapId: dWalletCap.id,
          sessionIdentifier,
          userShareEncryptionKeyAddress: userShareEncryptionKeys.getSuiAddress(),
          userShareEncryptionKeysBytes: userShareEncryptionKeys.toShareEncryptionKeysBytes(),
          userSecretKeyShare: dkgRequestInput.userSecretKeyShare,
          userPublicOutput: dkgRequestInput.userPublicOutput,
          transactionDigest: transactionDigestFromResult(result),
        };
      } catch (error) {
        lastError = error;
        if (isRetryableError(error)) {
          continue;
        }
        throw error;
      }
    }

    const cause = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`ERR_SESSIONS_MANAGER_LOCKED (last: ${cause})`);
  }

  async createDWalletWithFunding(
    params: Omit<CreateIkaDWalletParams, "ikaCoinObjectId">,
  ): Promise<IkaDWalletResult> {
    params.onProgress?.({ step: "funding-check", message: "Fonlama kontrol ediliyor..." });

    const owner = params.signer.toSuiAddress();
    const funding = await this.getFundingStatus(owner);

    if (!funding.paymentIkaCoinObjectId) {
      throw new Error("ERR_NO_IKA_TOKEN");
    }

    if (funding.suiBalanceMist < MIN_SUI_FOR_GAS) {
      throw new Error("ERR_INSUFFICIENT_SUI");
    }

    return this.createDWallet({
      ...params,
      ikaCoinObjectId: funding.paymentIkaCoinObjectId,
    });
  }

  async registerUserShareEncryptionKey({
    signer,
    seed,
    curve,
  }: RegisterUserShareEncryptionKeyParams) {
    const ikaClient = await this.initializeIkaClient();
    const userShareEncryptionKeys = await this.generateUserShareKeys(seed, curve);
    const transaction = new Transaction();
    const ikaTx = new IkaTransaction({
      ikaClient,
      transaction,
      userShareEncryptionKeys,
    });

    await ikaTx.registerEncryptionKey({ curve });

    return this.suiClient!.core.signAndExecuteTransaction({
      transaction,
      signer,
      include: { effects: true },
    });
  }

  private async findNewDWalletCap(
    owner: string,
    capIdsBefore: Set<string>,
  ): Promise<{ id: string; dwallet_id: string } | undefined> {
    const caps = await this.ikaClient!.getOwnedDWalletCaps(owner);
    const createdCap = caps.dWalletCaps.find((cap) => !capIdsBefore.has(cap.id));
    return createdCap ?? caps.dWalletCaps.at(-1);
  }
}

function curveForChain(chain: IkaDWalletChain): Curve {
  return chain === "solana" ? Curve.ED25519 : Curve.SECP256K1;
}

function normalizeRootSeed(seed: Uint8Array): Uint8Array {
  const normalized = new Uint8Array(32);
  normalized.set(seed.slice(0, 32));
  return normalized;
}

function asMistAmount(amount: bigint | number | string): bigint {
  return BigInt(amount);
}


function isRetryableError(error: unknown): boolean {
  const msg = String(error);
  // Timeout guards: network calls hung without response
  if (msg.includes("ERR_ATTEMPT_TIMEOUT")) return true;
  if (msg.includes("ERR_NETWORK_FETCH_TIMEOUT")) return true;
  // IKA testnet sessions manager lock (epoch transition) or low abort codes
  if (msg.includes("sessions_manager") || msg.includes("SessionsManager")) return true;
  if (msg.includes("MoveAbort") && /abort code: [012]/.test(msg)) return true;
  // Sui owned-object version conflicts from rapid sequential transactions
  if (msg.includes("ObjectVersionMismatch")) return true;
  if (msg.includes("StaleObjectVersion")) return true;
  if (msg.includes("IncorrectUserSignature")) return true;
  if (msg.includes("object_not_found") || msg.includes("ObjectNotFound")) return true;
  return false;
}

function sumCoinBalances(coins: Array<{ balance: string }>): bigint {
  return coins.reduce((total, coin) => total + BigInt(coin.balance), 0n);
}

function pickLargestCoin<T extends { balance: string }>(coins: T[]): T | undefined {
  return coins.reduce<T | undefined>(
    (best, coin) => (best === undefined || BigInt(coin.balance) > BigInt(best.balance) ? coin : best),
    undefined,
  );
}

/** Mysten `core.listCoins` returns `objectId`; older code paths sometimes used `id`. */
function coinStructObjectId(coin: { objectId?: string; id?: string }): string | undefined {
  return coin.objectId ?? coin.id;
}

function assertActiveDWallet(dWallet: Awaited<ReturnType<IkaClient["getDWallet"]>>): DWalletWithState<"Active"> {
  if (dWallet.state.$kind !== "Active") {
    throw new Error("ERR_DWALLET_NOT_ACTIVE");
  }
  return dWallet as DWalletWithState<"Active">;
}

function transactionDigestFromResult(
  result: Awaited<ReturnType<SuiJsonRpcClient["core"]["signAndExecuteTransaction"]>>,
): string {
  const transaction = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
  return transaction.digest;
}

function addressFromDWalletPublicKey(chain: IkaDWalletChain, publicKeyBytes: Uint8Array): string {
  const rawPublicKey = unwrapLikelyBcsPublicKey(publicKeyBytes, chain);

  if (chain === "solana") {
    if (rawPublicKey.length !== 32) {
      throw new Error(`Beklenmeyen Ed25519 anahtar uzunluğu: ${rawPublicKey.length}`);
    }
    return bs58.encode(rawPublicKey);
  }

  const hexPublicKey = ethers.hexlify(rawPublicKey);
  const uncompressedPublicKey =
    rawPublicKey.length === 33 ? ethers.SigningKey.computePublicKey(hexPublicKey, false) : hexPublicKey;

  return ethers.computeAddress(uncompressedPublicKey);
}

function unwrapLikelyBcsPublicKey(publicKeyBytes: Uint8Array, chain: IkaDWalletChain): Uint8Array {
  const expectedLengths = chain === "solana" ? [32] : [33, 65];
  if (expectedLengths.includes(publicKeyBytes.length)) return publicKeyBytes;

  const firstByte = publicKeyBytes[0];
  if (firstByte === publicKeyBytes.length - 1) {
    const withoutLengthPrefix = publicKeyBytes.slice(1);
    if (expectedLengths.includes(withoutLengthPrefix.length)) return withoutLengthPrefix;
  }

  return publicKeyBytes;
}

export { Curve, Hash, SignatureAlgorithm } from "@ika.xyz/sdk";
