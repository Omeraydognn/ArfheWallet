import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class PolygonNetwork extends Network {
    constructor() {
        super(
            NetworkId.Polygon,
            "Polygon",
            "https://polygon-mainnet.g.alchemy.com/v2/",
            import.meta.env.VITE_ALCHEMY_POLYGON_API_KEY
        );
        this.currency_symbol = "POL";
    }
}
