import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class LineaNetwork extends Network {
    constructor() {
        super(
            NetworkId.Linea,
            "Linea",
            "https://linea-mainnet.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_LINEA_API_KEY
        );
    }
}
