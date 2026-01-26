import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class MainnetNetwork extends Network {
    constructor() {
        super(
            NetworkId.Ethereum_Mainnet,
            "Ethereum Mainnet",
            "https://eth-mainnet.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_MAINNET_API_KEY
        );
    }
}
