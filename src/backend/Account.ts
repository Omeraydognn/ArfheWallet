import { Wallet, HDNodeWallet, Mnemonic } from "ethers";

export default class Account {
  name?: string;
  mnemonic?: Mnemonic;

  private_key?: string;
  public_key?: string;
  address?: string;

  ethers_wallet?: HDNodeWallet;

  constructor() {}

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
}
