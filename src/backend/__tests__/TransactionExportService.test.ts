/// <reference types="vitest/globals" />
import { generateCsv } from '../TransactionExportService';
import type { ExportOptions } from '../TransactionExportService';
import type { TransactionHistory } from '../NetworkTypes';

/**
 * TransactionExportService testleri
 *
 * generateCsv fonksiyonu test edilir. downloadCsv DOM bağımlılığı
 * nedeniyle unit test dışında bırakılır.
 */
describe('TransactionExportService', () => {

  const USER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  const sampleTx: TransactionHistory = {
    hash: '0xabc123def456',
    from: USER_ADDRESS,
    to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    contractAddress: 'ETH',
    value: '1.5',
    timestamp: '2024-01-15T10:30:00.000Z',
    blockNum: '0x1234',
    isNative: true,
    status: 'Success',
    explorerUrl: 'https://etherscan.io/tx/0xabc123def456',
    isShielded: false,
    methodLabel: 'Transfer',
  };

  const incomingTx: TransactionHistory = {
    hash: '0xdef789abc012',
    from: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    to: USER_ADDRESS,
    contractAddress: 'ETH',
    value: '0.5',
    timestamp: '2024-01-16T14:00:00.000Z',
    blockNum: '0x1235',
    isNative: true,
    status: 'Success',
    explorerUrl: 'https://etherscan.io/tx/0xdef789abc012',
    isShielded: false,
    methodLabel: 'Transfer',
  };

  const shieldedTx: TransactionHistory = {
    hash: '0x111222333444',
    from: USER_ADDRESS,
    to: '0xFHEContract',
    contractAddress: '0xFHEContract',
    value: '10',
    timestamp: '2024-01-17T08:00:00.000Z',
    blockNum: '0x1236',
    isNative: false,
    status: 'Success',
    explorerUrl: '',
    isShielded: true,
    methodLabel: 'Wrap',
  };

  // ─── generateCsv ──────────────────────────────────────────────
  describe('generateCsv', () => {
    it('başlık satırı içerir', () => {
      const csv = generateCsv([sampleTx], USER_ADDRESS);
      const lines = csv.split('\n');
      expect(lines[0]).toContain('Date');
      expect(lines[0]).toContain('Transaction Hash');
      expect(lines[0]).toContain('Amount');
    });

    it('veri satırı doğru üretir', () => {
      const csv = generateCsv([sampleTx], USER_ADDRESS);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2); // header + 1 data row
      expect(lines[1]).toContain('0xabc123def456');
      expect(lines[1]).toContain('1.5');
    });

    it('giden işlem "Send" olarak etiketlenir', () => {
      const csv = generateCsv([sampleTx], USER_ADDRESS);
      expect(csv).toContain('Send');
    });

    it('gelen işlem "Receive" olarak etiketlenir', () => {
      const csv = generateCsv([incomingTx], USER_ADDRESS);
      expect(csv).toContain('Receive');
    });

    it('birden fazla işlem doğru satır sayısı üretir', () => {
      const csv = generateCsv([sampleTx, incomingTx, shieldedTx], USER_ADDRESS);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(4); // header + 3 data rows
    });

    it('shielded işlem "Yes" olarak işaretlenir', () => {
      const csv = generateCsv([shieldedTx], USER_ADDRESS);
      expect(csv).toContain('Yes');
    });

    it('normal işlem "No" olarak işaretlenir', () => {
      const csv = generateCsv([sampleTx], USER_ADDRESS);
      const lines = csv.split('\n');
      expect(lines[1]).toContain('No');
    });

    it('boş işlem listesi sadece başlık döner', () => {
      const csv = generateCsv([], USER_ADDRESS);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(1); // sadece header
    });

    it('native token ETH olarak gösterilir', () => {
      const csv = generateCsv([sampleTx], USER_ADDRESS);
      expect(csv).toContain('ETH');
    });

    it('ERC20 token contract adresi gösterilir', () => {
      const erc20Tx: TransactionHistory = {
        ...sampleTx,
        isNative: false,
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };
      const csv = generateCsv([erc20Tx], USER_ADDRESS);
      expect(csv).toContain('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });
  });

  // ─── Export Options ────────────────────────────────────────────
  describe('Export Options', () => {
    it('includeHeader: false ile başlık satırı olmaz', () => {
      const csv = generateCsv([sampleTx], USER_ADDRESS, { includeHeader: false });
      const lines = csv.split('\n');
      expect(lines).toHaveLength(1); // sadece data row
      expect(lines[0]).not.toContain('Date');
      expect(lines[0]).toContain('0xabc123def456');
    });

    it('belirli fields seçilebilir', () => {
      const options: ExportOptions = {
        fields: ['date', 'txHash', 'amount'],
      };
      const csv = generateCsv([sampleTx], USER_ADDRESS, options);
      const lines = csv.split('\n');
      // Header sadece 3 alan
      const headerCols = lines[0].split(',');
      expect(headerCols).toHaveLength(3);
    });
  });

  // ─── CSV Escaping ──────────────────────────────────────────────
  describe('CSV Escaping', () => {
    it('virgül içeren değer tırnak içine alınır', () => {
      const txWithComma: TransactionHistory = {
        ...sampleTx,
        methodLabel: 'Transfer, Approve',
      };
      const csv = generateCsv([txWithComma], USER_ADDRESS);
      expect(csv).toContain('"Transfer, Approve"');
    });

    it('çift tırnak içeren değer escape edilir', () => {
      const txWithQuote: TransactionHistory = {
        ...sampleTx,
        methodLabel: 'Transfer "Special"',
      };
      const csv = generateCsv([txWithQuote], USER_ADDRESS);
      expect(csv).toContain('"Transfer ""Special"""');
    });
  });

  // ─── Direction Detection ───────────────────────────────────────
  describe('Direction Detection', () => {
    it('case-insensitive adres karşılaştırması yapar', () => {
      const upperAddr = USER_ADDRESS.toUpperCase();
      const csv = generateCsv([sampleTx], upperAddr);
      expect(csv).toContain('Send');
    });
  });
});
