import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class ArbitrumSepoliaNetwork extends Network {
    constructor() {
        super(
            NetworkId.Arbitrum_Sepolia,
            "Arbitrum Sepolia",
            "https://arb-sepolia.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_ARBSEPOLIA_API_KEY
        );
    }
}
