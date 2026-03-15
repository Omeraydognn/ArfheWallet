/// <reference types="vitest/globals" />
import TokenCache from '../TokenCache';
import type { TokenCacheItem } from '../TokenCache';
import StorageManager from '../StorageManager';
import { NetworkId } from '../NetworkTypes';

/**
 * TokenCache testleri
 *
 * StorageManager mock ile çalışır. Cache CRUD, network bazlı izolasyon,
 * storage persistence ve version migration test edilir.
 */
describe('TokenCache', () => {
  let cache: TokenCache;
  let mockStorage: StorageManager;
  let store: Record<string, any>;

  const sampleToken: TokenCacheItem = {
    contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    logoSrc: 'https://example.com/usdc.png',
  };

  const sampleToken2: TokenCacheItem = {
    contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    logoSrc: 'https://example.com/usdt.png',
  };

  beforeEach(() => {
    store = {};
    mockStorage = {
      getLocal: vi.fn((key: string) => store[key] ?? null),
      setLocal: vi.fn((key: string, value: unknown) => { store[key] = value; }),
      removeLocal: vi.fn((key: string) => { delete store[key]; }),
    } as unknown as StorageManager;

    // Set version to current to skip migration
    store['arfhe_token_cache_version'] = 2;

    cache = new TokenCache(mockStorage);
  });

  // ─── setToken / getToken ───────────────────────────────────────
  describe('setToken / getToken', () => {
    it('token ekler ve geri alır', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      const result = cache.getToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress);
      expect(result).toBeDefined();
      expect(result!.symbol).toBe('USDC');
      expect(result!.decimals).toBe(6);
    });

    it('contract address case-insensitive çalışır', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      const result = cache.getToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress.toUpperCase());
      expect(result).toBeDefined();
      expect(result!.symbol).toBe('USDC');
    });

    it('farklı network aynı adres ayrı tutulur', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      const result = cache.getToken(NetworkId.Arbitrum_One, sampleToken.contractAddress);
      expect(result).toBeUndefined();
    });

    it('aynı adres güncellenebilir', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      const updated = { ...sampleToken, logoSrc: 'https://new-logo.png' };
      cache.setToken(NetworkId.Ethereum_Mainnet, updated);
      const result = cache.getToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress);
      expect(result!.logoSrc).toBe('https://new-logo.png');
    });
  });

  // ─── hasToken ──────────────────────────────────────────────────
  describe('hasToken', () => {
    it('mevcut token için true döner', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      expect(cache.hasToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress)).toBe(true);
    });

    it('mevcut olmayan token için false döner', () => {
      expect(cache.hasToken(NetworkId.Ethereum_Mainnet, '0xNonExistent')).toBe(false);
    });

    it('farklı networkta false döner', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      expect(cache.hasToken(NetworkId.Arbitrum_One, sampleToken.contractAddress)).toBe(false);
    });
  });

  // ─── removeToken ───────────────────────────────────────────────
  describe('removeToken', () => {
    it('mevcut token siler ve true döner', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      const result = cache.removeToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress);
      expect(result).toBe(true);
      expect(cache.getToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress)).toBeUndefined();
    });

    it('olmayan token silmek false döner', () => {
      const result = cache.removeToken(NetworkId.Ethereum_Mainnet, '0xNonExistent');
      expect(result).toBe(false);
    });
  });

  // ─── getAllTokens ──────────────────────────────────────────────
  describe('getAllTokens', () => {
    it('belirli networktaki tüm tokenleri döner', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken2);
      const tokens = cache.getAllTokens(NetworkId.Ethereum_Mainnet);
      expect(tokens).toHaveLength(2);
    });

    it('boş network için boş dizi döner', () => {
      const tokens = cache.getAllTokens(NetworkId.Arbitrum_One);
      expect(tokens).toHaveLength(0);
    });
  });

  // ─── clearNetwork ──────────────────────────────────────────────
  describe('clearNetwork', () => {
    it('belirli networkun cache\'ini temizler', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      cache.setToken(NetworkId.Arbitrum_One, sampleToken2);

      cache.clearNetwork(NetworkId.Ethereum_Mainnet);

      expect(cache.getAllTokens(NetworkId.Ethereum_Mainnet)).toHaveLength(0);
      expect(cache.getAllTokens(NetworkId.Arbitrum_One)).toHaveLength(1);
    });
  });

  // ─── clearAll ──────────────────────────────────────────────────
  describe('clearAll', () => {
    it('tüm cache temizlenir', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      cache.setToken(NetworkId.Arbitrum_One, sampleToken2);

      cache.clearAll();

      expect(cache.getAllTokens(NetworkId.Ethereum_Mainnet)).toHaveLength(0);
      expect(cache.getAllTokens(NetworkId.Arbitrum_One)).toHaveLength(0);
    });

    it('clearAll storage\'dan da siler', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      cache.clearAll();
      expect(mockStorage.removeLocal).toHaveBeenCalledWith('arfhe_token_cache');
    });
  });

  // ─── Storage Persistence ───────────────────────────────────────
  describe('Storage Persistence', () => {
    it('setToken sonrası storage güncellenir', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      expect(mockStorage.setLocal).toHaveBeenCalledWith('arfhe_token_cache', expect.any(Object));
    });

    it('removeToken sonrası storage güncellenir', () => {
      cache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      cache.removeToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress);
      // setLocal hem setToken hem removeToken'da çağrılır
      expect(mockStorage.setLocal).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Version Migration ─────────────────────────────────────────
  describe('Version Migration', () => {
    it('eski version ile cache temizlenir', () => {
      store['arfhe_token_cache_version'] = 1; // Eski version
      store['arfhe_token_cache'] = { '1': { '0xabc': { symbol: 'OLD' } } };

      const freshCache = new TokenCache(mockStorage);
      // Migration eski cache'i temizlemeli
      expect(mockStorage.removeLocal).toHaveBeenCalledWith('arfhe_token_cache');
    });
  });

  // ─── StorageManager olmadan ────────────────────────────────────
  describe('StorageManager olmadan', () => {
    it('storage olmadan da çalışır (in-memory)', () => {
      const memCache = new TokenCache(); // No storage manager
      memCache.setToken(NetworkId.Ethereum_Mainnet, sampleToken);
      expect(memCache.getToken(NetworkId.Ethereum_Mainnet, sampleToken.contractAddress)).toBeDefined();
    });
  });
});
