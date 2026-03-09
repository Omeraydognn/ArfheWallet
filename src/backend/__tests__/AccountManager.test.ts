/// <reference types="vitest/globals" />

/**
 * @vitest-environment node
 *
 * AccountManager testleri node ortamında çalışır çünkü
 * Account.Random() ve Account.FromMnemonic() ethers.js HDNodeWallet
 * kullanır — jsdom Buffer ile uyumsuz.
 */
import AccountManager from '../AccountManager';
import Account from '../Account';
import StorageManager from '../StorageManager';

describe('AccountManager', () => {
  let manager: AccountManager;
  let mockStorage: StorageManager;
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    mockStorage = {
      getLocal: vi.fn((key: string) => store[key] ?? null),
      setLocal: vi.fn((key: string, value: unknown) => { store[key] = value; }),
      removeLocal: vi.fn((key: string) => { delete store[key]; }),
      isUnlocked: vi.fn(() => false),
      encryptAndStore: vi.fn(async () => {}),
      decryptAndRetrieve: vi.fn(async () => null),
      migrateToEncrypted: vi.fn(async () => {}),
    } as unknown as StorageManager;

    manager = new AccountManager(mockStorage);
  });

  // ─── Constructor ───────────────────────────────────────────────
  describe('Constructor', () => {
    it('boş storage ile başlatıldığında hesap listesi boştur', () => {
      expect(manager.GetAll()).toHaveLength(0);
      expect(manager.GetActiveIndex()).toBe(-1);
      expect(manager.GetActive()).toBeUndefined();
    });

    it('mevcut plaintext accounts ile başlatıldığında hydrate eder', () => {
      const pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const acc = Account.FromPrivateKey(pk, 'Stored');
      store['accounts'] = [{
        name: acc.name,
        mnemonic: acc.mnemonic,
        private_key: acc.private_key,
        public_key: acc.public_key,
        address: acc.address,
        derivationPath: acc.derivationPath,
        owned_tokens: {},
      }];
      store['active'] = 0;

      const mgr = new AccountManager(mockStorage);
      expect(mgr.GetAll()).toHaveLength(1);
      expect(mgr.GetActiveIndex()).toBe(0);
      expect(mgr.GetActive()?.GetName()).toBe('Stored');
    });
  });

  // ─── CreateAccount ─────────────────────────────────────────────
  describe('CreateAccount', () => {
    it('yeni rastgele hesap oluşturur', () => {
      const index = manager.CreateAccount();
      expect(index).toBe(0);
      expect(manager.GetAll()).toHaveLength(1);
      expect(manager.GetActiveIndex()).toBe(0);
    });

    it('oluşturulan hesabın geçerli adresi vardır', () => {
      manager.CreateAccount();
      const acc = manager.GetActive();
      expect(acc).toBeDefined();
      expect(acc!.GetAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('birden fazla hesap oluşturulabilir', () => {
      manager.CreateAccount();
      manager.CreateAccount();
      manager.CreateAccount();
      expect(manager.GetAll()).toHaveLength(3);
    });

    it('oluşturma sonrası storage güncellenir', () => {
      manager.CreateAccount();
      expect(mockStorage.setLocal).toHaveBeenCalled();
    });
  });

  // ─── AddAccount ────────────────────────────────────────────────
  describe('AddAccount', () => {
    it('geçerli hesap ekler ve index döner', () => {
      const pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const acc = Account.FromPrivateKey(pk, 'Test');
      const index = manager.AddAccount(acc);
      expect(index).toBe(0);
      expect(manager.GetAll()).toHaveLength(1);
    });

    it('wallet olmayan hesap eklenmez (-1 döner)', () => {
      const acc = new Account();
      // mnemonic ve ethers_wallet yok
      const index = manager.AddAccount(acc);
      expect(index).toBe(-1);
    });
  });

  // ─── ImportAccount (mnemonic) ──────────────────────────────────
  describe('ImportAccount', () => {
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('mnemonic ile hesap import eder', () => {
      const index = manager.ImportAccount(TEST_MNEMONIC);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(manager.GetAll()).toHaveLength(1);
    });

    it('import edilen hesap aktif olarak ayarlanır', () => {
      const index = manager.ImportAccount(TEST_MNEMONIC);
      expect(manager.GetActiveIndex()).toBe(index);
    });

    it('import edilen hesabın geçerli adresi vardır', () => {
      manager.ImportAccount(TEST_MNEMONIC);
      const acc = manager.GetActive();
      expect(acc!.GetAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  // ─── ImportPrivateKey ──────────────────────────────────────────
  describe('ImportPrivateKey', () => {
    const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    it('private key ile hesap import eder', () => {
      const index = manager.ImportPrivateKey(TEST_PK, 'PK Account');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(manager.GetActive()?.GetName()).toBe('PK Account');
    });

    it('geçersiz private key ile -1 döner', () => {
      const index = manager.ImportPrivateKey('invalid-key', 'Bad');
      expect(index).toBe(-1);
    });

    it('isim verilmezse varsayılan isim kullanılır', () => {
      const index = manager.ImportPrivateKey(TEST_PK);
      expect(manager.accounts[index].GetName()).toBe('Social Account');
    });
  });

  // ─── SetActive / GetActive ─────────────────────────────────────
  describe('SetActive / GetActive', () => {
    it('geçerli index ile aktif hesap değiştirir', () => {
      manager.CreateAccount();
      manager.CreateAccount();
      const result = manager.SetActive(1);
      expect(result).toBe(true);
      expect(manager.GetActiveIndex()).toBe(1);
    });

    it('geçersiz index ile false döner', () => {
      manager.CreateAccount();
      expect(manager.SetActive(5)).toBe(false);
      expect(manager.SetActive(-1)).toBe(false);
    });

    it('hesap yokken GetActive undefined döner', () => {
      expect(manager.GetActive()).toBeUndefined();
    });
  });

  // ─── RemoveAccount ─────────────────────────────────────────────
  describe('RemoveAccount', () => {
    it('hesap siler', () => {
      manager.CreateAccount();
      manager.CreateAccount();
      expect(manager.GetAll()).toHaveLength(2);

      manager.RemoveAccount(0);
      expect(manager.GetAll()).toHaveLength(1);
    });

    it('aktif hesap silinince active -1 olur', () => {
      manager.CreateAccount();
      manager.RemoveAccount(0);
      expect(manager.GetActiveIndex()).toBe(-1);
    });

    it('geçersiz index ile silme yapılmaz', () => {
      manager.CreateAccount();
      manager.RemoveAccount(99);
      expect(manager.GetAll()).toHaveLength(1);
    });
  });

  // ─── DeriveNewAccount ──────────────────────────────────────────
  describe('DeriveNewAccount', () => {
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('mnemonic hesaptan yeni hesap türetir', () => {
      manager.ImportAccount(TEST_MNEMONIC);
      const derivedIndex = manager.DeriveNewAccount(0);
      expect(derivedIndex).toBeGreaterThan(0);
      expect(manager.GetAll()).toHaveLength(2);
    });

    it('türetilen hesap farklı adrese sahiptir', () => {
      manager.ImportAccount(TEST_MNEMONIC);
      const parent = manager.accounts[0];
      manager.DeriveNewAccount(0);
      const derived = manager.accounts[1];
      expect(derived.GetAddress()).not.toBe(parent.GetAddress());
    });

    it('private key hesaptan social derivation yapar', () => {
      const pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      manager.ImportPrivateKey(pk, 'PK Parent');
      const derivedIndex = manager.DeriveNewAccount(0);
      expect(derivedIndex).toBeGreaterThan(0);
      expect(manager.accounts[derivedIndex].derivationPath).toContain('social/');
    });

    it('hesap yokken hata fırlatır', () => {
      expect(() => manager.DeriveNewAccount(0)).toThrow();
    });
  });

  // ─── CanDeriveNewAccount ───────────────────────────────────────
  describe('CanDeriveNewAccount', () => {
    it('hesap yokken false döner', () => {
      expect(manager.CanDeriveNewAccount()).toBe(false);
    });

    it('hesap varken true döner', () => {
      manager.CreateAccount();
      expect(manager.CanDeriveNewAccount()).toBe(true);
    });
  });

  // ─── clearSensitiveData ────────────────────────────────────────
  describe('clearSensitiveData', () => {
    it('tüm hesapların hassas verilerini temizler', () => {
      manager.CreateAccount();
      manager.CreateAccount();
      const spies = manager.GetAll().map(acc => vi.spyOn(acc, 'wipeKeys'));

      manager.clearSensitiveData();

      spies.forEach(spy => expect(spy).toHaveBeenCalled());
    });
  });

  // ─── subscribe ─────────────────────────────────────────────────
  describe('subscribe', () => {
    it('listener eklenir ve hesap değişikliğinde çağrılır', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      manager.CreateAccount();
      expect(listener).toHaveBeenCalled();
    });

    it('unsubscribe sonrası listener çağrılmaz', () => {
      const listener = vi.fn();
      const unsub = manager.subscribe(listener);
      unsub();
      manager.CreateAccount();
      // CreateAccount notifyListeners'ı çağırır ama listener artık yoktur
      // Ancak AddAccount da notifyListeners çağırıyor, o yüzden listener
      // henüz unsubscribe edilmişse çağrılmamalı
      // Not: CreateAccount -> AddAccount -> notifyListeners (listener unsubscribed)
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── loadFromEncryptedStorage ──────────────────────────────────
  describe('loadFromEncryptedStorage', () => {
    it('encrypted storage boşken mevcut hesapları korur', async () => {
      manager.CreateAccount();
      expect(manager.GetAll()).toHaveLength(1);

      await manager.loadFromEncryptedStorage();
      // decryptAndRetrieve null döner, mevcut hesaplar korunur
      expect(manager.GetAll()).toHaveLength(1);
    });

    it('encrypted storage verisi varken hesapları yükler', async () => {
      const pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const acc = Account.FromPrivateKey(pk, 'Encrypted');
      const storedAccounts = [{
        name: acc.name,
        mnemonic: acc.mnemonic,
        private_key: acc.private_key,
        public_key: acc.public_key,
        address: acc.address,
        derivationPath: acc.derivationPath,
        owned_tokens: {},
      }];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock override for test
      (mockStorage.decryptAndRetrieve as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(storedAccounts)
        .mockResolvedValueOnce(0);

      await manager.loadFromEncryptedStorage();
      expect(manager.GetAll()).toHaveLength(1);
      expect(manager.GetActive()?.GetName()).toBe('Encrypted');
    });
  });
});
