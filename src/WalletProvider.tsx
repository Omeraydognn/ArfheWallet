import React from "react";
import { AppContext, WalletContext } from "./AppContext.js";

import WalletConnectManager from "./components/WalletConnectManager";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Create AppContext instance once
  const appContext = React.useMemo(() => new AppContext(), []);

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

  return (
    <WalletContext.Provider value={appContext}>
      {children}
      <WalletConnectManager />
    </WalletContext.Provider>
  );
}
