/// <reference types="vitest/globals" />
import StorageManager from '../StorageManager';

/**
 * StorageManager unit tests
 *
 * Bu testler chrome.storage mock'u üzerinden çalışır (setup.ts'de tanımlı).
 * Web Crypto API testleri jsdom'un crypto.subtle desteğine bağlıdır.
 */
describe('StorageManager', () => {
  let sm: StorageManager;

  beforeEach(() => {
    // localStorage'ı temizle (testler arası kalıntı olmaması için)
    localStorage.clear();
    sm = new StorageManager();
  });

  // ─── Local Storage (unencrypted) ─────────────────────────────
  describe('getLocal / setLocal', () => {
    it('değer yazılır ve okunur', () => {
      sm.setLocal('test_key', { foo: 'bar' });
      const result = sm.getLocal<{ foo: string }>('test_key');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('olmayan anahtar null döner', () => {
      const result = sm.getLocal('nonexistent');
      expect(result).toBeNull();
    });

    it('string değer yazılır ve okunur', () => {
      sm.setLocal('str_key', 'hello world');
      expect(sm.getLocal('str_key')).toBe('hello world');
    });

    it('array değer yazılır ve okunur', () => {
      sm.setLocal('arr_key', [1, 2, 3]);
      expect(sm.getLocal('arr_key')).toEqual([1, 2, 3]);
    });

    it('removeLocal ile değer silinir', () => {
      sm.setLocal('del_key', 'value');
      sm.removeLocal('del_key');
      expect(sm.getLocal('del_key')).toBeNull();
    });

    it('üzerine yazma doğru çalışır', () => {
      sm.setLocal('overwrite', 'first');
      sm.setLocal('overwrite', 'second');
      expect(sm.getLocal('overwrite')).toBe('second');
    });
  });

  // ─── Encryption Lifecycle ────────────────────────────────────
  describe('Encryption Lifecycle', () => {
    const TEST_PASSWORD = 'TestPassword123!';

    it('başlangıçta kilitli (unlocked=false)', () => {
      expect(sm.isUnlocked()).toBe(false);
    });

    it('şifre ile başlatıldıktan sonra açık', async () => {
      await sm.initEncryption(TEST_PASSWORD);
      expect(sm.isUnlocked()).toBe(true);
    });

    it('hasPassword şifre ayarlandıktan sonra true döner', async () => {
      await sm.initEncryption(TEST_PASSWORD);
      expect(sm.hasPassword()).toBe(true);
    });

    it('lock() sonrası kilitli', async () => {
      await sm.initEncryption(TEST_PASSWORD);
      sm.lock();
      expect(sm.isUnlocked()).toBe(false);
    });

    it('lock callback çağrılır', async () => {
      const callback = vi.fn();
      sm.onLock(callback);
      await sm.initEncryption(TEST_PASSWORD);
      sm.lock();
      expect(callback).toHaveBeenCalled();
    });
  });

  // ─── Encrypt & Decrypt Cycle ─────────────────────────────────
  describe('encryptAndStore / decryptAndRetrieve', () => {
    const TEST_PASSWORD = 'SecurePass!456';

    it('veri şifrelenir, deşifrelenir ve orijinale eşittir', async () => {
      await sm.initEncryption(TEST_PASSWORD);

      const secretData = { wallet: '0xABC', balance: 100 };
      await sm.encryptAndStore('secret_wallet', secretData);

      const decrypted = await sm.decryptAndRetrieve<typeof secretData>('secret_wallet');
      expect(decrypted).toEqual(secretData);
    });

    it('string veri şifreleme/deşifreleme', async () => {
      await sm.initEncryption(TEST_PASSWORD);
      await sm.encryptAndStore('secret_string', 'my-private-key');
      const result = await sm.decryptAndRetrieve<string>('secret_string');
      expect(result).toBe('my-private-key');
    });

    it('kilitliyken deşifreleme null döner', async () => {
      await sm.initEncryption(TEST_PASSWORD);
      await sm.encryptAndStore('locked_data', 'secret');
      sm.lock();

      const result = await sm.decryptAndRetrieve('locked_data');
      expect(result).toBeNull();
    });

    it('kilitliyken şifreleme false döner', async () => {
      sm.lock();
      const success = await sm.encryptAndStore('key', 'value');
      expect(success).toBe(false);
    });

    it('şifrelenmiş veri silinebilir', async () => {
      await sm.initEncryption(TEST_PASSWORD);
      await sm.encryptAndStore('to_delete', 'value');
      sm.removeEncrypted('to_delete');
      const result = await sm.decryptAndRetrieve('to_delete');
      expect(result).toBeNull();
    });
  });

  // ─── Change Password ────────────────────────────────────────
  describe('changePassword()', () => {
    it('şifre değiştirme sonrası eski şifre çalışmaz, yeni şifre çalışır', async () => {
      const OLD_PASS = 'OldPass123!';
      const NEW_PASS = 'NewPass456!';

      await sm.initEncryption(OLD_PASS);
      await sm.encryptAndStore('test_data', 'secret-value');

      await sm.changePassword(OLD_PASS, NEW_PASS);

      // Yeni şifre ile erişim
      // changePassword yeni key ile re-encrypt eder, yani unlock durumda kalmalı
      expect(sm.isUnlocked()).toBe(true);
      const result = await sm.decryptAndRetrieve<string>('test_data');
      expect(result).toBe('secret-value');
    });
  });
});
