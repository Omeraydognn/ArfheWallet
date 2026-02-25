import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class BaseSepoliaNetwork extends Network {
    constructor() {
        super(
            NetworkId.Base_Sepolia,
            "Base Sepolia",
            "https://base-sepolia.g.alchemy.com/v2/",
            (import.meta as any).env.VITE_ALCHEMY_BASESEPOLIA_API_KEY
        );
    }
}
