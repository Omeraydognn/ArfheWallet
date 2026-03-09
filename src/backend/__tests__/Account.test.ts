/// <reference types="vitest/globals" />

/**
 * @vitest-environment node
 *
 * Account testleri node ortamında çalışır çünkü ethers.js'nin
 * HDNodeWallet.fromPhrase() metodu jsdom'un Buffer polyfill'i
 * ile uyumsuz.
 */
import Account from '../Account';
import { Wallet, HDNodeWallet, Mnemonic } from 'ethers';

describe('Account', () => {
  // ─── Static Factory: FromPrivateKey (polyfill gerektirmez) ─────
  describe('FromPrivateKey()', () => {
    const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    it('private key\'den geçerli hesap oluşturur', () => {
      const acc = Account.FromPrivateKey(TEST_PK, 'PK Test');
      expect(acc.GetAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(acc.GetName()).toBe('PK Test');
    });

    it('private key ile oluşturulan hesabın mnemonic\'i yoktur', () => {
      const acc = Account.FromPrivateKey(TEST_PK, 'No Mnemonic');
      const words = acc.GetWords();
      expect(words).toBeUndefined();
    });

    it('aynı private key her zaman aynı adresi üretir', () => {
      const acc1 = Account.FromPrivateKey(TEST_PK, 'PK1');
      const acc2 = Account.FromPrivateKey(TEST_PK, 'PK2');
      expect(acc1.GetAddress()).toBe(acc2.GetAddress());
    });

    it('0x prefix olmadan da çalışır', () => {
      const pkNoPrefix = TEST_PK.slice(2);
      const acc = Account.FromPrivateKey(pkNoPrefix, 'No Prefix');
      const accWith = Account.FromPrivateKey(TEST_PK, 'With Prefix');
      expect(acc.GetAddress()).toBe(accWith.GetAddress());
    });
  });

  // ─── Static Factory: FromMnemonic ──────────────────────────────
  describe('FromMnemonic()', () => {
    const TEST_MNEMONIC =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('aynı mnemonic her zaman aynı adresi üretir', () => {
      const acc1 = Account.FromMnemonic(TEST_MNEMONIC, 'M1');
      const acc2 = Account.FromMnemonic(TEST_MNEMONIC, 'M2');
      expect(acc1.GetAddress()).toBe(acc2.GetAddress());
    });

    it('varsayılan derivation path m/44\'/60\'/0\'/0/0 kullanır', () => {
      const acc = Account.FromMnemonic(TEST_MNEMONIC, 'Default Path');
      // Ethers ile doğrudan kontrol
      const expected = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(TEST_MNEMONIC),
        "m/44'/60'/0'/0/0"
      );
      expect(acc.GetAddress()!.toLowerCase()).toBe(expected.address.toLowerCase());
    });

    it('farklı derivation path farklı adres üretir', () => {
      const acc1 = Account.FromMnemonic(TEST_MNEMONIC, 'Path0');
      const acc2 = Account.FromMnemonic(TEST_MNEMONIC, 'Path1', "m/44'/60'/0'/0/1");
      expect(acc1.GetAddress()).not.toBe(acc2.GetAddress());
    });

    it('kısa adres formatı doğrudur', () => {
      const acc = Account.FromMnemonic(TEST_MNEMONIC, 'Short');
      const short = acc.GetShortAddress();
      const full = acc.GetAddress()!.toLowerCase();
      // GetShortAddress: first 8 chars + "..." + last 6 chars (lowercase)
      expect(short).toBe(`${full.slice(0, 8)}...${full.slice(-6)}`);
    });

    it('12 kelimelik mnemonic döner', () => {
      const acc = Account.FromMnemonic(TEST_MNEMONIC, 'Words');
      const words = acc.GetWords();
      expect(words).toBeDefined();
      expect(words!).toHaveLength(12);
    });

    it('GetPubKey geçerli public key döner', () => {
      const acc = Account.FromMnemonic(TEST_MNEMONIC, 'PubKey');
      const pubKey = acc.GetPubKey();
      expect(pubKey).toBeDefined();
      expect(pubKey!).toMatch(/^0x/);
    });
  });

  // ─── Token Management ──────────────────────────────────────────
  describe('Token Yönetimi', () => {
    let acc: Account;

    beforeEach(() => {
      // FromPrivateKey polyfill gerektirmez, her testte temiz hesap
      acc = Account.FromPrivateKey(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        'Token Test'
      );
    });

    it('başlangıçta hiçbir token yoktur', () => {
      expect(acc.HasToken(1, '0xabc')).toBe(false);
    });

    it('token ekleme ve kontrol', () => {
      acc.AddToken(1, '0xABC');
      expect(acc.HasToken(1, '0xabc')).toBe(true);
    });

    it('token kaldırma', () => {
      acc.AddToken(1, '0xABC');
      acc.RemoveToken(1, '0xABC');
      expect(acc.HasToken(1, '0xABC')).toBe(false);
    });

    it('farklı ağlardaki tokenlar bağımsızdır', () => {
      acc.AddToken(1, '0xABC');
      expect(acc.HasToken(1, '0xABC')).toBe(true);
      expect(acc.HasToken(42161, '0xABC')).toBe(false);
    });

    it('aynı token tekrar eklenmez (duplicate)', () => {
      acc.AddToken(1, '0xABC');
      acc.AddToken(1, '0xABC');
      const tokens = acc.GetOwnedTokens(1);
      expect(tokens.filter(t => t === '0xabc')).toHaveLength(1);
    });

    it('GetAllOwnedTokens tüm ağları döner', () => {
      acc.AddToken(1, '0xAAA');
      acc.AddToken(42161, '0xBBB');
      const all = acc.GetAllOwnedTokens();
      expect(all.size).toBe(2);
      expect(all.get(1)).toContain('0xaaa');
      expect(all.get(42161)).toContain('0xbbb');
    });
  });

  // ─── Security: wipeKeys ────────────────────────────────────────
  describe('wipeKeys()', () => {
    it('hassas alanları temizler', () => {
      const acc = Account.FromPrivateKey(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        'Wipe Test'
      );

      // Adres önce mevcut olmalı
      expect(acc.GetAddress()).toMatch(/^0x/);
      expect(acc.private_key).toBeDefined();

      acc.wipeKeys();

      // Wipe sonrası private fields temizlenmeli
      expect(acc.private_key).toBeUndefined();
      expect(acc.mnemonic).toBeUndefined();
      expect(acc.ethers_wallet).toBeUndefined();

      // address kalmalı (UI display için)
      expect(acc.address).toBeDefined();
    });

    it('SetName wipe sonrası çalışır', () => {
      const acc = Account.FromPrivateKey(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        'Name Test'
      );
      acc.wipeKeys();
      acc.SetName('New Name');
      expect(acc.GetName()).toBe('New Name');
    });
  });
});
