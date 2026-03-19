import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class AvalancheFujiNetwork extends Network {
    constructor() {
        super(
            NetworkId.Avalanche_Fuji,
            "Avalanche Fuji",
            "https://avax-fuji.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_AVAX_FUJI_API_KEY
        );
        this.currency_symbol = "AVAX";
    }
}
