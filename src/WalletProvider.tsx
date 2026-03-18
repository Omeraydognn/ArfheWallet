import React from "react";
import { AppContext, WalletContext } from "./AppContext.js";
import { useNavigate, useLocation } from "react-router";

import WalletConnectManager from "./components/WalletConnectManager";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Create AppContext instance once
  const appContext = React.useMemo(() => new AppContext(), []);
  const navigate = useNavigate();
  const location = useLocation();

  // State just for forcing re-renders
  const [, setRefresh] = React.useState(0);

  // Subscribe to AccountManager and NetworkProvider changes
  React.useEffect(() => {
    const unsubscribeAccount = appContext.accountManager.subscribe(() => {
      setRefresh(f => f + 1);
    });
    const unsubscribeNetwork = appContext.networkProvider.subscribe(() => {
      setRefresh(f => f + 1);
    });
    return () => {
      unsubscribeAccount();
      unsubscribeNetwork();
    };
  }, [appContext.accountManager, appContext.networkProvider]);

  // --- Auto-Lock Feature ---
  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    // Default to 5 minutes, read from storage if available
    const getTimeout = () => {
      const saved = appContext.storageManager.getLocal<number>('autoLockTimeout');
      if (typeof saved === 'number') {
        return saved;
      }
      return 5 * 60 * 1000;
    };

    const performLock = () => {
      // Only lock if we are NOT already on the auth or splash screens
      if (location.pathname !== '/auth' && location.pathname !== '/') {
        // StorageManager.lock() now triggers all registered cleanup callbacks
        // (AccountManager.clearSensitiveData, FheCofheService.reset, DataCache.invalidate)
        appContext.storageManager.lock();
        navigate('/auth', { replace: true });
      }
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      const currentTimeout = getTimeout();
      localStorage.setItem('arfhe_last_active', Date.now().toString());

      if (currentTimeout <= 0) return; // 0 or negative means never lock

      // Only lock if we are NOT already on the auth or splash screens
      if (location.pathname !== '/auth' && location.pathname !== '/') {
        timeoutId = setTimeout(performLock, currentTimeout);
      }
    };

    const handleStorageUpdate = () => resetTimer();

    // ── Tab Visibility Change ──
    // Lock wallet when user switches away from the tab
    // Grace period scales with configured auto-lock timeout:
    //   - 1min lock  → 15s hidden grace
    //   - 5min lock  → 30s hidden grace
    //   - 15min lock → 60s hidden grace
    //   - 30min+ lock → 120s hidden grace
    //   - Never       → no lock on hide
    let visibilityTimeoutId: NodeJS.Timeout;

    const getVisibilityDelay = (timeout: number): number => {
      if (timeout <= 0) return 0; // Never lock
      if (timeout <= 60_000) return 15_000;      // ≤1 min → 15s
      if (timeout <= 300_000) return 30_000;      // ≤5 min → 30s
      if (timeout <= 900_000) return 60_000;      // ≤15 min → 60s
      return 120_000;                              // >15 min → 2 min
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden — start countdown to lock
        const currentTimeout = getTimeout();
        if (currentTimeout <= 0) return; // Never lock if disabled

        const lockDelay = getVisibilityDelay(currentTimeout);
        visibilityTimeoutId = setTimeout(() => {
          performLock();
        }, lockDelay);
      } else {
        // Tab visible again — cancel pending lock
        clearTimeout(visibilityTimeoutId);
        resetTimer(); // Reset normal activity timer
      }
    };

    // Listeners for user activity
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('autolock_updated', handleStorageUpdate);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial set
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(visibilityTimeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('autolock_updated', handleStorageUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate, location.pathname, appContext.storageManager]);

  return (
    <WalletContext.Provider value={appContext}>
      {children}
      <WalletConnectManager />
    </WalletContext.Provider>
  );
}
