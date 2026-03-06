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

    const resetTimer = () => {
      clearTimeout(timeoutId);
      const currentTimeout = getTimeout();
      if (currentTimeout <= 0) return; // 0 or negative means never lock

      // Only lock if we are NOT already on the auth or splash screens
      if (location.pathname !== '/auth' && location.pathname !== '/') {
        timeoutId = setTimeout(() => {
          // Lock the wallet: clear AES key from memory and redirect to auth
          appContext.storageManager.lock();
          navigate('/auth', { replace: true });
        }, currentTimeout);
      }
    };

    const handleStorageUpdate = () => resetTimer();

    // Listeners for user activity
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('autolock_updated', handleStorageUpdate);

    // Initial set
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('autolock_updated', handleStorageUpdate);
    };
  }, [navigate, location.pathname, appContext.storageManager]);

  return (
    <WalletContext.Provider value={appContext}>
      {children}
      <WalletConnectManager />
    </WalletContext.Provider>
  );
}
