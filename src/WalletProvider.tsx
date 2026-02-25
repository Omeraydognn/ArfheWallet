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
  const AUTO_LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      // Only lock if we are NOT already on the auth or splash screens
      if (location.pathname !== '/auth' && location.pathname !== '/') {
        timeoutId = setTimeout(() => {
          // Lock the wallet by removing the session password and redirecting
          appContext.storageManager.removeLocal('passwd');
          navigate('/auth', { replace: true });
        }, AUTO_LOCK_TIMEOUT);
      }
    };

    // Listeners for user activity
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    // Initial set
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [navigate, location.pathname, appContext.storageManager]);

  return (
    <WalletContext.Provider value={appContext}>
      {children}
      <WalletConnectManager />
    </WalletContext.Provider>
  );
}
