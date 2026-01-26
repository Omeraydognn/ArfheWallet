import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

const DEMO_KEY = "demo";

export default class SepoliaNetwork extends Network {
  constructor() {
    super(
      NetworkId.Ethereum_Sepolia,
      "Sepolia",
      "https://eth-sepolia.g.alchemy.com/v2/",
      import.meta.env.VITE_ALCHEMY_SEPOLIA_API_KEY
    );
  }
}