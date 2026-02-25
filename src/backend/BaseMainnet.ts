import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class BaseMainnetNetwork extends Network {
    constructor() {
        super(
            NetworkId.Base_Mainnet,
            "Base Mainnet",
            "https://base-mainnet.g.alchemy.com/v2/",
            (import.meta as any).env.VITE_ALCHEMY_BASEMAINNET_API_KEY
        );
    }
}
