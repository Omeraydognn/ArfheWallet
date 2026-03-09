/**
 * useWallet — Safe access to WalletContext (AppContext).
 *
 * Throws a clear error if used outside the provider tree.
 * Provides typed access to all wallet services.
 *
 * Usage:
 *   const { networkProvider, tokenCache, dataCacheService } = useWallet();
 */

import { useContext } from "react";
import { WalletContext } from "../AppContext.js";
import type { AppContext } from "../AppContext.js";

export function useWallet(): AppContext {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletContext.Provider");
  }
  return context;
}

export default useWallet;
