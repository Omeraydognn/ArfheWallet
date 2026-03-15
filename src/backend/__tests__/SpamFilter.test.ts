/// <reference types="vitest/globals" />
import SpamFilter from '../SpamFilter';

/**
 * SpamFilter unit tests
 *
 * Not: SpamFilter constructor'a opsiyonel StorageManager alır.
 * Storage gerektirmeyen pure-logic testleri yapıyoruz.
 */
describe('SpamFilter', () => {
  let filter: SpamFilter;

  beforeEach(() => {
    // StorageManager olmadan oluştur — pure in-memory mode
    filter = new SpamFilter();
  });

  afterEach(() => {
    filter.clearAll();
  });

  // ─── Bilinen Spam Kontratlar ─────────────────────────────────
  describe('Known Spam Contracts', () => {
    it('bilinen spam kontrat adresini spam olarak işaretler', () => {
      // Known spam contract from KNOWN_SPAM_CONTRACTS set
      const result = filter.checkToken(
        1,
        '0x0000000000004946c0e9f43f4dee607b0ef1fa1c', // chi gastoken (known spam)
        'CHI',
        'Chi Gastoken',
        0,
        false,
        false
      );
      expect(result.isSpam).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  // ─── Beyaz Liste ─────────────────────────────────────────────
  describe('Whitelisted Tokens', () => {
    it('ETH sembolü her zaman güvenli (whitelist)', () => {
      const result = filter.checkToken(
        1,
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        'ETH',
        'Ethereum',
        18,
        true,
        false
      );
      expect(result.isSpam).toBe(false);
      expect(result.score).toBe(0);
    });

    it('USDC sembolü whitelist\'te', () => {
      const result = filter.checkToken(
        1,
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        'USDC',
        'USD Coin',
        6,
        true,
        false
      );
      expect(result.isSpam).toBe(false);
    });

    it('WETH sembolü whitelist\'te', () => {
      const result = filter.checkToken(
        1,
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        'WETH',
        'Wrapped Ether',
        18,
        true,
        false
      );
      expect(result.isSpam).toBe(false);
    });
  });

  // ─── Spam İsim/Sembol Kalıpları ──────────────────────────────
  describe('Spam Name/Symbol Patterns', () => {
    it('URL içeren token adı spam', () => {
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        'FREETOKEN',
        'Visit http://free-airdrop.com to claim',
        18,
        false,
        false
      );
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.reasons.some((r: string) => r.toLowerCase().includes('phishing') || r.toLowerCase().includes('url') || r.toLowerCase().includes('pattern'))).toBe(true);
    });

    it('"airdrop" içeren token adı şüpheli', () => {
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        'AIRDROP',
        'Free Airdrop Token',
        18,
        false,
        false
      );
      expect(result.score).toBeGreaterThan(0);
    });

    it('$ işareti içeren token sembolü şüpheli', () => {
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        '$1000USDT',
        'Claim 1000 USDT',
        18,
        false,
        false
      );
      expect(result.score).toBeGreaterThan(0);
    });
  });

  // ─── Decimal Anomalileri ─────────────────────────────────────
  describe('Decimal Anomalies', () => {
    it('25 decimal olan token şüpheli', () => {
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        'WEIRD',
        'Weird Token',
        25,
        false,
        false
      );
      expect(result.reasons.some((r: string) => r.includes('decimal') || r.includes('Decimal'))).toBe(true);
    });

    it('18 decimal normal token cezalanmaz (decimal kontrolü)', () => {
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        'NORMAL',
        'Normal Token',
        18,
        true,
        false
      );
      expect(result.reasons.every((r: string) => !r.includes('decimal') && !r.includes('Decimal'))).toBe(true);
    });
  });

  // ─── Alchemy Spam Flag ───────────────────────────────────────
  describe('Alchemy Spam Flag', () => {
    it('Alchemy tarafından spam işaretlenmiş token yüksek skor alır', () => {
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        'SCAM',
        'Scam Token',
        18,
        false,
        true // isAlchemySpam = true
      );
      expect(result.score).toBeGreaterThanOrEqual(25);
    });
  });

  // ─── Aşırı Uzun İsim ────────────────────────────────────────
  describe('Long Token Name', () => {
    it('50 karakterden uzun token adı ceza alır', () => {
      const longName = 'A'.repeat(60);
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        'LONG',
        longName,
        18,
        false,
        false
      );
      expect(result.reasons.some((r: string) => r.toLowerCase().includes('long') || r.toLowerCase().includes('excessive'))).toBe(true);
    });
  });

  // ─── Skor Eşikleri ──────────────────────────────────────────
  describe('Score Thresholds', () => {
    it('skor 60+ olan token isSpam=true', () => {
      // Use Alchemy spam + no logo + weird decimal + long name to exceed 60
      const result = filter.checkToken(
        1,
        '0x1234567890123456789012345678901234567890',
        '$SCAM',
        'Visit http://scam.com to claim your free tokens now Visit http://scam.com',
        25,
        false,
        true
      );
      expect(result.isSpam).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });

    it('skor 100\'ü aşmaz (capped)', () => {
      const result = filter.checkToken(
        1,
        '0x0000000000004946c0e9f43f4dee607b0ef1fa1c', // known spam
        '$MEGASCAM',
        'Visit http://scam.com to claim your free tokens - http://phishing.xyz claim airdrop',
        30,
        false,
        true
      );
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  // ─── NFT Spam Check ──────────────────────────────────────────
  describe('checkNFT()', () => {
    it('normal NFT spam değil', () => {
      const result = filter.checkNFT('Cool Ape #123', 'A cool NFT collection', 'https://coolapes.io');
      expect(result.isSpam).toBe(false);
      expect(result.hasPhishingLink).toBe(false);
    });

    it('phishing URL içeren NFT spam', () => {
      const result = filter.checkNFT(
        'Free NFT',
        'Claim your token now at https://claim-rewards.xyz',
        undefined
      );
      // Should detect phishing pattern ("claim.*token" pattern) or phishing domain
      expect(result.isSpam || result.hasPhishingLink).toBe(true);
    });
  });

  // ─── Hide/Unhide ─────────────────────────────────────────────
  describe('hideToken / unhideToken', () => {
    it('token gizleme ve kontrol', () => {
      filter.hideToken(1, '0xABC');
      expect(filter.isTokenHidden(1, '0xabc')).toBe(true);
    });

    it('token gösterme', () => {
      filter.hideToken(1, '0xABC');
      filter.unhideToken(1, '0xABC');
      expect(filter.isTokenHidden(1, '0xABC')).toBe(false);
    });

    it('getHiddenTokens doğru listeyi döner', () => {
      filter.hideToken(1, '0xAAA');
      filter.hideToken(1, '0xBBB');
      const hidden = filter.getHiddenTokens(1);
      expect(hidden).toHaveLength(2);
      expect(hidden).toContain('0xaaa');
      expect(hidden).toContain('0xbbb');
    });

    it('farklı ağlardaki gizli tokenlar bağımsızdır', () => {
      filter.hideToken(1, '0xAAA');
      expect(filter.isTokenHidden(42161, '0xAAA')).toBe(false);
    });
  });

  // ─── clearAll ────────────────────────────────────────────────
  describe('clearAll()', () => {
    it('tüm verileri temizler', () => {
      filter.hideToken(1, '0xAAA');
      filter.clearAll();
      expect(filter.isTokenHidden(1, '0xAAA')).toBe(false);
      expect(filter.getHiddenTokens(1)).toHaveLength(0);
    });
  });
});
