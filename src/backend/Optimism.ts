import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class OptimismNetwork extends Network {
    constructor() {
        super(
            NetworkId.Optimism,
            "Optimism",
            "https://opt-mainnet.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_OPT_API_KEY
        );
    }
}
