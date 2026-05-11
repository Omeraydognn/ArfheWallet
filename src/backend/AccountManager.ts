import Account from "./Account.js";
import StorageManager from "./StorageManager.js";
import { HDNodeWallet, Wallet, keccak256, toUtf8Bytes, JsonRpcProvider } from "ethers";

/** Shape of an account as stored in localStorage / encrypted storage */
interface StoredAccount {
  name: string;
  mnemonic?: { phrase: string; path?: string; locale?: string };
  private_key?: string;
  public_key?: string;
  address?: string;
  sui_address?: string;
  derivationPath?: string;
  solanaDerivationPath?: string;
  suiDerivationPath?: string;
  ika_evm_dwallet?: string;
  ika_solana_dwallet?: string;
  ika_mpc_id?: string;
  ika_evm_mpc_id?: string;
  ika_solana_mpc_id?: string;
  ika_evm_dwallet_cap_id?: string;
  ika_solana_dwallet_cap_id?: string;
  ika_user_share_keys?: string;
  ika_user_secret_share?: string;
  ika_user_public_output?: string;
  ika_last_tx_digest?: string;
  owned_tokens?: Record<string, string[]>;
}

export default class AccountManager {
  active: number;
  accounts: Account[];
  private listeners: (() => void)[];
  linkedStorageManager: StorageManager;

  constructor(storageManager: StorageManager) {
    this.listeners = [];
    this.linkedStorageManager = storageManager;

    // Synchronously load from plaintext localStorage for backward compatibility.
    // This ensures the app works immediately even before password unlock.
    // After unlock, loadFromEncryptedStorage() will replace with decrypted data.
    const plainAccounts = storageManager.getLocal<StoredAccount[]>("accounts") || [];
    const plainActive = storageManager.getLocal<number>("active") ?? -1;

    if (plainAccounts.length > 0) {
      this.accounts = this.hydrateAccounts(plainAccounts);
      this.active = plainActive >= 0 ? plainActive : 0;
    } else {
      this.accounts = [];
      this.active = -1;
    }
  }

  /**
   * Initialize accounts from encrypted storage.
   * Must be called AFTER storageManager.initEncryption() succeeds.
   * This replaces any accounts loaded from plaintext in the constructor.
   */
  async loadFromEncryptedStorage(): Promise<void> {
    try {
      // Try encrypted storage first
      const storedAccounts = await this.linkedStorageManager.decryptAndRetrieve<StoredAccount[]>("accounts");
      const storedActive = await this.linkedStorageManager.decryptAndRetrieve<number>("active");

      if (storedAccounts && storedAccounts.length > 0) {
        this.accounts = this.hydrateAccounts(storedAccounts);
        this.active = (storedActive !== null && storedActive >= 0) ? storedActive : 0;
      } else {
        // Fallback: check for unencrypted accounts (pre-migration)
        const plainAccounts = this.linkedStorageManager.getLocal<StoredAccount[]>("accounts") || [];
        const plainActive = this.linkedStorageManager.getLocal<number>("active") ?? -1;

        if (plainAccounts.length > 0) {
          this.accounts = this.hydrateAccounts(plainAccounts);
          this.active = plainActive >= 0 ? plainActive : 0;
          // Auto-migrate to encrypted
          await this.linkedStorageManager.migrateToEncrypted();
        }
        // If still no accounts, keep whatever was loaded in constructor
      }

      this.notifyListeners();
    } catch (error) {
      // Keep whatever was loaded in constructor
    }
  }

