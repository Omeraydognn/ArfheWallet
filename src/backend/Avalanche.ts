import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class AvalancheNetwork extends Network {
    constructor() {
        super(
            NetworkId.Avalanche,
            "Avalanche C-Chain",
            "https://avax-mainnet.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_AVAX_API_KEY
        );
        this.currency_symbol = "AVAX";
    }
}
