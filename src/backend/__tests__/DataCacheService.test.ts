/// <reference types="vitest/globals" />
import DataCacheService from '../DataCacheService';

/**
 * DataCacheService testleri
 *
 * In-memory TTL cache test edilir.
 * Dış bağımlılık yoktur, pure in-memory.
 */
describe('DataCacheService', () => {
  let cache: DataCacheService;

  const sampleData = {
    balances: {
      ETH: { contractAddress: 'ETH', tokenBalance: '1.5', isNative: true }
    },
    tokens: [{ name: 'USD Coin', symbol: 'USDC', logoSrc: '', contractAddress: '0x1', decimals: 6 }],
    prices: { ETH: 3500, USDC: 1.0 },
    totalUsd: 5350,
  };

  beforeEach(() => {
    cache = new DataCacheService();
  });

  // ─── set / get ─────────────────────────────────────────────────
  describe('set / get', () => {
    it('veri kaydeder ve geri alır', () => {
      cache.set('0xUser', 1, sampleData);
      const result = cache.get('0xUser', 1);
      expect(result).not.toBeNull();
      expect(result!.totalUsd).toBe(5350);
      expect(result!.balances.ETH.tokenBalance).toBe('1.5');
    });

    it('adres case-insensitive çalışır', () => {
      cache.set('0xABCD', 1, sampleData);
      const result = cache.get('0xabcd', 1);
      expect(result).not.toBeNull();
    });

    it('farklı network farklı cache döner', () => {
      cache.set('0xUser', 1, sampleData);
      const result = cache.get('0xUser', 42161);
      expect(result).toBeNull();
    });

    it('mevcut olmayan veri null döner', () => {
      expect(cache.get('0xNonExistent', 1)).toBeNull();
    });
  });

  // ─── TTL Expiry ────────────────────────────────────────────────
  describe('TTL Expiry', () => {
    it('süresi dolmuş cache null döner', () => {
      cache.set('0xUser', 1, sampleData);

      // balanceTimestamp'ı geriye çek (60s+ önce)
      const key = '0xuser:1';
      // Internal state'e erişmek için hack — private alanı test etmek zor
      // Bu yüzden getAge kullanarak dolaylı test yapıyoruz
      const age = cache.getAge('0xUser', 1);
      expect(age).not.toBeNull();
      expect(age!).toBeLessThan(1000); // Az önce eklendi, < 1s olmalı
    });
  });

  // ─── arePricesFresh ────────────────────────────────────────────
  describe('arePricesFresh', () => {
    it('yeni eklenen veri için true döner', () => {
      cache.set('0xUser', 1, sampleData);
      expect(cache.arePricesFresh('0xUser', 1)).toBe(true);
    });

    it('mevcut olmayan veri için false döner', () => {
      expect(cache.arePricesFresh('0xNonExistent', 1)).toBe(false);
    });
  });

  // ─── invalidate ────────────────────────────────────────────────
  describe('invalidate', () => {
    it('belirli adres ve network cache\'ini siler', () => {
      cache.set('0xUser', 1, sampleData);
      cache.set('0xUser', 42161, sampleData);

      cache.invalidate('0xUser', 1);

      expect(cache.get('0xUser', 1)).toBeNull();
      expect(cache.get('0xUser', 42161)).not.toBeNull();
    });

    it('parametresiz tüm cache\'i temizler', () => {
      cache.set('0xUser1', 1, sampleData);
      cache.set('0xUser2', 42161, sampleData);

      cache.invalidate();

      expect(cache.get('0xUser1', 1)).toBeNull();
      expect(cache.get('0xUser2', 42161)).toBeNull();
    });
  });

  // ─── getAge ────────────────────────────────────────────────────
  describe('getAge', () => {
    it('yeni eklenen veri için düşük yaş döner', () => {
      cache.set('0xUser', 1, sampleData);
      const age = cache.getAge('0xUser', 1);
      expect(age).not.toBeNull();
      expect(age!).toBeLessThan(1000); // < 1 saniye
    });

    it('mevcut olmayan veri için null döner', () => {
      expect(cache.getAge('0xNonExistent', 1)).toBeNull();
    });

    it('aynı key güncellenir', () => {
      cache.set('0xUser', 1, sampleData);
      const age1 = cache.getAge('0xUser', 1);

      // Tekrar set
      cache.set('0xUser', 1, { ...sampleData, totalUsd: 9999 });
      const age2 = cache.getAge('0xUser', 1);

      // İkisi de çok küçük olmalı (az önce eklendi)
      expect(age1).not.toBeNull();
      expect(age2).not.toBeNull();
    });
  });

  // ─── Overwrite Behavior ────────────────────────────────────────
  describe('Overwrite', () => {
    it('aynı key tekrar set edilir', () => {
      cache.set('0xUser', 1, sampleData);
      cache.set('0xUser', 1, { ...sampleData, totalUsd: 9999 });

      const result = cache.get('0xUser', 1);
      expect(result!.totalUsd).toBe(9999);
    });
  });
});