  /**
   * Hydrate raw stored objects back into Account instances with wallet objects.
   */
  private hydrateAccounts(storedAccounts: StoredAccount[]): Account[] {
    return storedAccounts.map((stored) => {
      const account = new Account();
      account.name = stored.name;
      account.private_key = stored.private_key;
      account.public_key = stored.public_key;
      account.address = stored.address;
      account.sui_address = stored.sui_address;
      account.derivationPath = stored.derivationPath || "m/44'/60'/0'/0/0";
      account.solanaDerivationPath = stored.solanaDerivationPath || "m/44'/501'/0'/0'";
      account.suiDerivationPath = stored.suiDerivationPath || "m/44'/784'/0'/0'/0'";
      account.ika_evm_dwallet = stored.ika_evm_dwallet;
      account.ika_solana_dwallet = stored.ika_solana_dwallet;
      account.ika_mpc_id = stored.ika_mpc_id;
      account.ika_evm_mpc_id = stored.ika_evm_mpc_id;
      account.ika_solana_mpc_id = stored.ika_solana_mpc_id;
      account.ika_evm_dwallet_cap_id = stored.ika_evm_dwallet_cap_id;
      account.ika_solana_dwallet_cap_id = stored.ika_solana_dwallet_cap_id;
      account.ika_user_share_keys = stored.ika_user_share_keys;
      account.ika_user_secret_share = stored.ika_user_secret_share;
      account.ika_user_public_output = stored.ika_user_public_output;
      account.ika_last_tx_digest = stored.ika_last_tx_digest;
      account.owned_tokens = new Map(
        stored.owned_tokens
          ? Object.entries(stored.owned_tokens).map(([key, value]) => [
            Number(key),
            Array.isArray(value) ? value.map(String) : [],
          ])
          : []
      );

      // Re-hydrate the wallet instance
      if (stored.mnemonic && stored.mnemonic.phrase) {
        try {
          account.ethers_wallet = HDNodeWallet.fromPhrase(stored.mnemonic.phrase, "", account.derivationPath);
          account.mnemonic = account.ethers_wallet.mnemonic ?? undefined;
        } catch (e) {
        }
      } else if (stored.private_key) {
        try {
          account.ethers_wallet = new Wallet(stored.private_key);
        } catch (e) {
        }
      }

      account.Init();
      return account;
    });
  }

  // Subscribe to changes
  subscribe(fn: () => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(fn => fn());
  }

  /**
   * Persist active index to storage.
   * Uses encrypted storage if unlocked, otherwise falls back to plaintext.
   */
  private async updateActive(): Promise<void> {
    if (this.linkedStorageManager.isUnlocked()) {
      await this.linkedStorageManager.encryptAndStore("active", this.active);
    } else {
      // Fallback to plaintext until encryption is set up
      this.linkedStorageManager.setLocal("active", this.active);
    }
  }

  /**
   * Persist all accounts to storage.
   * Uses encrypted storage if unlocked, otherwise falls back to plaintext.
   */
  private async updateStorage(): Promise<void> {
    const serializableAccounts = this.accounts.map(account => ({
      name: account.name,
      mnemonic: account.mnemonic,
      private_key: account.private_key,
      public_key: account.public_key,
      address: account.address,
      sui_address: account.sui_address,
      derivationPath: account.derivationPath,
      solanaDerivationPath: account.solanaDerivationPath,
      suiDerivationPath: account.suiDerivationPath,
      ika_evm_dwallet: account.ika_evm_dwallet,
      ika_solana_dwallet: account.ika_solana_dwallet,
      ika_mpc_id: account.ika_mpc_id,
      ika_evm_mpc_id: account.ika_evm_mpc_id,
      ika_solana_mpc_id: account.ika_solana_mpc_id,
      ika_evm_dwallet_cap_id: account.ika_evm_dwallet_cap_id,
      ika_solana_dwallet_cap_id: account.ika_solana_dwallet_cap_id,
      ika_user_share_keys: account.ika_user_share_keys,
      ika_user_secret_share: account.ika_user_secret_share,
      ika_user_public_output: account.ika_user_public_output,
      ika_last_tx_digest: account.ika_last_tx_digest,
      owned_tokens: Object.fromEntries(account.owned_tokens)
    }));

    if (this.linkedStorageManager.isUnlocked()) {
      await this.linkedStorageManager.encryptAndStore("active", this.active);
      await this.linkedStorageManager.encryptAndStore("accounts", serializableAccounts);
    } else {
      // Fallback to plaintext until encryption is set up
      this.linkedStorageManager.setLocal("active", this.active);
      this.linkedStorageManager.setLocal("accounts", serializableAccounts);
    }
  }

