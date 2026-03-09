/**
 * useAccount — Simplified access to the active account.
 *
 * Combines ActiveAccountContext + WalletContext to provide:
 * - Active account instance, address, index
 * - All accounts list
 * - Account switching, creation, import
 *
 * Usage:
 *   const { account, address, shortAddress, accounts, setActiveIndex } = useAccount();
 */

import { useMemo } from "react";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import { useWallet } from "./useWallet.js";
import type Account from "../backend/Account.js";

export interface UseAccountReturn {
  /** Active Account instance (or undefined if locked) */
  account: Account | undefined;
  /** Active account index */
  activeIndex: number;
  /** Full checksummed address (or empty string) */
  address: string;
  /** Truncated address for display: 0x1234…abcd */
  shortAddress: string;
  /** All available accounts */
  accounts: Account[];
  /** Total number of accounts */
  accountCount: number;
  /** Switch active account by index */
  setActiveIndex: (index: number) => void;
  /** Whether the wallet is locked (no active account) */
  isLocked: boolean;
}

export function useAccount(): UseAccountReturn {
  const { activeAccount, activeIndex, setActiveIndex } = useActiveAccount();
  const wallet = useWallet();

  const address = useMemo(
    () => activeAccount?.GetAddress() ?? "",
    [activeAccount]
  );

  const shortAddress = useMemo(() => {
    if (!address || address.length < 10) return "";
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }, [address]);

  const accounts = useMemo(
    () => wallet.accountManager.GetAll(),
    [wallet.accountManager, activeIndex]
  );

  return {
    account: activeAccount,
    activeIndex,
    address,
    shortAddress,
    accounts,
    accountCount: accounts.length,
    setActiveIndex,
    isLocked: !activeAccount,
  };
}

export default useAccount;
