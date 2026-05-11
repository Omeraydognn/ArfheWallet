import { Wallet, HDNodeWallet, Mnemonic, getBytes, keccak256, toUtf8Bytes } from "ethers";
import { Keypair } from "@solana/web3.js";
import { derivePath } from "ed25519-hd-key";
import bs58 from "bs58";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import type { Signer } from "@mysten/sui/cryptography";

export default class Account {
  name?: string | undefined;
  mnemonic?: Mnemonic | undefined;

  // EVM
  private_key?: string | undefined;
  public_key?: string | undefined;
  address?: string | undefined;
  
  // Solana
  solana_keypair?: Keypair | undefined;
  solana_address?: string | undefined;
  sui_address?: string | undefined;

  derivationPath?: string | undefined; // Base EVM derivation path
  solanaDerivationPath?: string | undefined; // Base Solana derivation path
  suiDerivationPath?: string | undefined;
  
  // Ika dWallet (MPC)
  ika_evm_dwallet?: string | undefined;
  ika_solana_dwallet?: string | undefined;
  ika_mpc_id?: string | undefined;
  ika_evm_mpc_id?: string | undefined;
  ika_solana_mpc_id?: string | undefined;
  ika_evm_dwallet_cap_id?: string | undefined;
  ika_solana_dwallet_cap_id?: string | undefined;
  ika_user_share_keys?: string | undefined;
  ika_user_secret_share?: string | undefined;
  ika_user_public_output?: string | undefined;
  ika_last_tx_digest?: string | undefined;

  ethers_wallet?: HDNodeWallet | Wallet | undefined;

  owned_tokens: Map<number, string[]>;

  constructor() {
    this.owned_tokens = new Map();
  }

  static Random(name: string): Account {
    const account = new Account();

    account.ethers_wallet = HDNodeWallet.createRandom();
    account.mnemonic = account.ethers_wallet.mnemonic!;
    account.name = name;
    account.derivationPath = "m/44'/60'/0'/0/0";
    account.solanaDerivationPath = "m/44'/501'/0'/0'";
    account.suiDerivationPath = "m/44'/784'/0'/0'/0'";

    account.Init();
    return account;
  }

  static FromMnemonic(
    phrase: string,
    name?: string,
    path: string = "m/44'/60'/0'/0/0",
    solanaPath: string = "m/44'/501'/0'/0'",
    suiPath: string = "m/44'/784'/0'/0'/0'",
  ): Account {
    const account = new Account();

    account.ethers_wallet = HDNodeWallet.fromPhrase(phrase, "", path);
    account.mnemonic = account.ethers_wallet.mnemonic!;
    account.name = name ?? "";
    account.derivationPath = path;
    account.solanaDerivationPath = solanaPath;
    account.suiDerivationPath = suiPath;

    account.Init();
    return account;
  }

  static FromPrivateKey(privateKey: string, name: string): Account {
    const account = new Account();

    // Ensure the EVM private key starts with '0x'
    const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    account.ethers_wallet = new Wallet(pk);
    account.name = name;

    // A raw EVM private key doesn't have a mnemonic, so we cannot derive a Solana keypair from it.
    // If the user wants a Solana account from a raw private key, it should be handled differently.
    account.mnemonic = undefined;
    account.derivationPath = undefined;
    account.solanaDerivationPath = undefined;
    account.suiDerivationPath = undefined;

    account.Init();
    return account;
  }
  
  static FromSolanaPrivateKey(privateKeyBase58: string, name: string): Account {
    const account = new Account();
    account.name = name;
    
    // Create Solana Keypair
    const secretKey = bs58.decode(privateKeyBase58);
    account.solana_keypair = Keypair.fromSecretKey(secretKey);
    account.solana_address = account.solana_keypair.publicKey.toBase58();
    
    account.mnemonic = undefined;
    account.derivationPath = undefined;
    account.solanaDerivationPath = undefined;
    account.suiDerivationPath = undefined;
    
    return account;
  }

