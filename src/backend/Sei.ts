import { Network } from "./Network.js";
import { NetworkId } from "./NetworkTypes.js";

export default class SeiNetwork extends Network {
    constructor() {
        super(
            NetworkId.Sei,
            "Sei",
            undefined,
            undefined
        );
        this.currency_symbol = "SEI";
        this.rpc_url = "https://evm-rpc.sei-apis.com";
    }
}
