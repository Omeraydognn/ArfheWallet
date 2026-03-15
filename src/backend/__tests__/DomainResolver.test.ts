/// <reference types="vitest/globals" />
import { isDomainName, isEnsDomain, isUdDomain, resolveDomain } from '../DomainResolver';

/**
 * DomainResolver testleri
 *
 * Pure fonksiyonlar (isDomainName, isEnsDomain, isUdDomain) doğrudan test edilir.
 * resolveDomain ağ çağrıları yapan async fonksiyonlar için import.meta.env mock'lanır.
 */

describe('DomainResolver', () => {

  // ─── isDomainName ──────────────────────────────────────────────
  describe('isDomainName', () => {
    it('ENS domain tanır (.eth)', () => {
      expect(isDomainName('vitalik.eth')).toBe(true);
    });

    it('UD domain tanır (.crypto)', () => {
      expect(isDomainName('brad.crypto')).toBe(true);
    });

    it('UD domain tanır (.wallet)', () => {
      expect(isDomainName('test.wallet')).toBe(true);
    });

    it('UD domain tanır (.nft)', () => {
      expect(isDomainName('my.nft')).toBe(true);
    });

    it('UD domain tanır (.dao)', () => {
      expect(isDomainName('arfhe.dao')).toBe(true);
    });

    it('UD domain tanır (.blockchain)', () => {
      expect(isDomainName('hello.blockchain')).toBe(true);
    });

    it('UD domain tanır (.x)', () => {
      expect(isDomainName('test.x')).toBe(true);
    });

    it('bilinmeyen suffix\'i reddeder', () => {
      expect(isDomainName('example.com')).toBe(false);
    });

    it('0x ile başlayan stringi reddeder', () => {
      expect(isDomainName('0x1234567890abcdef')).toBe(false);
    });

    it('boş string false döner', () => {
      expect(isDomainName('')).toBe(false);
    });

    it('büyük/küçük harf duyarsız çalışır', () => {
      expect(isDomainName('VITALIK.ETH')).toBe(true);
      expect(isDomainName('Brad.Crypto')).toBe(true);
    });

    it('boşluklu input trim eder', () => {
      expect(isDomainName('  vitalik.eth  ')).toBe(true);
    });
  });

  // ─── isEnsDomain ───────────────────────────────────────────────
  describe('isEnsDomain', () => {
    it('.eth domain tanır', () => {
      expect(isEnsDomain('vitalik.eth')).toBe(true);
    });

    it('.crypto ENS değildir', () => {
      expect(isEnsDomain('brad.crypto')).toBe(false);
    });

    it('.wallet ENS değildir', () => {
      expect(isEnsDomain('test.wallet')).toBe(false);
    });

    it('büyük harf .ETH tanır', () => {
      expect(isEnsDomain('TEST.ETH')).toBe(true);
    });
  });

  // ─── isUdDomain ────────────────────────────────────────────────
  describe('isUdDomain', () => {
    it('.crypto UD domain tanır', () => {
      expect(isUdDomain('brad.crypto')).toBe(true);
    });

    it('.nft UD domain tanır', () => {
      expect(isUdDomain('my.nft')).toBe(true);
    });

    it('.polygon UD domain tanır', () => {
      expect(isUdDomain('test.polygon')).toBe(true);
    });

    it('.bitcoin UD domain tanır', () => {
      expect(isUdDomain('myaddr.bitcoin')).toBe(true);
    });

    it('.888 UD domain tanır', () => {
      expect(isUdDomain('lucky.888')).toBe(true);
    });

    it('.zil UD domain tanır', () => {
      expect(isUdDomain('test.zil')).toBe(true);
    });

    it('.unstoppable UD domain tanır', () => {
      expect(isUdDomain('user.unstoppable')).toBe(true);
    });

    it('.pudgy UD domain tanır', () => {
      expect(isUdDomain('penguin.pudgy')).toBe(true);
    });

    it('.anime UD domain tanır', () => {
      expect(isUdDomain('test.anime')).toBe(true);
    });

    it('.eth UD domain değildir', () => {
      expect(isUdDomain('vitalik.eth')).toBe(false);
    });

    it('.com UD domain değildir', () => {
      expect(isUdDomain('example.com')).toBe(false);
    });
  });

  // ─── resolveDomain ─────────────────────────────────────────────
  describe('resolveDomain', () => {
    it('boş input hata döner', async () => {
      const result = await resolveDomain('');
      expect(result.address).toBeNull();
      expect(result.error).toBe('Empty input');
      expect(result.method).toBeNull();
    });

    it('bilinmeyen suffix hata döner', async () => {
      const result = await resolveDomain('example.com');
      expect(result.address).toBeNull();
      expect(result.error).toBe('Unrecognized domain suffix.');
      expect(result.method).toBeNull();
    });

    it('ENS domain için method "ens" döner', async () => {
      // resolveENS ağ çağrısı yapacak, muhtemelen hata verecek ama method doğru olmalı
      const result = await resolveDomain('nonexistent-test-domain-12345.eth');
      expect(result.method).toBe('ens');
      // address null olabilir (ağ yoksa veya kayıtlı değilse)
      if (!result.address) {
        expect(result.error).toBeTruthy();
      }
    });

    it('UD domain için method "ud" döner', async () => {
      // UD SDK yüklenemeyebilir ama method doğru olmalı
      const result = await resolveDomain('nonexistent-test-12345.crypto');
      expect(result.method).toBe('ud');
    });
  });
});
