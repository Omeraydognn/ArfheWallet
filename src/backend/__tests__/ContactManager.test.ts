/// <reference types="vitest/globals" />
import { ContactManager, getKnownContractLabel } from '../ContactManager';
import StorageManager from '../StorageManager';

/**
 * ContactManager unit tests
 *
 * StorageManager'ın getLocal/setLocal/removeLocal metodlarını mock'luyoruz.
 * Gerçek chrome.storage'a bağımlılık yok.
 */
describe('ContactManager', () => {
  let manager: ContactManager;
  let mockStorage: StorageManager;
  let store: Record<string, any>;

  beforeEach(() => {
    store = {};
    // Minimal StorageManager mock
    mockStorage = {
      getLocal: vi.fn((key: string) => store[key] ?? null),
      setLocal: vi.fn((key: string, value: unknown) => { store[key] = value; }),
      removeLocal: vi.fn((key: string) => { delete store[key]; }),
    } as unknown as StorageManager;

    manager = new ContactManager(mockStorage);
  });

  // ─── Contacts CRUD ───────────────────────────────────────────
  describe('Contacts CRUD', () => {
    it('başlangıçta boş kişi listesi döner', () => {
      const contacts = manager.getContacts();
      expect(contacts).toEqual([]);
    });

    it('yeni kişi ekler', () => {
      const contact = manager.addContact('Alice', '0xAliceAddress');
      expect(contact.name).toBe('Alice');
      expect(contact.address).toBe('0xAliceAddress');
      expect(contact.id).toBeTruthy();
      expect(contact.createdAt).toBeGreaterThan(0);
    });

    it('eklenen kişi listede görünür', () => {
      manager.addContact('Alice', '0xAliceAddress');
      const contacts = manager.getContacts();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe('Alice');
    });

    it('aynı adresle ikinci kişi eklenemez', () => {
      manager.addContact('Alice', '0xAliceAddress');
      expect(() => manager.addContact('Alice2', '0xaliceaddress')).toThrow();
    });

    it('kişi günceller', () => {
      const contact = manager.addContact('Alice', '0xAliceAddress');
      manager.updateContact(contact.id, 'Alice Updated', '0xNewAddress');
      const contacts = manager.getContacts();
      expect(contacts[0].name).toBe('Alice Updated');
      expect(contacts[0].address).toBe('0xNewAddress');
    });

    it('olmayan kişi güncellemesi hata fırlatır', () => {
      expect(() => manager.updateContact('nonexistent-id', 'Name', '0x123')).toThrow('Contact not found');
    });

    it('kişi siler', () => {
      const contact = manager.addContact('Alice', '0xAliceAddress');
      manager.removeContact(contact.id);
      expect(manager.getContacts()).toHaveLength(0);
    });

    it('birden fazla kişi eklenir ve doğru silinir', () => {
      const c1 = manager.addContact('Alice', '0xA');
      const c2 = manager.addContact('Bob', '0xB');
      manager.addContact('Charlie', '0xC');

      manager.removeContact(c2.id);
      const contacts = manager.getContacts();
      expect(contacts).toHaveLength(2);
      expect(contacts.map(c => c.name)).toContain('Alice');
      expect(contacts.map(c => c.name)).toContain('Charlie');
      expect(contacts.map(c => c.name)).not.toContain('Bob');
    });
  });

  // ─── getContactByAddress ─────────────────────────────────────
  describe('getContactByAddress()', () => {
    it('adresle kişi bulur (case-insensitive)', () => {
      manager.addContact('Alice', '0xAliceAddress');
      const found = manager.getContactByAddress('0xaliceaddress');
      expect(found).toBeTruthy();
      expect(found!.name).toBe('Alice');
    });

    it('olmayan adres için undefined döner', () => {
      const found = manager.getContactByAddress('0xNonExistent');
      expect(found).toBeUndefined();
    });
  });

  // ─── Recent Addresses ───────────────────────────────────────
  describe('Recent Addresses', () => {
    it('son kullanılan adres eklenir', () => {
      manager.addRecentAddress('0xRecent1', 'First');
      const recents = manager.getRecentAddresses();
      expect(recents).toHaveLength(1);
      expect(recents[0].address).toBe('0xRecent1');
    });

    it('en son eklenen en üstte olur', () => {
      manager.addRecentAddress('0xOld');
      manager.addRecentAddress('0xNew');
      const recents = manager.getRecentAddresses();
      expect(recents[0].address).toBe('0xNew');
    });

    it('aynı adres tekrar eklenince güncellenir (duplicate olmaz)', () => {
      manager.addRecentAddress('0xAddr1');
      manager.addRecentAddress('0xAddr2');
      manager.addRecentAddress('0xAddr1'); // tekrar
      const recents = manager.getRecentAddresses();
      expect(recents).toHaveLength(2);
      expect(recents[0].address).toBe('0xAddr1');
    });

    it('maksimum 10 kayıt tutulur', () => {
      for (let i = 0; i < 15; i++) {
        manager.addRecentAddress(`0x${i.toString().padStart(40, '0')}`);
      }
      const recents = manager.getRecentAddresses();
      expect(recents.length).toBeLessThanOrEqual(10);
    });

    it('clearRecentAddresses tüm geçmişi temizler', () => {
      manager.addRecentAddress('0xAddr');
      manager.clearRecentAddresses();
      const recents = manager.getRecentAddresses();
      expect(recents).toHaveLength(0);
    });
  });

  // ─── resolveLabel ────────────────────────────────────────────
  describe('resolveLabel()', () => {
    it('kayıtlı kişi adı döner', () => {
      manager.addContact('Alice', '0xAliceAddr');
      const label = manager.resolveLabel('0xAliceAddr');
      expect(label).toBe('Alice');
    });

    it('bilinen kontrat adı döner', () => {
      // Uniswap V2 Router on Ethereum
      const label = manager.resolveLabel('0x7a250d5630b4cf539739df2c5dacb4c659f2488d', 1);
      expect(label).toBe('Uniswap V2 Router');
    });

    it('bilinmeyen adres için kısa format döner', () => {
      const label = manager.resolveLabel('0x1234567890abcdef1234567890abcdef12345678');
      expect(label).toBe('0x1234...5678');
    });
  });

  // ─── getKnownContractLabel (standalone function) ─────────────
  describe('getKnownContractLabel()', () => {
    it('Ethereum mainnet WETH adresini tanır', () => {
      const label = getKnownContractLabel('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 1);
      expect(label).toBe('WETH');
    });

    it('Arbitrum USDC adresini tanır', () => {
      const label = getKnownContractLabel('0xaf88d065e77c8cc2239327c5edb3a432268e5831', 42161);
      expect(label).toBe('USDC (Arbitrum)');
    });

    it('Base WETH adresini tanır', () => {
      const label = getKnownContractLabel('0x4200000000000000000000000000000000000006', 8453);
      expect(label).toBe('WETH (Base)');
    });

    it('bilinmeyen adres undefined döner', () => {
      const label = getKnownContractLabel('0x0000000000000000000000000000000000000001', 1);
      expect(label).toBeUndefined();
    });

    it('case-insensitive çalışır', () => {
      const label = getKnownContractLabel('0xC02AAA39B223FE8D0A0E5C4F27EAD9083C756CC2', 1);
      expect(label).toBe('WETH');
    });

    it('chain belirtilmezse Ethereum fallback çalışır', () => {
      const label = getKnownContractLabel('0x7a250d5630b4cf539739df2c5dacb4c659f2488d');
      expect(label).toBe('Uniswap V2 Router');
    });
  });
});
