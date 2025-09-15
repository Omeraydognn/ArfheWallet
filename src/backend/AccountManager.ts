import Account from "./Account.js";
import StorageManager from "./StorageManager.js";

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
      account.owned_tokens = new Map(
        stored.owned_tokens
          ? Object.entries(stored.owned_tokens).map(([key, value]) => [
              Number(key),
              Array.isArray(value) ? value.map(String) : [],
            ])
          : []
      );
      account.ethers_wallet = undefined; // ethers_wallet is not stored; recreate if needed
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
    if (!account.mnemonic) {
      console.error("Account to be added returned undefined. Please check.");
      return -1;
    }
    const index = this.accounts.push(account) - 1;
    this.notifyListeners(); // update UI,
    this.updateStorage();
    return index;
  }

  ImportAccount(mnemonic: string): number {
    let account = Account.FromMnemonic(mnemonic, this.CreateRandomAccountName());
    let index = this.AddAccount(account);

    if (this.active == -1 || this.active != index) {
      this.active = index;
      this.notifyListeners();  // <-- make sure listeners are notified
    }

    this.updateStorage();
    return index;
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
