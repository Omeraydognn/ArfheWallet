import SepoliaNetwork from "./Sepolia.js";
import MainnetNetwork from "./Mainnet.js";
import FhenixSepoliaNetwork from "./FhenixSepolia.js";
import ArbitrumOneNetwork from "./ArbitrumOne.js";
import ArbitrumSepoliaNetwork from "./ArbitrumSepolia.js";
import BaseMainnetNetwork from "./BaseMainnet.js";
import BaseSepoliaNetwork from "./BaseSepolia.js";
import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

type Listener = () => void;

class NetworkProvider {
  private sepoliaNetwork?: SepoliaNetwork;
  private mainnetNetwork?: MainnetNetwork;
  private fhenixSepoliaNetwork?: FhenixSepoliaNetwork;
  private arbitrumOneNetwork?: ArbitrumOneNetwork;
  private arbitrumSepoliaNetwork?: ArbitrumSepoliaNetwork;
  private baseMainnetNetwork?: BaseMainnetNetwork;
  private baseSepoliaNetwork?: BaseSepoliaNetwork;

  private activeNetworkId: NetworkId = NetworkId.Ethereum_Sepolia; // Default to Ethereum Sepolia
  private listeners: Listener[] = [];

  constructor() {
    this.init();
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
      default:
        return this.getFhenixSepoliaNetwork(); // Default to Fhenix Sepolia
    }
  }

  switchNetwork(networkId: NetworkId) {
    if (this.activeNetworkId === networkId) return;
    this.activeNetworkId = networkId;
    this.notifyListeners();
  }

  getActiveNetworkId(): NetworkId {
    return this.activeNetworkId;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }
}

export default NetworkProvider;