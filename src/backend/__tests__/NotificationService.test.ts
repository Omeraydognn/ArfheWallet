/// <reference types="vitest/globals" />
import { NotificationService } from '../NotificationService';
import type { WalletNotification, NotificationPreferences } from '../NotificationService';

/**
 * NotificationService testleri
 *
 * Chrome storage mock'u devre dışı bırakılarak localStorage fallback kullanılır.
 * setup.ts'deki chrome.storage mock callback-based olup
 * NotificationService Promise-based API beklediği için uyumsuz.
 */
describe('NotificationService', () => {
  let originalChrome: typeof chrome | undefined;

  beforeEach(() => {
    // Chrome storage mock'unu geçici olarak kaldır — localStorage fallback'e düşsün
    originalChrome = (globalThis as unknown as { chrome?: typeof chrome }).chrome;
    (globalThis as unknown as { chrome?: typeof chrome }).chrome = undefined;
    localStorage.clear();
  });

  afterEach(() => {
    // Chrome mock'unu geri yükle (diğer testler etkilenmesin)
    (globalThis as unknown as { chrome?: typeof chrome }).chrome = originalChrome;
  });

  // ─── Preferences ───────────────────────────────────────────────
  describe('Preferences', () => {
    it('varsayılan tercihler döner', async () => {
      const prefs = await NotificationService.getPreferences();
      expect(prefs.enabled).toBe(true);
      expect(prefs.incomingTx).toBe(true);
      expect(prefs.txConfirmation).toBe(true);
      expect(prefs.approvalWarnings).toBe(true);
      expect(prefs.sound).toBe(false);
    });

    it('tercihleri kaydeder ve geri alır', async () => {
      const custom: NotificationPreferences = {
        enabled: false,
        incomingTx: false,
        txConfirmation: true,
        approvalWarnings: false,
        sound: true,
      };
      await NotificationService.savePreferences(custom);
      const loaded = await NotificationService.getPreferences();
      expect(loaded.enabled).toBe(false);
      expect(loaded.incomingTx).toBe(false);
      expect(loaded.sound).toBe(true);
    });
  });

  // ─── Notifications CRUD ────────────────────────────────────────
  describe('Notifications CRUD', () => {
    it('başlangıçta bildirim listesi boştur', async () => {
      const notifications = await NotificationService.getNotifications();
      expect(notifications).toHaveLength(0);
    });

    it('bildirim ekler', async () => {
      const notif = await NotificationService.addNotification({
        type: 'incoming_tx',
        title: 'Test Notification',
        message: 'Test message',
      });
      expect(notif.id).toBeTruthy();
      expect(notif.timestamp).toBeGreaterThan(0);
      expect(notif.read).toBe(false);
      expect(notif.title).toBe('Test Notification');
    });

    it('eklenen bildirim listede görünür', async () => {
      await NotificationService.addNotification({
        type: 'tx_confirmed',
        title: 'TX Confirmed',
        message: 'Your TX was confirmed',
      });
      const notifications = await NotificationService.getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('TX Confirmed');
    });

    it('yeni bildirim listenin başına eklenir', async () => {
      await NotificationService.addNotification({
        type: 'incoming_tx',
        title: 'First',
        message: 'First notification',
      });
      // Küçük gecikme farklı timestamp için
      await new Promise(r => setTimeout(r, 10));
      await NotificationService.addNotification({
        type: 'tx_confirmed',
        title: 'Second',
        message: 'Second notification',
      });
      const notifications = await NotificationService.getNotifications();
      expect(notifications[0].title).toBe('Second');
      expect(notifications[1].title).toBe('First');
    });

    it('data alanı doğru kaydedilir', async () => {
      await NotificationService.addNotification({
        type: 'incoming_tx',
        title: 'Incoming ETH',
        message: 'Received 1 ETH',
        data: {
          txHash: '0xabc',
          from: '0x123',
          value: '1.0',
          token: 'ETH',
        },
      });
      const notifications = await NotificationService.getNotifications();
      expect(notifications[0].data?.txHash).toBe('0xabc');
      expect(notifications[0].data?.token).toBe('ETH');
    });
  });

  // ─── markAsRead ────────────────────────────────────────────────
  describe('markAsRead', () => {
    it('bildirim okundu olarak işaretler', async () => {
      const notif = await NotificationService.addNotification({
        type: 'incoming_tx',
        title: 'Test',
        message: 'Unread',
      });
      await NotificationService.markAsRead(notif.id);
      const notifications = await NotificationService.getNotifications();
      expect(notifications[0].read).toBe(true);
    });

    it('olmayan ID ile çağrıda hata vermez', async () => {
      await expect(NotificationService.markAsRead('nonexistent')).resolves.not.toThrow();
    });
  });

  // ─── markAllAsRead ─────────────────────────────────────────────
  describe('markAllAsRead', () => {
    it('tüm bildirimleri okundu yapar', async () => {
      await NotificationService.addNotification({ type: 'incoming_tx', title: 'A', message: 'a' });
      await NotificationService.addNotification({ type: 'tx_confirmed', title: 'B', message: 'b' });
      await NotificationService.addNotification({ type: 'tx_failed', title: 'C', message: 'c' });

      await NotificationService.markAllAsRead();

      const notifications = await NotificationService.getNotifications();
      notifications.forEach(n => expect(n.read).toBe(true));
    });
  });

  // ─── getUnreadCount ────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('okunmamış bildirim sayısını doğru hesaplar', async () => {
      await NotificationService.addNotification({ type: 'incoming_tx', title: 'A', message: 'a' });
      await NotificationService.addNotification({ type: 'incoming_tx', title: 'B', message: 'b' });
      const n = await NotificationService.addNotification({ type: 'incoming_tx', title: 'C', message: 'c' });

      await NotificationService.markAsRead(n.id);

      const count = await NotificationService.getUnreadCount();
      expect(count).toBe(2);
    });

    it('tümü okunmuşken 0 döner', async () => {
      await NotificationService.addNotification({ type: 'incoming_tx', title: 'A', message: 'a' });
      await NotificationService.markAllAsRead();
      const count = await NotificationService.getUnreadCount();
      expect(count).toBe(0);
    });

    it('bildirim yokken 0 döner', async () => {
      const count = await NotificationService.getUnreadCount();
      expect(count).toBe(0);
    });
  });

  // ─── clearAll ──────────────────────────────────────────────────
  describe('clearAll', () => {
    it('tüm bildirimleri temizler', async () => {
      await NotificationService.addNotification({ type: 'incoming_tx', title: 'A', message: 'a' });
      await NotificationService.addNotification({ type: 'incoming_tx', title: 'B', message: 'b' });

      await NotificationService.clearAll();

      const notifications = await NotificationService.getNotifications();
      expect(notifications).toHaveLength(0);
    });
  });

  // ─── MAX_STORED_NOTIFICATIONS ──────────────────────────────────
  describe('Storage Limit', () => {
    it('50\'den fazla bildirim saklanmaz', async () => {
      // 55 bildirim ekle
      for (let i = 0; i < 55; i++) {
        await NotificationService.addNotification({
          type: 'incoming_tx',
          title: `Notif ${i}`,
          message: `Message ${i}`,
        });
      }
      const notifications = await NotificationService.getNotifications();
      expect(notifications.length).toBeLessThanOrEqual(50);
    });
  });
});
