import Account from "./Account.js";

export default class AccountManager {
  active: number;
  accounts: Account[];
  private listeners: (() => void)[];

  constructor() {
    this.active = -1;
    this.accounts = [];
    this.listeners = [];
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

  CreateAccount(): number {
    let account = Account.Random(this.CreateRandomAccountName());
    let index = this.AddAccount(account);

    if (this.active == -1 || this.active != index) {
      this.active = index;
      this.notifyListeners();  // <-- make sure listeners are notified
    }

    return index;
  }

  AddAccount(account: Account): number {
    if (!account.entropy) {
      console.error("Account to be added returned undefined. Please check.");
      return -1;
    }
    const index = this.accounts.push(account) - 1;
    this.notifyListeners(); // update UI
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
    return true;
  }

  GetAll(): Account[] {
    return this.accounts;
  }

  private CreateRandomAccountName(): string {
    return "New User #" + (this.accounts.length + 1);
  }
}
