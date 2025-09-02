import React, { createContext, useContext, useState, useEffect } from "react";
import { WalletContext } from "./AppContext.js";
import Account from "./backend/Account.js";

export interface ActiveAccountContextType {
  activeIndex: number;
  activeAccount: Account | undefined;
  setActiveIndex: (index: number) => void;
}

export const ActiveAccountContext = createContext<ActiveAccountContextType | undefined>(undefined);

export const useActiveAccount = () => {
  const ctx = useContext(ActiveAccountContext);
  if (!ctx) throw new Error("useActiveAccount must be used inside ActiveAccountProvider");
  return ctx;
};

export const ActiveAccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("WalletContext must be available for ActiveAccountProvider");

  const [activeIndex, setInnerActiveIndex] = useState(wallet.accountManager.GetActiveIndex());

  const setActiveIndex = (index: number) => {
    wallet.accountManager.SetActive(index);
    setInnerActiveIndex(index);
  };

  useEffect(() => {
    const unsubscribe = wallet.accountManager.subscribe(() => {
      const idx = wallet.accountManager.GetActiveIndex();
      setInnerActiveIndex(idx); // will re-render children when active changes
    });
    return unsubscribe;
  }, [wallet]);

  return (
    <ActiveAccountContext.Provider
      value={{
        activeIndex,
        setActiveIndex,
        activeAccount: wallet.accountManager.GetActive(),
      }}
    >
      {children}
    </ActiveAccountContext.Provider>
  );
};
