import { Wallet, HDNodeWallet, Mnemonic } from "ethers";

export default class Account {
  name?: string | undefined;
  mnemonic?: Mnemonic | undefined;

  private_key?: string | undefined;
  public_key?: string | undefined;
  address?: string | undefined;

  ethers_wallet?: HDNodeWallet | undefined;

  owned_tokens: Map<number, string[]>;

  constructor() {
    this.owned_tokens = new Map();
  }

  static Random(name: string): Account {
    const account = new Account();

    account.ethers_wallet = HDNodeWallet.createRandom();
    account.mnemonic = account.ethers_wallet.mnemonic!;
    account.name = name;

    account.Init();
    return account;
  }

  static FromMnemonic(phrase: string, name?: string): Account {
    const account = new Account();

    account.ethers_wallet = HDNodeWallet.fromPhrase(phrase);
    account.mnemonic = account.ethers_wallet.mnemonic!;
    account.name = name ?? "";

    account.Init();
    return account;
  }

  Init() {
    if (!this.ethers_wallet) {
      throw new Error("Account not initialized: ethers_wallet is missing");
    }

    this.private_key = this.ethers_wallet.privateKey;
    this.public_key = this.ethers_wallet.publicKey;
    this.address = this.ethers_wallet.address;
  }

  GetWords(): string[] | undefined {
    return this.mnemonic?.phrase.split(" ");
  }

  /*
    PUBLIC KEY != ADDRESS
    PUBLIC KEY != ADDRESS
    PUBLIC KEY != ADDRESS
  */
  GetPubKey(): string | undefined {
    return this.public_key;
  }

  GetPublicKey(): string | undefined {
    return this.GetPubKey();
  }

  GetAddress(): string | undefined {
    return this.address;
  }

  GetShortAddress(): string | undefined {
    const key = this.address?.toLowerCase();
    return key ? key.slice(0, 8) + "..." + key.slice(-6) : undefined;
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
}
