import SepoliaNetwork from "./Sepolia.js";
import MainnetNetwork from "./Mainnet.js";
import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

type Listener = () => void;

class NetworkProvider {
  private sepoliaNetwork?: SepoliaNetwork;
  private mainnetNetwork?: MainnetNetwork;

  private activeNetworkId: NetworkId = NetworkId.Ethereum_Sepolia; // Default to Sepolia
  private listeners: Listener[] = [];

  constructor() {
    this.init();
  }

  init() {
    if (!this.sepoliaNetwork) this.sepoliaNetwork = new SepoliaNetwork();
    if (!this.mainnetNetwork) this.mainnetNetwork = new MainnetNetwork();
  }

  getSepoliaNetwork(): SepoliaNetwork {
    if (!this.sepoliaNetwork) this.sepoliaNetwork = new SepoliaNetwork();
    return this.sepoliaNetwork;
  }

  getMainnetNetwork(): MainnetNetwork {
    if (!this.mainnetNetwork) this.mainnetNetwork = new MainnetNetwork();
    return this.mainnetNetwork;
  }

  getActiveNetwork(): Network {
    switch (this.activeNetworkId) {
      case NetworkId.Ethereum_Mainnet:
        return this.getMainnetNetwork();
      case NetworkId.Ethereum_Sepolia:
      default:
        return this.getSepoliaNetwork();
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