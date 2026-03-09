/// <reference types="vitest/globals" />
import {
  getDAppsByCategory,
  getFeaturedDApps,
  searchDApps,
  getDAppById,
  getDAppsForChain,
  DAPP_REGISTRY,
  DAPP_CATEGORIES,
} from '../DAppRegistry';
import type { DAppCategory } from '../DAppRegistry';

/**
 * DAppRegistry testleri
 *
 * Pure fonksiyonlar ve statik registry verileri test edilir.
 * Ağ bağımlılığı yoktur.
 */
describe('DAppRegistry', () => {

  // ─── DAPP_CATEGORIES ──────────────────────────────────────────
  describe('DAPP_CATEGORIES', () => {
    it('en az 5 kategori tanımlıdır', () => {
      expect(DAPP_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    });

    it('her kategorinin id, label, labelKey, icon, color alanı vardır', () => {
      for (const cat of DAPP_CATEGORIES) {
        expect(cat.id).toBeTruthy();
        expect(cat.label).toBeTruthy();
        expect(cat.labelKey).toBeTruthy();
        expect(cat.icon).toBeTruthy();
        expect(cat.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('fhe kategorisi mevcuttur', () => {
      const fhe = DAPP_CATEGORIES.find(c => c.id === 'fhe');
      expect(fhe).toBeDefined();
      expect(fhe!.label).toBe('FHE Ecosystem');
    });
  });

  // ─── DAPP_REGISTRY ────────────────────────────────────────────
  describe('DAPP_REGISTRY', () => {
    it('en az 10 dApp kayıtlıdır', () => {
      expect(DAPP_REGISTRY.length).toBeGreaterThanOrEqual(10);
    });

    it('her dApp\'ın gerekli alanları vardır', () => {
      for (const dapp of DAPP_REGISTRY) {
        expect(dapp.id).toBeTruthy();
        expect(dapp.name).toBeTruthy();
        expect(dapp.description).toBeTruthy();
        expect(dapp.url).toMatch(/^https:\/\//);
        expect(dapp.category).toBeTruthy();
        expect(Array.isArray(dapp.chains)).toBe(true);
        expect(Array.isArray(dapp.tags)).toBe(true);
      }
    });

    it('tüm dApp ID\'leri benzersizdir', () => {
      const ids = DAPP_REGISTRY.map(d => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ─── getDAppsByCategory ────────────────────────────────────────
  describe('getDAppsByCategory', () => {
    it('defi kategorisindeki dApp\'ları getirir', () => {
      const defi = getDAppsByCategory('defi');
      expect(defi.length).toBeGreaterThan(0);
      defi.forEach(d => expect(d.category).toBe('defi'));
    });

    it('fhe kategorisindeki dApp\'ları getirir', () => {
      const fhe = getDAppsByCategory('fhe');
      expect(fhe.length).toBeGreaterThan(0);
      fhe.forEach(d => expect(d.category).toBe('fhe'));
    });

    it('dex kategorisindeki dApp\'ları getirir', () => {
      const dex = getDAppsByCategory('dex');
      expect(dex.length).toBeGreaterThan(0);
      dex.forEach(d => expect(d.category).toBe('dex'));
    });

    it('var olmayan kategori boş dizi döner', () => {
      const result = getDAppsByCategory('nonexistent' as DAppCategory);
      expect(result).toHaveLength(0);
    });
  });

  // ─── getFeaturedDApps ──────────────────────────────────────────
  describe('getFeaturedDApps', () => {
    it('featured dApp\'lar döner', () => {
      const featured = getFeaturedDApps();
      expect(featured.length).toBeGreaterThan(0);
      featured.forEach(d => expect(d.featured).toBe(true));
    });

    it('Uniswap featured listesindedir', () => {
      const featured = getFeaturedDApps();
      const uniswap = featured.find(d => d.id === 'uniswap');
      expect(uniswap).toBeDefined();
    });
  });

  // ─── searchDApps ───────────────────────────────────────────────
  describe('searchDApps', () => {
    it('isimle arama yapar', () => {
      const results = searchDApps('Uniswap');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Uniswap');
    });

    it('açıklama ile arama yapar', () => {
      const results = searchDApps('lending');
      expect(results.length).toBeGreaterThan(0);
    });

    it('tag ile arama yapar', () => {
      const results = searchDApps('swap');
      expect(results.length).toBeGreaterThan(0);
    });

    it('kategori ile arama yapar', () => {
      const results = searchDApps('bridge');
      expect(results.length).toBeGreaterThan(0);
    });

    it('büyük/küçük harf duyarsız arama yapar', () => {
      const results = searchDApps('AAVE');
      expect(results.length).toBeGreaterThan(0);
    });

    it('boş sorgu tüm dApp\'ları döner', () => {
      const results = searchDApps('');
      expect(results.length).toBe(DAPP_REGISTRY.length);
    });

    it('eşleşme yoksa boş dizi döner', () => {
      const results = searchDApps('zzzznonexistent12345');
      expect(results).toHaveLength(0);
    });
  });

  // ─── getDAppById ───────────────────────────────────────────────
  describe('getDAppById', () => {
    it('uniswap ID ile dApp bulur', () => {
      const dapp = getDAppById('uniswap');
      expect(dapp).toBeDefined();
      expect(dapp!.name).toBe('Uniswap');
    });

    it('aave-v3 ID ile dApp bulur', () => {
      const dapp = getDAppById('aave-v3');
      expect(dapp).toBeDefined();
      expect(dapp!.name).toBe('Aave V3');
    });

    it('olmayan ID undefined döner', () => {
      const dapp = getDAppById('nonexistent-id');
      expect(dapp).toBeUndefined();
    });
  });

  // ─── getDAppsForChain ──────────────────────────────────────────
  describe('getDAppsForChain', () => {
    it('Ethereum Mainnet (chainId=1) dApp\'larını getirir', () => {
      const results = getDAppsForChain(1);
      expect(results.length).toBeGreaterThan(0);
      results.forEach(d => {
        expect(d.chains.length === 0 || d.chains.includes(1)).toBe(true);
      });
    });

    it('Arbitrum (chainId=42161) dApp\'larını getirir', () => {
      const results = getDAppsForChain(42161);
      expect(results.length).toBeGreaterThan(0);
    });

    it('Base (chainId=8453) dApp\'larını getirir', () => {
      const results = getDAppsForChain(8453);
      expect(results.length).toBeGreaterThan(0);
    });

    it('Fhenix Sepolia (chainId=8008135) dApp\'larını getirir', () => {
      const results = getDAppsForChain(8008135);
      // Fhenix FHE dApp'lar bu chain'de olmalı
      expect(results.length).toBeGreaterThan(0);
    });

    it('chains boş olan dApp\'lar her zincirde görünür', () => {
      // Zama'nın chains: [] olduğu için tüm zincirlerde gelmeli
      const results = getDAppsForChain(999999);
      const zama = results.find(d => d.id === 'zama');
      expect(zama).toBeDefined();
    });
  });
});
