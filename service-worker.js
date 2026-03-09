/**
 * Arfhe Wallet — Enhanced Service Worker (MV3)
 *
 * Background processing for a professional crypto wallet:
 *  1. Pending TX monitoring — poll receipts, notify on confirm/fail
 *  2. Price change alerts — periodic ETH price check, ±5% notification
 *  3. Badge management — unread count + pending TX count
 *  4. Heartbeat keepalive — prevent SW from being killed during active monitoring
 *
 * Communication protocol (popup → SW):
 *  WATCH_TX        — Add a TX hash to the monitoring watchlist
 *  REMOVE_TX       — Remove a TX from the watchlist
 *  GET_STATUS      — Get current SW state (pending TXs, last price, uptime)
 *  CLEAR_BADGE     — Reset badge to ""
 *  UPDATE_BADGE    — Set badge to a specific count
 *  SHOW_NOTIFICATION — Show a Chrome notification
 *  SET_RPC_URL     — Update the RPC URL for a network
 *  SET_PRICE_ALERT — Enable/disable/configure price alerts
 *  POPUP_OPENED    — Popup just opened, sync state
 *  POPUP_CLOSED    — Popup just closed, start autonomous monitoring
 */

// ─── Constants ──────────────────────────────────────────────────────
const ALARM_TX_MONITOR = "arfhe_tx_monitor";
const ALARM_PRICE_CHECK = "arfhe_price_check";
const ALARM_BADGE_SYNC = "arfhe_badge_sync";
const ALARM_KEEPALIVE = "arfhe_keepalive";

const STORAGE_KEY_NOTIFICATIONS = "arfhe_notifications";
const STORAGE_KEY_PENDING_TXS = "arfhe_pending_txs";
const STORAGE_KEY_PRICE_STATE = "arfhe_price_state";
const STORAGE_KEY_RPC_URLS = "arfhe_rpc_urls";
const STORAGE_KEY_PRICE_ALERT_CONFIG = "arfhe_price_alert_config";

const TX_POLL_INTERVAL_MINUTES = 0.25; // 15 seconds
const PRICE_CHECK_INTERVAL_MINUTES = 5; // 5 minutes
const BADGE_SYNC_INTERVAL_MINUTES = 1; // 1 minute
const MAX_TX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — auto-expire old TXs
const MAX_TX_POLLS = 240; // 240 polls × 15s = 1 hour max
const PRICE_CHANGE_THRESHOLD = 0.05; // 5% change triggers alert

// ── Default public RPC endpoints (no API key needed) ────────────────
const DEFAULT_RPC = {
  1: "https://ethereum.publicnode.com",
  4: "https://ethereum-sepolia.publicnode.com",
  42161: "https://arbitrum.publicnode.com",
  421614: "https://arbitrum-sepolia.publicnode.com",
  8453: "https://base.publicnode.com",
  84532: "https://base-sepolia.publicnode.com",
  8008135: "https://api.helium.fhenix.zone",
};

// ─── In-Memory State (lost on SW restart, restored from storage) ────
let pendingTxs = new Map(); // txHash → { hash, networkId, rpcUrl, addedAt, pollCount, from, to, value }
let lastEthPrice = null; // { usd: number, timestamp: number }
let rpcOverrides = {}; // networkId → rpcUrl (set by popup when Alchemy key is available)
let priceAlertConfig = { enabled: true, threshold: PRICE_CHANGE_THRESHOLD };

// ─── Extension Install / Startup ────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {

  // Clear stale cache on install
  try { chrome.browsingData.removeCache({}); } catch { /* */ }

  await setupAlarms();
  await restoreState();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarms();
  await restoreState();
});

async function setupAlarms() {
  // Clear all existing alarms first
  await chrome.alarms.clearAll();

  // Badge sync — always runs
  chrome.alarms.create(ALARM_BADGE_SYNC, { periodInMinutes: BADGE_SYNC_INTERVAL_MINUTES });

  // Price check — periodic
  chrome.alarms.create(ALARM_PRICE_CHECK, {
    delayInMinutes: 0.5,
    periodInMinutes: PRICE_CHECK_INTERVAL_MINUTES,
  });

}

