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
  transactionDigest: string;
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
    const sessionIdentifier = createRandomSessionIdentifier();

    // Prepare DKG cryptography (pure local computation) and register encryption key in parallel.
    // The encryption key must be indexed on-chain before the DKG PTB is submitted so IKA nodes
    // can encrypt the user share.
    const [dkgRequestInput] = await Promise.all([
      prepareDKGAsync(ikaClient, curve, userShareEncryptionKeys, sessionIdentifier, signerAddress),
      (async () => {
        try {
          await this.registerUserShareEncryptionKey({ signer, seed, curve });
          // Wait for the key to be indexed before submitting the DKG PTB.
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch {
          // Key may already be registered from a previous attempt.
        }
      })(),
    ]);

    const [networkEncryptionKey, capsBefore] = await Promise.all([
      ikaClient.getLatestNetworkEncryptionKey(),
      ikaClient.getOwnedDWalletCaps(signerAddress),
    ]);
    const capIdsBefore = new Set(capsBefore.dWalletCaps.map((cap) => cap.id));

    onProgress?.({ step: "submitting", message: "Ika ağına gönderiliyor..." });

    // Build a single PTB that registers the session identifier and requests DKG atomically.
    // Separating them into two transactions caused sessions_manager::initiate_user_session to
    // abort (code 1) if the sessions manager locked between the two transactions.
    const transaction = new Transaction();
    const ikaTx = new IkaTransaction({
      ikaClient,
      transaction,
      userShareEncryptionKeys,
    });

    const [ikaCoin] = transaction.splitCoins(transaction.object(ikaCoinObjectId), [asMistAmount(ikaMistAmount)]);
    const [suiCoin] = transaction.splitCoins(transaction.gas, [asMistAmount(suiMistAmount)]);

    // Register session identifier within the same PTB so it is atomically consumed by DKG.
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

    onProgress?.({ step: "waiting-activation", message: "Aktivasyon bekleniyor (~2 dakika)..." });

    const dWalletCap = await this.findNewDWalletCap(signerAddress, capIdsBefore);
    if (!dWalletCap?.dwallet_id) {
      throw new Error("Ika DKG işlemi başarılı, ancak DWalletCap bulunamadı.");
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
  }

  async createDWalletWithFunding(
    params: Omit<CreateIkaDWalletParams, "ikaCoinObjectId">,
  ): Promise<IkaDWalletResult> {
    params.onProgress?.({ step: "funding-check", message: "Fonlama kontrol ediliyor..." });

    const owner = params.signer.toSuiAddress();
    const funding = await this.getFundingStatus(owner);

    if (!funding.paymentIkaCoinObjectId) {
      throw new Error(
        `IKA token bulunamadı. Önce Sui testnet adresinizi (${owner}) IKA ve SUI ile fonlayın.`,
      );
    }

    if (funding.suiBalanceMist < MIN_SUI_FOR_GAS) {
      throw new Error(
        `Yetersiz SUI gas. Sui testnet adresinize en az 0.01 SUI gönderin.`,
      );
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
    throw new Error(`Ika dWallet henüz aktif değil. Mevcut durum: ${dWallet.state.$kind}`);
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