  async SaveAccounts(): Promise<void> {
    await this.updateStorage();
    this.notifyListeners();
  }

  /**
   * Save IKA dWallet data for a given account index and persist storage.
   */
  async setIkaSolanaDWallet(index: number, params: {
    dwalletId?: string;
    mpcId?: string;
    capId?: string;
    userShareHex?: string;
    userSecretShare?: string;
    userPublicOutput?: string;
  }) {
    const acct = this.accounts[index];
    if (!acct) throw new Error('Account index out of range');
    if (params.dwalletId) acct.ika_solana_dwallet = params.dwalletId;
    if (params.mpcId) acct.ika_solana_mpc_id = params.mpcId;
    if (params.capId) acct.ika_solana_dwallet_cap_id = params.capId;
    if (params.userShareHex) acct.ika_user_share_keys = params.userShareHex;
    if (params.userSecretShare) acct.ika_user_secret_share = params.userSecretShare;
    if (params.userPublicOutput) acct.ika_user_public_output = params.userPublicOutput;

    await this.updateStorage();
    this.notifyListeners();
  }

  CreateAccount(): number {
    let account = Account.Random(this.CreateRandomAccountName());
    let index = this.AddAccount(account);

    if (this.active == -1 || this.active != index) {
      this.active = index;
      this.notifyListeners();
    }

    // Fire-and-forget async persistence
    this.updateStorage();
    return index;
  }

  AddAccount(account: Account): number {
    if (!account.mnemonic && !account.ethers_wallet) {
      return -1;
    }
    const index = this.accounts.push(account) - 1;
    this.notifyListeners();
    this.updateStorage();
    return index;
  }

  ImportAccount(mnemonic: string): number {
    let account = Account.FromMnemonic(mnemonic, this.CreateRandomAccountName(), "m/44'/60'/0'/0/0");
    let index = this.AddAccount(account);

    if (this.active == -1 || this.active != index) {
      this.active = index;
      this.notifyListeners();
    }

    this.updateStorage();
    return index;
  }

  ImportPrivateKey(privateKey: string, name: string = "Social Account"): number {
    try {
      let account = Account.FromPrivateKey(privateKey, name);
      let index = this.AddAccount(account);

      if (this.active == -1 || this.active != index) {
        this.active = index;
        this.notifyListeners();
      }

      this.updateStorage();
      return index;
    } catch (e) {
      return -1;
    }
  }

  CanDeriveNewAccount(): boolean {
    return this.accounts.length > 0;
  }