  Init() {
    if (this.ethers_wallet) {
      this.private_key = this.ethers_wallet.privateKey;
      this.public_key = this.ethers_wallet.signingKey?.publicKey || (this.ethers_wallet as unknown as { publicKey?: string }).publicKey || "";
      this.address = this.ethers_wallet.address;
    }

    if (this.mnemonic) {
      // Derive Solana Keypair from the mnemonic
      try {
        const seedHex = this.mnemonic.computeSeed().slice(2);
        const solPath = this.solanaDerivationPath || "m/44'/501'/0'/0'";
        const derivedSeed = derivePath(solPath, seedHex).key;
        this.solana_keypair = Keypair.fromSeed(derivedSeed);
        this.solana_address = this.solana_keypair.publicKey.toBase58();
      } catch (err) {
        console.error("Failed to derive Solana keypair", err);
      }

    }

    try {
      const suiKeypair = this.GetSuiKeypair();
      this.sui_address = suiKeypair?.toSuiAddress();
    } catch (err) {
      console.error("Failed to derive Sui keypair", err);
    }

    // Real Ika dWallet DKG requires an explicit Sui signer transaction and payment coins.
    // It is started from the Ika flow instead of silently fabricating addresses here.
  }

  async initIkaDWallets() {
    console.info("Ika dWallet creation requires an explicit Sui DKG transaction.");
  }

  GetWords(): string[] | undefined {
    return this.mnemonic?.phrase.split(" ");
  }

  GetPubKey(): string | undefined {
    return this.public_key;
  }

  GetPublicKey(): string | undefined {
    return this.GetPubKey();
  }

  GetAddress(): string | undefined {
    return this.address;
  }

  GetSolanaAddress(): string | undefined {
    return this.solana_address;
  }

  GetSuiAddress(): string | undefined {
    return this.sui_address;
  }

  GetSuiKeypair(): Signer | undefined {
    if (this.mnemonic?.phrase) {
      return Ed25519Keypair.deriveKeypair(
        this.mnemonic.phrase,
        this.suiDerivationPath || "m/44'/784'/0'/0'/0'",
      );
    }

    if (this.private_key) {
      return Secp256k1Keypair.fromSecretKey(getBytes(this.private_key));
    }

    return undefined;
  }

  GetIkaRootSeed(chain: "solana" | "evm"): Uint8Array {
    const source =
      this.mnemonic?.phrase ||
      this.private_key ||
      this.solana_keypair?.publicKey.toBase58() ||
      this.address ||
      this.solana_address;

    if (!source) {
      throw new Error("Ika seed cannot be derived because this account is locked.");
    }

    return getBytes(keccak256(toUtf8Bytes(`arfhe:ika:${chain}:${source}`)));
  }

  GetShortAddress(): string | undefined {
    const key = this.address?.toLowerCase();
    return key ? key.slice(0, 8) + "..." + key.slice(-6) : undefined;
  }
  
  GetShortSolanaAddress(): string | undefined {
    const key = this.solana_address;
    return key ? key.slice(0, 4) + "..." + key.slice(-4) : undefined;
  }

  SetName(name: string) {
    this.name = name;
  }

  GetName(): string {
    return this.name ?? "";
  }

  private getNetworkTokens(networkId: number): string[] {
    if (!this.owned_tokens.has(networkId)) {
      this.owned_tokens.set(networkId, []);
    }
    return this.owned_tokens.get(networkId)!;
  }

  AddToken(networkId: number, contractAddress: string): void {
    const addr = contractAddress.toLowerCase();
    const tokens = this.getNetworkTokens(networkId);
    if (!tokens.includes(addr)) {
      tokens.push(addr);
    }
  }

  RemoveToken(networkId: number, contractAddress: string): void {
    const addr = contractAddress.toLowerCase();
    const tokens = this.getNetworkTokens(networkId);
    this.owned_tokens.set(
      networkId,
      tokens.filter(t => t !== addr)
    );
  }

  HasToken(networkId: number, contractAddress: string): boolean {
    const addr = contractAddress.toLowerCase();
    return this.getNetworkTokens(networkId).includes(addr);
  }

  GetOwnedTokens(networkId: number): string[] {
    return [...this.getNetworkTokens(networkId)];
  }

  GetAllOwnedTokens(): Map<number, string[]> {
    return new Map(this.owned_tokens);
  }

  wipeKeys(): void {
    this.private_key = undefined;
    this.public_key = undefined;
    this.mnemonic = undefined;
    this.ethers_wallet = undefined;
    this.solana_keypair = undefined;
  }
}