async function restoreState() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEY_PENDING_TXS,
      STORAGE_KEY_PRICE_STATE,
      STORAGE_KEY_RPC_URLS,
      STORAGE_KEY_PRICE_ALERT_CONFIG,
    ]);

    // Restore pending TXs
    const stored = result[STORAGE_KEY_PENDING_TXS];
    if (Array.isArray(stored)) {
      pendingTxs = new Map();
      const now = Date.now();
      for (const tx of stored) {
        // Skip expired TXs
        if (now - tx.addedAt > MAX_TX_AGE_MS) continue;
        pendingTxs.set(tx.hash, tx);
      }
      if (pendingTxs.size > 0) {
        startTxMonitorAlarm();
      }
    }

    // Restore price state
    if (result[STORAGE_KEY_PRICE_STATE]) {
      lastEthPrice = result[STORAGE_KEY_PRICE_STATE];
    }

    // Restore RPC overrides
    if (result[STORAGE_KEY_RPC_URLS]) {
      rpcOverrides = result[STORAGE_KEY_RPC_URLS];
    }

    // Restore price alert config
    if (result[STORAGE_KEY_PRICE_ALERT_CONFIG]) {
      priceAlertConfig = { ...priceAlertConfig, ...result[STORAGE_KEY_PRICE_ALERT_CONFIG] };
    }
  } catch (e) {
  }
}

// ─── Alarm Handler ──────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case ALARM_TX_MONITOR:
      await pollPendingTransactions();
      break;
    case ALARM_PRICE_CHECK:
      await checkPriceChanges();
      break;
    case ALARM_BADGE_SYNC:
      await syncBadge();
      break;
    case ALARM_KEEPALIVE:
      // Just a keepalive ping — prevents SW from being killed
      break;
  }
});

// ─── TX Monitoring ──────────────────────────────────────────────────

function startTxMonitorAlarm() {
  chrome.alarms.create(ALARM_TX_MONITOR, {
    delayInMinutes: 0.05, // Start in 3 seconds
    periodInMinutes: TX_POLL_INTERVAL_MINUTES,
  });
  // Also create a keepalive to prevent SW from sleeping
  chrome.alarms.create(ALARM_KEEPALIVE, {
    delayInMinutes: 0.08,
    periodInMinutes: 0.2, // Every 12 seconds
  });
}

function stopTxMonitorAlarm() {
  chrome.alarms.clear(ALARM_TX_MONITOR);
  chrome.alarms.clear(ALARM_KEEPALIVE);
}

/**
 * Add a transaction to the monitoring watchlist.
 */
async function watchTransaction(txData) {
  const entry = {
    hash: txData.hash,
    networkId: txData.networkId || 1,
    rpcUrl: txData.rpcUrl || getRpcUrl(txData.networkId || 1),
    addedAt: Date.now(),
    pollCount: 0,
    from: txData.from || "",
    to: txData.to || "",
    value: txData.value || "",
    symbol: txData.symbol || "ETH",
    type: txData.type || "transfer", // transfer | swap | approve
  };

  pendingTxs.set(entry.hash, entry);
  await persistPendingTxs();

  // Start monitoring if not already running
  const existing = await chrome.alarms.get(ALARM_TX_MONITOR);
  if (!existing) {
    startTxMonitorAlarm();
  }

  // Update badge immediately
  await syncBadge();

  return entry;
}

/**
 * Poll all pending transactions for receipt.
 */
async function pollPendingTransactions() {
  if (pendingTxs.size === 0) {
    stopTxMonitorAlarm();
    return;
  }

  const completed = [];

  for (const [hash, tx] of pendingTxs) {
    tx.pollCount++;

    // Auto-expire after max polls
    if (tx.pollCount > MAX_TX_POLLS) {
      completed.push(hash);
      await notifyTxExpired(tx);
      continue;
    }

    // Auto-expire after max age
    if (Date.now() - tx.addedAt > MAX_TX_AGE_MS) {
      completed.push(hash);
      continue;
    }

    try {
      const receipt = await getTransactionReceipt(tx.rpcUrl, hash);

      if (receipt) {
        completed.push(hash);

        if (receipt.status === "0x1" || receipt.status === 1) {
          await notifyTxConfirmed(tx, receipt);
        } else {
          await notifyTxFailed(tx);
        }
      }
      // If receipt is null, TX is still pending — will retry next poll
    } catch (e) {
      // Don't remove on RPC error — will retry
    }
  }

  // Remove completed TXs
  for (const hash of completed) {
    pendingTxs.delete(hash);
  }

  if (completed.length > 0) {
    await persistPendingTxs();
    await syncBadge();
  }

  // Stop alarm if no more pending TXs
  if (pendingTxs.size === 0) {
    stopTxMonitorAlarm();
  }
}

/**
 * eth_getTransactionReceipt via JSON-RPC.
 */
async function getTransactionReceipt(rpcUrl, txHash) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txHash],
      id: 1,
    }),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);

  return json.result; // null if pending, object if mined
}

