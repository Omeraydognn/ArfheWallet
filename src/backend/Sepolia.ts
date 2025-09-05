import { Network, NetworkId } from "./Network.js";

const rpc_url_prefix = "https://eth-sepolia.g.alchemy.com/v2/"

export default class SepoliaNetwork extends Network {
  constructor() {
    super(
      NetworkId.Ethereum_Sepolia,
      "https://eth-sepolia.g.alchemy.com/v2/"
    );
  }
}