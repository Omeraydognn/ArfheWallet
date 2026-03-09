/**
 * NotificationService.ts — Activity Notifications for Arfhe Wallet
 *
 * Features:
 *  - Incoming transaction monitoring
 *  - Transaction confirmation alerts
 *  - Token approval expiry warnings
 *  - Background polling via Chrome alarms
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface WalletNotification {
    id: string;
    type: "incoming_tx" | "tx_confirmed" | "tx_failed" | "approval_warning" | "price_alert" | "security";
    title: string;
    message: string;
    timestamp: number;
    read: boolean;
    data?: {
        txHash?: string;
        from?: string;
        to?: string;
        value?: string;
        token?: string;
        explorerUrl?: string;
        networkId?: string;
    };
}

export interface NotificationPreferences {
    enabled: boolean;
    incomingTx: boolean;
    txConfirmation: boolean;
    approvalWarnings: boolean;
    sound: boolean;
}

// ─── Default Preferences ────────────────────────────────────────────

const DEFAULT_PREFERENCES: NotificationPreferences = {
    enabled: true,
    incomingTx: true,
    txConfirmation: true,
    approvalWarnings: true,
    sound: false,
};

const STORAGE_KEY_PREFS = "arfhe_notification_prefs";
const STORAGE_KEY_NOTIFICATIONS = "arfhe_notifications";
const MAX_STORED_NOTIFICATIONS = 50;

// ─── Service ────────────────────────────────────────────────────────

export class NotificationService {

    /** Load notification preferences from storage */
    static async getPreferences(): Promise<NotificationPreferences> {
        try {
            if (typeof chrome !== "undefined" && chrome.storage) {
                const result = await chrome.storage.local.get(STORAGE_KEY_PREFS);
                const stored = result[STORAGE_KEY_PREFS] as Partial<NotificationPreferences> | undefined;
                return { ...DEFAULT_PREFERENCES, ...stored };
            }
            const stored = localStorage.getItem(STORAGE_KEY_PREFS);
            return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
        } catch {
            return DEFAULT_PREFERENCES;
        }
    }

    /** Save notification preferences */
    static async savePreferences(prefs: NotificationPreferences): Promise<void> {
        try {
            if (typeof chrome !== "undefined" && chrome.storage) {
                await chrome.storage.local.set({ [STORAGE_KEY_PREFS]: prefs });
            } else {
                localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
            }
        } catch (e) {
        }
    }

    /** Get stored notifications */
    static async getNotifications(): Promise<WalletNotification[]> {
        try {
            if (typeof chrome !== "undefined" && chrome.storage) {
                const result = await chrome.storage.local.get(STORAGE_KEY_NOTIFICATIONS);
                return (result[STORAGE_KEY_NOTIFICATIONS] as WalletNotification[] | undefined) || [];
            }
            const stored = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    /** Add a notification to storage */
    static async addNotification(notification: Omit<WalletNotification, "id" | "timestamp" | "read">): Promise<WalletNotification> {
        const newNotif: WalletNotification = {
            ...notification,
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            read: false,
        };

        const notifications = await this.getNotifications();
        notifications.unshift(newNotif);

        // Keep only the last N notifications
        const trimmed = notifications.slice(0, MAX_STORED_NOTIFICATIONS);

        try {
            if (typeof chrome !== "undefined" && chrome.storage) {
                await chrome.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: trimmed });
            } else {
                localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(trimmed));
            }
        } catch (e) {
        }

        return newNotif;
    }

    /** Mark a notification as read */
    static async markAsRead(notifId: string): Promise<void> {
        const notifications = await this.getNotifications();
        const idx = notifications.findIndex((n) => n.id === notifId);
        if (idx !== -1) {
            notifications[idx].read = true;
            if (typeof chrome !== "undefined" && chrome.storage) {
                await chrome.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: notifications });
            } else {
                localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(notifications));
            }
        }
    }

    /** Mark all notifications as read */
    static async markAllAsRead(): Promise<void> {
        const notifications = await this.getNotifications();
        notifications.forEach((n) => (n.read = true));
        if (typeof chrome !== "undefined" && chrome.storage) {
            await chrome.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: notifications });
        } else {
            localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(notifications));
        }
    }

    /** Clear all notifications */
    static async clearAll(): Promise<void> {
        if (typeof chrome !== "undefined" && chrome.storage) {
            await chrome.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: [] });
        } else {
            localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify([]));
        }
    }

    /** Get unread count */
    static async getUnreadCount(): Promise<number> {
        const notifications = await this.getNotifications();
        return notifications.filter((n) => !n.read).length;
    }

    /**
     * Show a Chrome extension notification (badge + popup).
     * This works from both service worker and popup contexts.
     */
    static async showBrowserNotification(title: string, message: string, iconUrl?: string): Promise<void> {
        const prefs = await this.getPreferences();
        if (!prefs.enabled) return;

        try {
            if (typeof chrome !== "undefined" && chrome.notifications) {
                chrome.notifications.create(`arfhe_${Date.now()}`, {
                    type: "basic",
                    iconUrl: iconUrl || "images/icon48.png",
                    title,
                    message,
                    priority: 1,
                });
            }
        } catch (e) {
        }
    }

    /**
     * Notify about incoming transaction
     */
    static async notifyIncomingTx(from: string, value: string, token: string, txHash: string, explorerUrl?: string): Promise<void> {
        const prefs = await this.getPreferences();
        if (!prefs.enabled || !prefs.incomingTx) return;

        const shortFrom = `${from.slice(0, 6)}...${from.slice(-4)}`;

        await this.addNotification({
            type: "incoming_tx",
            title: `Incoming ${token}`,
            message: `Received ${value} ${token} from ${shortFrom}`,
            data: { txHash, from, value, token, explorerUrl },
        });

        await this.showBrowserNotification(
            `💰 Incoming ${token}`,
            `Received ${value} ${token} from ${shortFrom}`
        );
    }

    /**
     * Notify about transaction confirmation
     */
    static async notifyTxConfirmed(txHash: string, explorerUrl?: string): Promise<void> {
        const prefs = await this.getPreferences();
        if (!prefs.enabled || !prefs.txConfirmation) return;

        const shortHash = `${txHash.slice(0, 10)}...${txHash.slice(-6)}`;

        await this.addNotification({
            type: "tx_confirmed",
            title: "Transaction Confirmed ✅",
            message: `TX ${shortHash} has been confirmed`,
            data: { txHash, explorerUrl },
        });

        await this.showBrowserNotification(
            "✅ Transaction Confirmed",
            `TX ${shortHash} confirmed on-chain`
        );
    }

    /**
     * Notify about failed transaction
     */
    static async notifyTxFailed(txHash: string, reason?: string): Promise<void> {
        const prefs = await this.getPreferences();
        if (!prefs.enabled || !prefs.txConfirmation) return;

        const shortHash = `${txHash.slice(0, 10)}...${txHash.slice(-6)}`;

        await this.addNotification({
            type: "tx_failed",
            title: "Transaction Failed ❌",
            message: reason || `TX ${shortHash} has failed`,
            data: { txHash },
        });

        await this.showBrowserNotification(
            "❌ Transaction Failed",
            reason || `TX ${shortHash} failed`
        );
    }

    /**
     * Update the extension badge with unread count
     */
    static async updateBadge(): Promise<void> {
        try {
            if (typeof chrome !== "undefined" && chrome.action) {
                const count = await this.getUnreadCount();
                chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
                chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
            }
        } catch (e) {
            // Silently fail if not in extension context
        }
    }
}
