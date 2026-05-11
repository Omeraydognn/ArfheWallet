export interface VaultEntry {
  id: string;
  amount: string;
  timestamp: number;
  txHash?: string;
  revealed: boolean;
  revealedValue?: string;
  source: 'shield' | 'send';
}

const KEY_PREFIX = "arfhe_vault_";

export class FheVaultService {
  private static key(addr: string): string {
    return KEY_PREFIX + addr;
  }

  static load(addr: string): VaultEntry[] {
    try {
      const raw = localStorage.getItem(this.key(addr));
      return raw ? (JSON.parse(raw) as VaultEntry[]) : [];
    } catch {
      return [];
    }
  }

  private static save(addr: string, entries: VaultEntry[]): void {
    localStorage.setItem(this.key(addr), JSON.stringify(entries));
  }

  static add(addr: string, entry: Omit<VaultEntry, 'timestamp'>): void {
    const list = this.load(addr);
    list.unshift({ ...entry, timestamp: Date.now() });
    this.save(addr, list);
  }

  static markRevealed(addr: string, id: string, value: string): void {
    const list = this.load(addr).map(e =>
      e.id === id ? { ...e, revealed: true, revealedValue: value } : e
    );
    this.save(addr, list);
  }

  static setTxHash(addr: string, id: string, txHash: string): void {
    const list = this.load(addr).map(e =>
      e.id === id ? { ...e, txHash } : e
    );
    this.save(addr, list);
  }

  static remove(addr: string, id: string): void {
    this.save(addr, this.load(addr).filter(e => e.id !== id));
  }

  static totalShielded(addr: string): number {
    return this.load(addr)
      .filter(e => !e.revealed)
      .reduce((sum, e) => sum + parseFloat(e.amount ?? "0"), 0);
  }
}

export default FheVaultService;
