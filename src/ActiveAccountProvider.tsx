import { createContext, useContext, useState, useEffect } from "react";
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
  const [activeAccount, setActiveAccount] = useState<Account | undefined>(wallet.accountManager.GetActive());

  useEffect(() => {
    const unsubscribe = wallet.accountManager.subscribe(() => {
      const idx = wallet.accountManager.GetActiveIndex();
      setInnerActiveIndex(idx);
      setActiveAccount(wallet.accountManager.GetActive());
    });
    return unsubscribe;
  }, [wallet]);

  const setActiveIndex = (index: number) => {
    if (wallet.accountManager.SetActive(index)) {
      setInnerActiveIndex(index);
      setActiveAccount(wallet.accountManager.GetActive());
    }
  };

  return (
    <ActiveAccountContext.Provider
      value={{
        activeIndex,
        activeAccount,
        setActiveIndex,
      }}
    >
      {children}
    </ActiveAccountContext.Provider>
  );
};