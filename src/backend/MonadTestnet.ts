import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class MonadTestnetNetwork extends Network {
    constructor() {
        super(
            NetworkId.Monad_Testnet,
            "Monad Testnet",
            undefined,
            undefined
        );
        this.currency_symbol = "MON";
        this.rpc_url = "https://testnet-rpc.monad.xyz";
    }
}
