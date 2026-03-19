import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class BNBChainNetwork extends Network {
    constructor() {
        super(
            NetworkId.BNB_Chain,
            "BNB Smart Chain",
            "https://bnb-mainnet.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_BNB_API_KEY
        );
        this.currency_symbol = "BNB";
    }
}
