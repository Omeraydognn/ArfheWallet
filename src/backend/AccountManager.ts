import Account from "./Account.js";
import StorageManager from "./StorageManager.js";
import { HDNodeWallet, Wallet, keccak256, toUtf8Bytes, JsonRpcProvider } from "ethers";

export default class AccountManager {
  active: number;
  accounts: Account[];
  private listeners: (() => void)[];
  linkedStorageManager: StorageManager;

  constructor(storageManager: StorageManager) {
    this.active = this.loadActiveIndex(storageManager);
    this.accounts = this.loadAccounts(storageManager) || [];
    this.listeners = [];
    this.linkedStorageManager = storageManager;
  }

  private loadActiveIndex(storageManager: StorageManager): number {
    const storedActive = storageManager.getLocal<number>("active");
    if (storedActive !== null && storedActive >= 0) {
      return storedActive;
    }
    return -1;
  }

  private loadAccounts(storageManager: StorageManager): Account[] {
    const storedAccounts = storageManager.getLocal<any[]>("accounts") || [];
    return storedAccounts.map((stored) => {
      const account = new Account();
      account.name = stored.name;
      account.mnemonic = stored.mnemonic;
      account.private_key = stored.private_key;
      account.public_key = stored.public_key;
      account.address = stored.address;
      account.derivationPath = stored.derivationPath || "m/44'/60'/0'/0/0";
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
        } catch (e) {
          console.error("Failed to restore wallet from mnemonic", e);
        }
      } else if (stored.private_key) {
        try {
          account.ethers_wallet = new Wallet(stored.private_key) as any;
        } catch (e) {
          console.error("Failed to restore wallet from private key", e);
        }
      }

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

  private updateActive() {
    this.linkedStorageManager.setLocal("active", this.active);
  }

  private updateStorage() {
    // Serialize accounts to plain objects for storage
    const serializableAccounts = this.accounts.map(account => ({
      name: account.name,
      mnemonic: account.mnemonic,
      private_key: account.private_key,
      public_key: account.public_key,
      address: account.address,
      derivationPath: account.derivationPath,
      owned_tokens: Object.fromEntries(account.owned_tokens)
    }));

    this.linkedStorageManager.setLocal("active", this.active);
    this.linkedStorageManager.setLocal("accounts", serializableAccounts);
  }

  CreateAccount(): number {
    let account = Account.Random(this.CreateRandomAccountName());
    let index = this.AddAccount(account);

    if (this.active == -1 || this.active != index) {
      this.active = index;
      this.notifyListeners();  // <-- make sure listeners are notified
    }

    this.updateStorage();
    return index;
  }

  AddAccount(account: Account): number {
    if (!account.mnemonic && !account.ethers_wallet) {
      console.error("Account to be added returned undefined or missing wallet. Please check.");
      return -1;
    }
    const index = this.accounts.push(account) - 1;
    this.notifyListeners(); // update UI,
    this.updateStorage();
    return index;
  }

  ImportAccount(mnemonic: string): number {
    let account = Account.FromMnemonic(mnemonic, this.CreateRandomAccountName(), "m/44'/60'/0'/0/0");
    let index = this.AddAccount(account);

    if (this.active == -1 || this.active != index) {
      this.active = index;
      this.notifyListeners();  // <-- make sure listeners are notified
    }

    this.updateStorage();
    return index;
  }

  ImportPrivateKey(privateKey: string, name: string = "Social Account"): number {
    // Check if we already have this account imported by pure address comparison (optional)
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
      console.error("Failed to import private key:", e);
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

    // Find the current highest index we have generated (from derivation path ending)
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
      account = Account.FromMnemonic(parentAccount.mnemonic.phrase, name, path);
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
        // Derive the next account
        const derivedIndex = this.DeriveNewAccount(parentIndex);
        const account = this.accounts[derivedIndex];

        if (!account || !account.address) {
          unusedIndices.push(derivedIndex);
          break;
        }

        console.log(`[Auto-Discovery] Scanning Account ${derivedIndex} (${account.address}) on ${providers.length} networks...`);

        // Check activity across all networks
        let isUsed = false;
        await Promise.all(providers.map(async (provider, idx) => {
          if (isUsed) return; // fast exit if already found
          try {
            const [txCount, balance] = await Promise.all([
              provider.getTransactionCount(account.address!),
              provider.getBalance(account.address!)
            ]);
            console.log(`[Auto-Discovery] Network ${idx} -> txCount: ${txCount}, balance: ${balance.toString()} wei`);
            if (txCount > 0 || balance > 0n) {
              isUsed = true;
            }
          } catch (e) {
            console.error(`[Auto-Discovery] RPC Error on Network ${idx}:`, e);
            // Ignore individual RPC failures
          }
        }));

        if (isUsed) {
          // Account was used, reset gap counter
          gap = 0;
          unusedIndices = []; // Keep all previous empty accounts to maintain derivation sequence
          console.log(`[Auto-Discovery] ✔ DISCOVERED USED ACCOUNT at index ${derivedIndex}: ${account.address}`);
        } else {
          // Account unused, increment gap
          gap++;
          unusedIndices.push(derivedIndex);
          console.log(`[Auto-Discovery] ✖ Account unused. Gap is now ${gap}/${gapLimit}`);
        }
      }

      // Remove only the trailing unused accounts
      // Kullanıcı talebi üzerine bakiye kontrolüne bakılmaksızın cüzdanlar silinmeden bırakılıyor
      // for (let i = unusedIndices.length - 1; i >= 0; i--) {
      //   this.RemoveAccount(unusedIndices[i]);
      // }

      this.SetActive(originalActive < this.accounts.length ? originalActive : 0);
    } catch (e) {
      console.warn("Auto-Discovery failed:", e);
      this.SetActive(originalActive < this.accounts.length ? originalActive : 0);
    }
  }

  RemoveAccount(account_index: number) {
    if (account_index < 0 || account_index >= this.accounts.length) {
      console.error("Account does not exist. Returning...");
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
      console.error("Invalid account index: " + index);
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
}
