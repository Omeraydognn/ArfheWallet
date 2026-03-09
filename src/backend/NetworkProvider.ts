import SepoliaNetwork from "./Sepolia.js";
import MainnetNetwork from "./Mainnet.js";
import FhenixSepoliaNetwork from "./FhenixSepolia.js";
import ArbitrumOneNetwork from "./ArbitrumOne.js";
import ArbitrumSepoliaNetwork from "./ArbitrumSepolia.js";
import BaseMainnetNetwork from "./BaseMainnet.js";
import BaseSepoliaNetwork from "./BaseSepolia.js";
import { Network } from "./Network.js";
import { NetworkId, CustomNetworkConfig } from "./NetworkTypes.js";

const CUSTOM_NETWORKS_STORAGE_KEY = "arfhe_custom_networks";
const ACTIVE_NETWORK_SESSION_KEY = "arfhe_ps_active_network";

type Listener = () => void;

class NetworkProvider {
  private sepoliaNetwork?: SepoliaNetwork;
  private mainnetNetwork?: MainnetNetwork;
  private fhenixSepoliaNetwork?: FhenixSepoliaNetwork;
  private arbitrumOneNetwork?: ArbitrumOneNetwork;
  private arbitrumSepoliaNetwork?: ArbitrumSepoliaNetwork;
  private baseMainnetNetwork?: BaseMainnetNetwork;
  private baseSepoliaNetwork?: BaseSepoliaNetwork;

  /** User-added custom networks keyed by chainId */
  private customNetworks: Map<number, Network> = new Map();

  private activeNetworkId: NetworkId = NetworkId.Ethereum_Sepolia; // Default to Ethereum Sepolia
  private listeners: Listener[] = [];

  constructor() {
    this.init();
    this.loadCustomNetworks();
    this.restoreActiveNetwork();
  }

  init() {
    if (!this.sepoliaNetwork) this.sepoliaNetwork = new SepoliaNetwork();
    if (!this.mainnetNetwork) this.mainnetNetwork = new MainnetNetwork();
    if (!this.fhenixSepoliaNetwork) this.fhenixSepoliaNetwork = new FhenixSepoliaNetwork();
    if (!this.arbitrumOneNetwork) this.arbitrumOneNetwork = new ArbitrumOneNetwork();
    if (!this.arbitrumSepoliaNetwork) this.arbitrumSepoliaNetwork = new ArbitrumSepoliaNetwork();
    if (!this.baseMainnetNetwork) this.baseMainnetNetwork = new BaseMainnetNetwork();
    if (!this.baseSepoliaNetwork) this.baseSepoliaNetwork = new BaseSepoliaNetwork();
  }

  getSepoliaNetwork(): SepoliaNetwork {
    if (!this.sepoliaNetwork) this.sepoliaNetwork = new SepoliaNetwork();
    return this.sepoliaNetwork;
  }

  getMainnetNetwork(): MainnetNetwork {
    if (!this.mainnetNetwork) this.mainnetNetwork = new MainnetNetwork();
    return this.mainnetNetwork;
  }

  getFhenixSepoliaNetwork(): FhenixSepoliaNetwork {
    if (!this.fhenixSepoliaNetwork) this.fhenixSepoliaNetwork = new FhenixSepoliaNetwork();
    return this.fhenixSepoliaNetwork;
  }

  getArbitrumOneNetwork(): ArbitrumOneNetwork {
    if (!this.arbitrumOneNetwork) this.arbitrumOneNetwork = new ArbitrumOneNetwork();
    return this.arbitrumOneNetwork;
  }

  getArbitrumSepoliaNetwork(): ArbitrumSepoliaNetwork {
    if (!this.arbitrumSepoliaNetwork) this.arbitrumSepoliaNetwork = new ArbitrumSepoliaNetwork();
    return this.arbitrumSepoliaNetwork;
  }

  getBaseMainnetNetwork(): BaseMainnetNetwork {
    if (!this.baseMainnetNetwork) this.baseMainnetNetwork = new BaseMainnetNetwork();
    return this.baseMainnetNetwork;
  }

  getBaseSepoliaNetwork(): BaseSepoliaNetwork {
    if (!this.baseSepoliaNetwork) this.baseSepoliaNetwork = new BaseSepoliaNetwork();
    return this.baseSepoliaNetwork;
  }

  getActiveNetwork(): Network {
    switch (this.activeNetworkId) {
      case NetworkId.Ethereum_Mainnet:
        return this.getMainnetNetwork();
      case NetworkId.Ethereum_Sepolia:
        return this.getSepoliaNetwork();
      case NetworkId.Fhenix_Sepolia:
        return this.getFhenixSepoliaNetwork();
      case NetworkId.Arbitrum_One:
        return this.getArbitrumOneNetwork();
      case NetworkId.Arbitrum_Sepolia:
        return this.getArbitrumSepoliaNetwork();
      case NetworkId.Base_Mainnet:
        return this.getBaseMainnetNetwork();
      case NetworkId.Base_Sepolia:
        return this.getBaseSepoliaNetwork();
      default: {
        // Check custom networks
        const custom = this.customNetworks.get(this.activeNetworkId as number);
        if (custom) return custom;
        return this.getFhenixSepoliaNetwork(); // Fallback
      }
    }
  }

