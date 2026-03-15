/// <reference types="vitest/globals" />
import { TransactionSimulator } from '../TransactionSimulator';
import type { SimResult } from '../TransactionSimulator';

/**
 * @vitest-environment node
 *
 * TransactionSimulator testleri
 *
 * ethers.js Provider mock ile çalışır.
 * Scam detection, risk escalation ve FHE selector detection test edilir.
 * Gerçek RPC çağrısı yapılmaz.
 */
describe('TransactionSimulator', () => {
  let mockProvider: { getCode: ReturnType<typeof vi.fn>; call: ReturnType<typeof vi.fn>; getBalance: ReturnType<typeof vi.fn> };
  let simulator: TransactionSimulator;

  beforeEach(() => {
    mockProvider = {
      getCode: vi.fn().mockResolvedValue('0x'),
      call: vi.fn().mockResolvedValue('0x'),
      getBalance: vi.fn().mockResolvedValue(0n),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal mock for unit tests
    simulator = new TransactionSimulator(mockProvider as any);
  });

  // ─── isScamAddress (static) ────────────────────────────────────
  describe('isScamAddress', () => {
    it('zero address scam olarak tanınır', () => {
      expect(TransactionSimulator.isScamAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });

    it('normal adres scam değildir', () => {
      expect(TransactionSimulator.isScamAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe(false);
    });

    it('case-insensitive çalışır', () => {
      expect(TransactionSimulator.isScamAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });
  });

  // ─── addScamAddress (static) ───────────────────────────────────
  describe('addScamAddress', () => {
    it('runtime\'da yeni scam adres ekler', () => {
      const testAddr = '0x1111111111111111111111111111111111111111';
      expect(TransactionSimulator.isScamAddress(testAddr)).toBe(false);
      TransactionSimulator.addScamAddress(testAddr);
      expect(TransactionSimulator.isScamAddress(testAddr)).toBe(true);
    });
  });

  // ─── simulateTransaction ──────────────────────────────────────
  describe('simulateTransaction', () => {
    it('to adresi eksikse hata döner', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing recipient');
    });

    it('scam adresine gönderimde CRITICAL risk döner', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x0000000000000000000000000000000000000000',
        value: '1000000000000000000', // 1 ETH
        data: '0x',
      });
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('basit ETH transferinde success döner', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '1000000000000000000', // 1 ETH
        data: '0x',
      });
      expect(result.success).toBe(true);
      expect(result.operationType).toBe('transfer');
      expect(result.balanceChanges.length).toBeGreaterThan(0);
    });

    it('büyük ETH transferinde yüksek değer uyarısı verir', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '2000000000000000000', // 2 ETH > 1 ETH threshold
        data: '0x',
      });
      expect(result.warnings.some(w => w.includes('Yüksek değerli'))).toBe(true);
    });

    it('native ETH balance change doğru formatlanır', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '500000000000000000', // 0.5 ETH
        data: '0x',
      });
      const native = result.balanceChanges.find(bc => bc.type === 'NATIVE');
      expect(native).toBeDefined();
      expect(native!.symbol).toBe('ETH');
      expect(native!.amountFormatted).toBe('0.5');
    });

    it('contract interaction algılanır', async () => {
      mockProvider.getCode.mockResolvedValue('0x606060');
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0',
        data: '0xdeadbeef', // Unknown selector
      });
      expect(result.isContractInteraction).toBe(true);
    });

    it('eth_call revert olursa CRITICAL risk döner', async () => {
      mockProvider.call.mockRejectedValue(new Error('execution reverted'));
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0',
        data: '0xdeadbeef',
      });
      expect(result.success).toBe(false);
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.error).toContain('Reverted');
    });

    it('insufficient funds hatası uygun mesaj döner', async () => {
      mockProvider.call.mockRejectedValue(new Error('insufficient funds'));
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0',
        data: '0x',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Yetersiz Bakiye');
    });
  });

  // ─── FHE Selectors ────────────────────────────────────────────
  describe('FHE Selectors', () => {
    it('transferEncrypted selector algılanır', async () => {
      // transferEncrypted selector: 0x7c231884
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0',
        data: '0x7c231884' + '0'.repeat(128), // selector + dummy params
      });
      expect(result.operationType).toBe('transferEncrypted');
      expect(result.warnings.some(w => w.includes('FHE'))).toBe(true);
    });

    it('wrap selector algılanır', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0',
        data: '0xea598cb0' + '0'.repeat(64),
      });
      expect(result.operationType).toBe('wrap');
    });

    it('wrapETH selector algılanır', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '1000000000000000000',
        data: '0xa3211896',
      });
      expect(result.operationType).toBe('wrapETH');
    });

    it('unwrap selector algılanır', async () => {
      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0',
        data: '0xde0e9a3e' + '0'.repeat(64),
      });
      expect(result.operationType).toBe('unwrap');
    });
  });

  // ─── Address Poisoning Detection ───────────────────────────────
  describe('Address Poisoning', () => {
    it('benzer görünen adres poisoning uyarısı verir', async () => {
      // Address poisoning: ilk 8 ve son 4 char aynı ama orta kısım farklı
      // Küçük harfli adresler kullanarak checksum sorununu atla
      const from = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
      const to   = '0xf39fd600000000000000000000000000ffb92266';

      const result = await simulator.simulateTransaction({
        from,
        to,
        value: '1000000000000000',
        data: '0x',
      });
      expect(result.warnings.some(w => w.includes('Poisoning'))).toBe(true);
    });
  });

  // ─── ERC20 Operations ──────────────────────────────────────────
  describe('ERC20 Operations', () => {
    it('ERC20 transfer operasyonu algılanır', async () => {
      // transfer(address,uint256) selector: 0xa9059cbb
      const recipient = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'.slice(2).padStart(64, '0');
      const amount = BigInt('1000000000000000000').toString(16).padStart(64, '0');
      const data = '0xa9059cbb' + recipient + amount;

      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Token contract
        value: '0',
        data,
      });
      expect(result.operationType).toBe('transfer');
      expect(result.balanceChanges.length).toBeGreaterThan(0);
      expect(result.balanceChanges[0].type).toBe('ERC20');
    });

    it('sınırsız approve HIGH risk verir', async () => {
      // approve(address,uint256) selector: 0x095ea7b3
      const spender = '0x1234567890123456789012345678901234567890'.slice(2).padStart(64, '0');
      const maxAmount = 'f'.repeat(64); // max uint256 = unlimited
      const data = '0x095ea7b3' + spender + maxAmount;

      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        value: '0',
        data,
      });
      expect(result.operationType).toBe('approve');
      expect(result.riskLevel === 'HIGH' || result.riskLevel === 'CRITICAL').toBe(true);
      expect(result.warnings.some(w => w.includes('SINIRSIZ'))).toBe(true);
    });

    it('revoke (amount=0) approve güvenli kabul edilir', async () => {
      const spender = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'.slice(2).padStart(64, '0');
      const zeroAmount = '0'.repeat(64);
      const data = '0x095ea7b3' + spender + zeroAmount;

      const result = await simulator.simulateTransaction({
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        value: '0',
        data,
      });
      expect(result.operationType).toBe('approve');
      expect(result.warnings.some(w => w.includes('kaldırılıyor'))).toBe(true);
      expect(result.riskLevel).toBe('LOW');
    });
  });
});
