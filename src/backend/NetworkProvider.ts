// import { NetworkId } from "./Network.js";
import SepoliaNetwork from "./Sepolia.js";

class NetworkProvider {
  private sepoliaNetwork?: SepoliaNetwork;

  constructor() {
    this.sepoliaInit();
  }

  sepoliaInit() {
    if (this.sepoliaNetwork == undefined) {
      this.sepoliaNetwork = new SepoliaNetwork();
    }
  }

  getSepoliaNetwork(): SepoliaNetwork | undefined {
    return this.sepoliaNetwork;
  }
}

export default NetworkProvider;