  DeriveNewAccount(parentIndex?: number): number {
    const pIndex = parentIndex !== undefined ? parentIndex : (this.active >= 0 ? this.active : 0);
    let parentAccount = this.accounts[pIndex];

    if (!parentAccount || (!parentAccount.mnemonic && !parentAccount.ethers_wallet)) {
      throw new Error("No master account found to derive from.");
    }

    if (!parentAccount.mnemonic && parentAccount.derivationPath?.startsWith("social/")) {
      const rootSocial = this.accounts.find(a => !a.mnemonic && !a.derivationPath);
      if (rootSocial) {
        parentAccount = rootSocial;
      }
    }

    let maxIndex = -1;
    for (const acc of this.accounts) {
      if (acc.derivationPath) {
        if (acc.derivationPath.startsWith("m/44'/60'/0'/0/")) {
          const parts = acc.derivationPath.split("/");
          const idx = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(idx) && idx > maxIndex) {
            maxIndex = idx;
          }
        } else if (acc.derivationPath.startsWith("social/")) {
          const parts = acc.derivationPath.split("/");
          const idx = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(idx) && idx > maxIndex) {
            maxIndex = idx;
          }
        }
      }
    }

    const nextIndex = maxIndex + 1;
    const name = `Account ${nextIndex + 1}`;

    let account: Account;

    if (parentAccount.mnemonic && parentAccount.mnemonic.phrase) {
      const path = `m/44'/60'/0'/0/${nextIndex}`;
      const solPath = `m/44'/501'/${nextIndex}'/0'`;
      const suiPath = `m/44'/784'/${nextIndex}'/0'/0'`;
      account = Account.FromMnemonic(parentAccount.mnemonic.phrase, name, path, solPath, suiPath);
    } else if (parentAccount.ethers_wallet) {
      const path = `social/${nextIndex}`;
      const entropy = toUtf8Bytes(`${parentAccount.ethers_wallet.privateKey}_${nextIndex}`);
      const derivedPrivateKey = keccak256(entropy);
      account = Account.FromPrivateKey(derivedPrivateKey, name);
      account.derivationPath = path;
    } else {
      throw new Error("Unable to derive new account from the master account.");
    }

    let index = this.AddAccount(account);

    this.active = index;
    this.notifyListeners();
    this.updateStorage();
    return index;
  }

  async AutoDiscoverAccounts(rpcUrls: string[], gapLimit = 3, rootIndex?: number): Promise<void> {
    if (!this.CanDeriveNewAccount()) return;

    const originalActive = this.active >= 0 ? this.active : 0;
    const parentIndex = rootIndex !== undefined ? rootIndex : originalActive;

    try {
      const providers = rpcUrls.map(url => new JsonRpcProvider(url));
      let gap = 0;
      let unusedIndices: number[] = [];

      while (gap < gapLimit) {
        const derivedIndex = this.DeriveNewAccount(parentIndex);
        const account = this.accounts[derivedIndex];

        if (!account || !account.address) {
          unusedIndices.push(derivedIndex);
          break;
        }


        let isUsed = false;
        await Promise.all(providers.map(async (provider, idx) => {
          if (isUsed) return;
          try {
            const [txCount, balance] = await Promise.all([
              provider.getTransactionCount(account.address!),
              provider.getBalance(account.address!)
            ]);
            if (txCount > 0 || balance > 0n) {
              isUsed = true;
            }
          } catch (e) {
          }
        }));

        if (isUsed) {
          gap = 0;
          unusedIndices = [];
        } else {
          gap++;
          unusedIndices.push(derivedIndex);
        }
      }

      this.SetActive(originalActive < this.accounts.length ? originalActive : 0);
    } catch (e) {
      this.SetActive(originalActive < this.accounts.length ? originalActive : 0);
    }
  }

  RemoveAccount(account_index: number) {
    if (account_index < 0 || account_index >= this.accounts.length) {
      return;
    }
    this.accounts.splice(account_index, 1);

    if (this.active === account_index) this.active = -1;
    this.notifyListeners();
    this.updateStorage();
  }

  GetActiveIndex(): number {
    return this.active;
  }

  GetActive(): Account | undefined {
    if (this.active < 0 || this.active >= this.accounts.length) return undefined;
    return this.accounts[this.active];
  }

  SetActive(index: number): boolean {
    if (index < 0 || index >= this.accounts.length) {
      return false;
    }
    this.active = index;
    this.notifyListeners();
    this.updateActive();
    return true;
  }

  GetAll(): Account[] {
    return this.accounts;
  }

  private CreateRandomAccountName(): string {
    return "New User #" + (this.accounts.length + 1);
  }

  /**
   * Wipe all sensitive data (private keys, mnemonics, wallet objects) from memory.
   * Called during lock to ensure no decrypted key material remains in RAM.
   * After this, accounts still hold name/address for UI but cannot sign transactions.
   * Re-unlock (loadFromEncryptedStorage) will re-hydrate wallet objects.
   */
  clearSensitiveData(): void {
    for (const account of this.accounts) {
      account.wipeKeys();
    }
  }
}
