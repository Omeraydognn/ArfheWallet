import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class ArbitrumOneNetwork extends Network {
    constructor() {
        super(
            NetworkId.Arbitrum_One,
            "Arbitrum One",
            "https://arb-mainnet.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_ARBMAINNET_API_KEY
        );
    }
}