async function notifyTxConfirmed(tx, receipt) {
  const gasUsed = receipt.gasUsed ? parseInt(receipt.gasUsed, 16) : null;

  await addStoredNotification({
    type: "tx_confirmed",
    title: "✅ Transaction Confirmed",
    message: `${tx.type === "swap" ? "Swap" : "Transfer"} of ${tx.value} ${tx.symbol} confirmed${gasUsed ? ` (gas: ${gasUsed.toLocaleString()})` : ""}`,
    data: { txHash: tx.hash, from: tx.from, to: tx.to, value: tx.value, networkId: String(tx.networkId) },
  });

  try {
    chrome.notifications.create(`arfhe_tx_ok_${Date.now()}`, {
      type: "basic",
      iconUrl: "images/icon48.png",
      title: "✅ Transaction Confirmed",
      message: `${tx.value} ${tx.symbol} — ${shortHash(tx.hash)}`,
      priority: 2,
    });
  } catch { /* notifications API not available */ }
}

async function notifyTxFailed(tx) {
  await addStoredNotification({
    type: "tx_failed",
    title: "❌ Transaction Failed",
    message: `${tx.type === "swap" ? "Swap" : "Transfer"} of ${tx.value} ${tx.symbol} failed`,
    data: { txHash: tx.hash, from: tx.from, to: tx.to, value: tx.value, networkId: String(tx.networkId) },
  });

  try {
    chrome.notifications.create(`arfhe_tx_fail_${Date.now()}`, {
      type: "basic",
      iconUrl: "images/icon48.png",
      title: "❌ Transaction Failed",
      message: `${tx.value} ${tx.symbol} — ${shortHash(tx.hash)}`,
      priority: 2,
    });
  } catch { /* */ }
}

async function notifyTxExpired(tx) {
  await addStoredNotification({
    type: "tx_failed",
    title: "⏰ Transaction Timeout",
    message: `TX ${shortHash(tx.hash)} was not confirmed within the monitoring window`,
    data: { txHash: tx.hash, networkId: String(tx.networkId) },
  });
}

// ─── Price Monitoring ───────────────────────────────────────────────

async function checkPriceChanges() {
  if (!priceAlertConfig.enabled) return;

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { headers: { Accept: "application/json" } }
    );

    if (!res.ok) return;

    const data = await res.json();
    const currentPrice = data?.ethereum?.usd;
    if (!currentPrice || typeof currentPrice !== "number") return;

    const now = Date.now();

    if (lastEthPrice && lastEthPrice.usd > 0) {
      const change = (currentPrice - lastEthPrice.usd) / lastEthPrice.usd;
      const absChange = Math.abs(change);
      const threshold = priceAlertConfig.threshold || PRICE_CHANGE_THRESHOLD;

      if (absChange >= threshold) {
        const direction = change > 0 ? "📈" : "📉";
        const pct = (change * 100).toFixed(1);
        const sign = change > 0 ? "+" : "";


        await addStoredNotification({
          type: "price_alert",
          title: `${direction} ETH Price ${sign}${pct}%`,
          message: `ETH is now $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (was $${lastEthPrice.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
          data: {},
        });

        try {
          chrome.notifications.create(`arfhe_price_${now}`, {
            type: "basic",
            iconUrl: "images/icon48.png",
            title: `${direction} ETH ${sign}${pct}%`,
            message: `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            priority: 1,
          });
        } catch { /* */ }
      }
    }

    // Update stored price
    lastEthPrice = { usd: currentPrice, timestamp: now };
    await chrome.storage.local.set({ [STORAGE_KEY_PRICE_STATE]: lastEthPrice });

  } catch (e) {
  }
}

// ─── Badge Management ───────────────────────────────────────────────

async function syncBadge() {
  try {
    const unreadCount = await getUnreadNotificationCount();
    const pendingCount = pendingTxs.size;
    const total = unreadCount + pendingCount;

    // Badge text: show total, with pending TX indicator
    let badgeText = "";
    if (total > 0) {
      badgeText = total > 99 ? "99+" : String(total);
    }

    // Badge color: orange if pending TXs, red if only notifications
    const badgeColor = pendingCount > 0 ? "#f59e0b" : "#ef4444";

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  } catch {
    // Not in extension context
  }
}

async function getUnreadNotificationCount() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_NOTIFICATIONS);
    const notifications = result[STORAGE_KEY_NOTIFICATIONS] || [];
    return notifications.filter((n) => !n.read).length;
  } catch {
    return 0;
  }
}

