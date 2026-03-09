/**
 * useNetwork — Simplified access to the active network and network switching.
 *
 * Subscribes to NetworkProvider changes and re-renders only when the
 * active network actually changes. Reduces context boilerplate.
 *
 * Usage:
 *   const { networkId, network, networkName, switchNetwork, customNetworks } = useNetwork();
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWallet } from "./useWallet.js";
import { NetworkId, CustomNetworkConfig } from "../backend/NetworkTypes.js";
import type { Network } from "../backend/Network.js";

export interface UseNetworkReturn {
  /** Current active network ID */
  networkId: NetworkId;
  /** Current active Network instance */
  network: Network;
  /** Human-readable network name */
  networkName: string;
  /** Currency symbol (ETH, MATIC, etc.) */
  currencySymbol: string;
  /** Whether this is a testnet */
  isTestnet: boolean;
  /** Whether this is a custom (user-added) network */
  isCustom: boolean;
  /** Switch to a different network */
  switchNetwork: (id: NetworkId) => void;
  /** List of all user-added custom networks */
  customNetworks: CustomNetworkConfig[];
  /** Add a custom network */
  addCustomNetwork: (config: CustomNetworkConfig) => void;
  /** Remove a custom network */
  removeCustomNetwork: (chainId: number) => void;
}

const TESTNET_IDS = new Set<NetworkId>([
  NetworkId.Ethereum_Sepolia,
  NetworkId.Fhenix_Sepolia,
  NetworkId.Arbitrum_Sepolia,
  NetworkId.Base_Sepolia,
]);

export function useNetwork(): UseNetworkReturn {
  const wallet = useWallet();
  const np = wallet.networkProvider;

  const [networkId, setNetworkId] = useState<NetworkId>(np.getActiveNetworkId());

  // Subscribe to network changes
  useEffect(() => {
    const unsubscribe = np.subscribe(() => {
      setNetworkId(np.getActiveNetworkId());
    });
    return unsubscribe;
  }, [np]);

  const network = useMemo(() => np.getActiveNetwork(), [np, networkId]);

  const switchNetwork = useCallback(
    (id: NetworkId) => np.switchNetwork(id),
    [np]
  );

  const addCustomNetwork = useCallback(
    (config: CustomNetworkConfig) => np.addCustomNetwork(config),
    [np]
  );

  const removeCustomNetwork = useCallback(
    (chainId: number) => np.removeCustomNetwork(chainId),
    [np]
  );

  const customNetworks = useMemo(() => np.getCustomNetworks(), [np, networkId]);

  return {
    networkId,
    network,
    networkName: network.network_name,
    currencySymbol: network.currency_symbol || "ETH",
    isTestnet: TESTNET_IDS.has(networkId),
    isCustom: network.isCustom,
    switchNetwork,
    customNetworks,
    addCustomNetwork,
    removeCustomNetwork,
  };
}

export default useNetwork;