  switchNetwork(networkId: NetworkId) {
    if (this.activeNetworkId === networkId) return;
    this.activeNetworkId = networkId;
    this.persistActiveNetwork(networkId);
    this.notifyListeners();
  }

  getActiveNetworkId(): NetworkId {
    return this.activeNetworkId;
  }

  // --- Custom Network Management ---

  /** Load custom networks from localStorage */
  private loadCustomNetworks(): void {
    try {
      const raw = localStorage.getItem(CUSTOM_NETWORKS_STORAGE_KEY);
      if (!raw) return;
      const configs: CustomNetworkConfig[] = JSON.parse(raw);
      for (const config of configs) {
        const net = Network.fromCustomConfig(config);
        this.customNetworks.set(config.chainId, net);
      }
    } catch (e) {
    }
  }

  /** Save custom networks to localStorage */
  private saveCustomNetworks(): void {
    try {
      const configs: CustomNetworkConfig[] = [];
      for (const [_, net] of this.customNetworks) {
        configs.push({
          chainId: net.network_id as number,
          networkName: net.network_name,
          rpcUrl: net.rpc_url || "",
          explorerUrl: net.explorer_url || "",
          currencySymbol: net.currency_symbol,
        });
      }
      localStorage.setItem(CUSTOM_NETWORKS_STORAGE_KEY, JSON.stringify(configs));
    } catch (e) {
    }
  }

  /** Add a custom network and persist */
  addCustomNetwork(config: CustomNetworkConfig): void {
    // Prevent overriding built-in networks
    const builtIn = [
      NetworkId.Ethereum_Mainnet, NetworkId.Ethereum_Sepolia,
      NetworkId.Fhenix_Sepolia, NetworkId.Arbitrum_One,
      NetworkId.Arbitrum_Sepolia, NetworkId.Base_Mainnet,
      NetworkId.Base_Sepolia
    ] as number[];
    if (builtIn.includes(config.chainId)) {
      throw new Error(`Chain ID ${config.chainId} is a built-in network and cannot be overridden.`);
    }

    const net = Network.fromCustomConfig(config);
    this.customNetworks.set(config.chainId, net);
    this.saveCustomNetworks();
    this.notifyListeners();
  }

  /** Remove a custom network by chainId */
  removeCustomNetwork(chainId: number): void {
    if (!this.customNetworks.has(chainId)) return;
    this.customNetworks.delete(chainId);
    this.saveCustomNetworks();
    // If we were on the removed network, switch to Sepolia
    if ((this.activeNetworkId as number) === chainId) {
      this.activeNetworkId = NetworkId.Ethereum_Sepolia;
    }
    this.notifyListeners();
  }

  /** Get all custom network configs (for UI rendering) */
  getCustomNetworks(): CustomNetworkConfig[] {
    const configs: CustomNetworkConfig[] = [];
    for (const [_, net] of this.customNetworks) {
      configs.push({
        chainId: net.network_id as number,
        networkName: net.network_name,
        rpcUrl: net.rpc_url || "",
        explorerUrl: net.explorer_url || "",
        currencySymbol: net.currency_symbol,
        iconColor: "#1e40af", // Cool steel dot for custom networks
      });
    }
    return configs;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /** Restore active network from session storage (sync read for instant restore) */
  private restoreActiveNetwork(): void {
    try {
      const stored = sessionStorage.getItem(ACTIVE_NETWORK_SESSION_KEY);
      if (stored !== null) {
        const id = Number(stored);
        if (!isNaN(id)) {
          this.activeNetworkId = id as NetworkId;
        }
      }
      // Also try chrome.storage.session for extension popup persistence
      if (typeof chrome !== "undefined" && chrome?.storage?.session) {
        chrome.storage.session.get(ACTIVE_NETWORK_SESSION_KEY).then((result: Record<string, unknown>) => {
          const val = result[ACTIVE_NETWORK_SESSION_KEY];
          if (val !== undefined && val !== null) {
            const id = Number(val);
            if (!isNaN(id) && id !== this.activeNetworkId) {
              this.activeNetworkId = id as NetworkId;
              this.notifyListeners();
            }
          }
        }).catch(() => {/* ignore */});
      }
    } catch {
      // sessionStorage not available
    }
  }

  /** Persist active network to session storage + chrome.storage.session */
  private persistActiveNetwork(networkId: NetworkId): void {
    try {
      sessionStorage.setItem(ACTIVE_NETWORK_SESSION_KEY, String(networkId));
    } catch {
      // sessionStorage not available
    }
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.session) {
        chrome.storage.session.set({ [ACTIVE_NETWORK_SESSION_KEY]: networkId });
      }
    } catch {
      // chrome.storage.session not available
    }
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }
}

export default NetworkProvider;