// ─── Message Handler (popup ↔ SW) ───────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((e) => {
    sendResponse({ success: false, error: e.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    // ── TX Monitoring ─────────────────────────────────────────
    case "WATCH_TX": {
      const entry = await watchTransaction(message);
      return { success: true, entry };
    }

    case "REMOVE_TX": {
      pendingTxs.delete(message.txHash);
      await persistPendingTxs();
      await syncBadge();
      return { success: true };
    }

    case "GET_PENDING_TXS": {
      return {
        success: true,
        pendingTxs: Array.from(pendingTxs.values()),
      };
    }

    // ── Status ────────────────────────────────────────────────
    case "GET_STATUS": {
      return {
        success: true,
        status: {
          pendingTxCount: pendingTxs.size,
          pendingTxs: Array.from(pendingTxs.values()).map((tx) => ({
            hash: tx.hash,
            networkId: tx.networkId,
            addedAt: tx.addedAt,
            pollCount: tx.pollCount,
            symbol: tx.symbol,
            value: tx.value,
          })),
          lastEthPrice: lastEthPrice,
          priceAlertConfig: priceAlertConfig,
        },
      };
    }

    // ── Badge ─────────────────────────────────────────────────
    case "CLEAR_BADGE": {
      chrome.action.setBadgeText({ text: "" });
      return { success: true };
    }

    case "UPDATE_BADGE": {
      const count = message.count || 0;
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
      chrome.action.setBadgeBackgroundColor({ color: message.color || "#ef4444" });
      return { success: true };
    }

    // ── Notifications ─────────────────────────────────────────
    case "SHOW_NOTIFICATION": {
      try {
        chrome.notifications.create(`arfhe_${Date.now()}`, {
          type: "basic",
          iconUrl: message.iconUrl || "images/icon48.png",
          title: message.title || "Arfhe Wallet",
          message: message.message || "",
          priority: message.priority || 1,
        });
      } catch { /* */ }
      return { success: true };
    }

    case "TX_CONFIRMED": {
      // Legacy support — popup manually confirming a TX
      const sh = message.txHash ? shortHash(message.txHash) : "Unknown";
      try {
        chrome.notifications.create(`arfhe_tx_${Date.now()}`, {
          type: "basic",
          iconUrl: "images/icon48.png",
          title: "✅ Transaction Confirmed",
          message: `TX ${sh} confirmed on-chain`,
          priority: 2,
        });
      } catch { /* */ }
      return { success: true };
    }

    case "TX_FAILED": {
      try {
        chrome.notifications.create(`arfhe_txfail_${Date.now()}`, {
          type: "basic",
          iconUrl: "images/icon48.png",
          title: "❌ Transaction Failed",
          message: message.reason || "Transaction failed",
          priority: 2,
        });
      } catch { /* */ }
      return { success: true };
    }

    // ── RPC Configuration ─────────────────────────────────────
    case "SET_RPC_URL": {
      if (message.networkId && message.rpcUrl) {
        rpcOverrides[message.networkId] = message.rpcUrl;
        await chrome.storage.local.set({ [STORAGE_KEY_RPC_URLS]: rpcOverrides });
      }
      return { success: true };
    }

    // ── Price Alert Configuration ─────────────────────────────
    case "SET_PRICE_ALERT": {
      priceAlertConfig = {
        enabled: message.enabled !== undefined ? message.enabled : priceAlertConfig.enabled,
        threshold: message.threshold || priceAlertConfig.threshold,
      };
      await chrome.storage.local.set({ [STORAGE_KEY_PRICE_ALERT_CONFIG]: priceAlertConfig });
      return { success: true, config: priceAlertConfig };
    }

    // ── Popup lifecycle ───────────────────────────────────────
    case "POPUP_OPENED": {
      // Sync state when popup opens
      await syncBadge();
      return {
        success: true,
        pendingTxCount: pendingTxs.size,
        lastEthPrice: lastEthPrice,
      };
    }

    case "POPUP_CLOSED": {
      // Nothing special needed — alarms continue running
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ─── Storage Helpers ────────────────────────────────────────────────

async function persistPendingTxs() {
  try {
    const txArray = Array.from(pendingTxs.values());
    await chrome.storage.local.set({ [STORAGE_KEY_PENDING_TXS]: txArray });
  } catch (e) {
  }
}

async function addStoredNotification(notification) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_NOTIFICATIONS);
    const notifications = result[STORAGE_KEY_NOTIFICATIONS] || [];

    const newNotif = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };

    notifications.unshift(newNotif);

    // Keep max 50 notifications
    const trimmed = notifications.slice(0, 50);
    await chrome.storage.local.set({ [STORAGE_KEY_NOTIFICATIONS]: trimmed });

    // Update badge
    await syncBadge();

    return newNotif;
  } catch (e) {
  }
}

function getRpcUrl(networkId) {
  // Check for popup-provided override (e.g., Alchemy URL)
  if (rpcOverrides[networkId]) return rpcOverrides[networkId];
  // Fallback to public RPC
  return DEFAULT_RPC[networkId] || DEFAULT_RPC[1];
}

function shortHash(hash) {
  if (!hash || hash.length < 16) return hash || "???";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

// ─── Notification click handler ─────────────────────────────────────

chrome.notifications.onClicked.addListener((notifId) => {
  // Open the extension popup when a notification is clicked
  chrome.action.openPopup?.().catch(() => {
    // openPopup not available in all contexts, ignore
  });
  chrome.notifications.clear(notifId);
});

