import React from "react";
import { AppContext, WalletContext } from "./AppContext.js";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Create AppContext instance once
  const appContext = React.useMemo(() => new AppContext(), []);

  // State just for forcing re-renders
  const [, setRefresh] = React.useState(0);

  // Subscribe to AccountManager changes
  React.useEffect(() => {
    const unsubscribe = appContext.accountManager.subscribe(() => {
      setRefresh(f => f + 1); // trigger re-render
    });
    return unsubscribe;
  }, [appContext.accountManager]);

  return (
    <WalletContext.Provider value={appContext}>
      {children}
    </WalletContext.Provider>
  );
}
