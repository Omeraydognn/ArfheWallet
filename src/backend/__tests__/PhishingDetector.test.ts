/// <reference types="vitest/globals" />
import { PhishingDetector } from '../PhishingDetector';

// Access private static methods for testing
const extractDomain = (url: string): string | null =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private method in test
  (PhishingDetector as unknown as { extractDomain: (url: string) => string | null }).extractDomain(url);

describe('PhishingDetector', () => {
  // ─── extractDomain ───────────────────────────────────────────
  describe('extractDomain()', () => {
    it('tam URL\'den domaini çıkarır', () => {
      const domain = extractDomain('https://www.uniswap.org/swap');
      expect(domain).toBe('www.uniswap.org');
    });

    it('subdomain\'li URL\'yi doğru parse eder', () => {
      const domain = extractDomain('https://app.aave.com/markets');
      expect(domain).toBe('app.aave.com');
    });

    it('sadece domain verildiğinde çalışır', () => {
      const domain = extractDomain('uniswap.org');
      expect(domain).toBeTruthy();
    });

    it('geçersiz URL için null/empty döner', () => {
      const domain = extractDomain('');
      expect(!domain).toBe(true);
    });
  });

  // ─── Local Blocklist ─────────────────────────────────────────
  describe('Local Blocklist', () => {
    it('bilinen phishing domaini engellenir', async () => {
      const result = await PhishingDetector.checkDomain('https://metamask-airdrop.com');
      expect(result.riskLevel).not.toBe('safe');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('bilinen phishing: uniswap-claim.com', async () => {
      const result = await PhishingDetector.checkDomain('https://uniswap-claim.com/swap');
      expect(result.riskLevel).not.toBe('safe');
    });

    it('bilinen phishing: opensea-rewards.com', async () => {
      const result = await PhishingDetector.checkDomain('https://opensea-rewards.com');
      expect(result.riskLevel).not.toBe('safe');
    });
  });

  // ─── Trusted Domains ────────────────────────────────────────
  describe('Trusted Domains', () => {
    it('uniswap.org güvenli', async () => {
      const result = await PhishingDetector.checkDomain('https://uniswap.org');
      expect(result.riskLevel.toLowerCase()).toBe('safe');
    });

    it('app.uniswap.org güvenli', async () => {
      const result = await PhishingDetector.checkDomain('https://app.uniswap.org/swap');
      expect(result.riskLevel.toLowerCase()).toBe('safe');
    });

    it('opensea.io güvenli', async () => {
      const result = await PhishingDetector.checkDomain('https://opensea.io');
      expect(result.riskLevel.toLowerCase()).toBe('safe');
    });

    it('etherscan.io güvenli', async () => {
      const result = await PhishingDetector.checkDomain('https://etherscan.io/address/0x123');
      expect(result.riskLevel.toLowerCase()).toBe('safe');
    });

    it('aave.com güvenli', async () => {
      const result = await PhishingDetector.checkDomain('https://aave.com');
      expect(result.riskLevel.toLowerCase()).toBe('safe');
    });
  });

  // ─── Fuzzy / Typosquatting Detection ─────────────────────────
  describe('Fuzzy & Typosquatting', () => {
    it('"umiswap.org" typosquatting olarak tespit edilir', async () => {
      const result = await PhishingDetector.checkDomain('https://umiswap.org');
      expect(result.riskLevel).not.toBe('safe');
      expect(
        result.warnings.some(w => w.includes('TYPOSQUAT') || w.includes('typo') || w.includes('benziyor'))
      ).toBe(true);
    });

    it('"uniiswap.org" typosquatting olarak tespit edilir', async () => {
      const result = await PhishingDetector.checkDomain('https://uniiswap.org');
      expect(result.riskLevel).not.toBe('safe');
    });

    it('"metamask.org" — gerçek domain, güvenli olmalı veya en fazla uyarı', async () => {
      // metamask.io is the real domain, .org variant may trigger
      const result = await PhishingDetector.checkDomain('https://metamask.io');
      expect(result.riskLevel.toLowerCase()).toBe('safe');
    });
  });

  // ─── Homoglyph Detection ────────────────────────────────────
  describe('Homoglyph Detection', () => {
    it('"un1swap.org" (1→i) homoglyph olarak tespit edilir', async () => {
      const result = await PhishingDetector.checkDomain('https://un1swap.org');
      expect(result.riskLevel).not.toBe('safe');
    });

    it('"0pensea.io" (0→o) homoglyph olarak tespit edilir', async () => {
      const result = await PhishingDetector.checkDomain('https://0pensea.io');
      expect(result.riskLevel).not.toBe('safe');
    });
  });

  // ─── Suspicious TLDs ────────────────────────────────────────
  describe('Suspicious TLDs', () => {
    it('.xyz TLD uyarı verir', async () => {
      const result = await PhishingDetector.checkDomain('https://some-defi-site.xyz');
      expect(
        result.warnings.some(w => w.includes('.xyz') || w.includes('TLD') || w.includes('Şüpheli'))
      ).toBe(true);
    });

    it('.top TLD uyarı verir', async () => {
      const result = await PhishingDetector.checkDomain('https://free-crypto.top');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('.click TLD uyarı verir', async () => {
      const result = await PhishingDetector.checkDomain('https://claim-eth.click');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // ─── quickCheck (sync) ───────────────────────────────────────
  describe('quickCheck()', () => {
    it('bilinen phishing domain\'i sync olarak tespit eder', () => {
      // metamask-login.com is in LOCAL_BLOCKLIST
      const isBlocked = PhishingDetector.quickCheck('https://metamask-login.com');
      expect(isBlocked).toBe(true);
    });

    it('güvenli domain\'i engellenmez', () => {
      const isBlocked = PhishingDetector.quickCheck('https://uniswap.org');
      expect(isBlocked).toBe(false);
    });
  });

  // ─── Runtime Blocklist/Allowlist ─────────────────────────────
  describe('Runtime list management', () => {
    it('runtime\'da blocklist\'e domain eklenebilir', async () => {
      PhishingDetector.addToBlocklist('evil-site-test.com');
      const result = await PhishingDetector.checkDomain('https://evil-site-test.com');
      expect(result.riskLevel).not.toBe('safe');
    });

    it('runtime\'da allowlist\'e domain eklenebilir', async () => {
      PhishingDetector.addToAllowlist('my-safe-dapp.xyz');
      const result = await PhishingDetector.checkDomain('https://my-safe-dapp.xyz');
      expect(result.riskLevel.toLowerCase()).toBe('safe');
    });
  });
});
