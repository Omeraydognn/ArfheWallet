enum NetworkId {
  Unknown = -1,
  Ethereum_Mainnet = 1,
  Zama = 2,
  Fhenix = 3,
  Ethereum_Sepolia = 4,
  Ethereum_Holesky = 5,
}

type TokenBalance = {
  contractAddress: string;   // "ETH" for native
  tokenBalance: string;      // human-readable string
  isNative: boolean;         // true if ETH, false if ERC20
};

function WeiToEth(value: bigint): string {
  const WEI_PER_ETH = 10n ** 18n;
  const whole = value / WEI_PER_ETH;
  const fraction = value % WEI_PER_ETH;
  return `${whole}.${fraction.toString().padStart(18, "0")}`.replace(/\.?0+$/, "");
}

class Network {
  network_id: NetworkId;
  api_key?: string;
  rpc_url?: string;

  FETCH_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  constructor(network_id: NetworkId, baseUrl?: string) {
    this.network_id = network_id;

    this.api_key = import.meta.env.VITE_ALCHEMY_API_KEY ?? "";
    if (!this.api_key) {
      console.error("No API key found.");
      return;
    }
    if (baseUrl) {
      this.rpc_url = baseUrl + this.api_key;
    }
  }

  async call(method: string, params: any[]): Promise<any> {
    if (!this.rpc_url) {
      throw new Error("RPC URL not set");
    }

    const body = JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method,
      params,
    });

    const response = await fetch(this.rpc_url, {
      method: "POST",
      headers: this.FETCH_HEADERS,
      body,
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result;
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.call("eth_blockNumber", []);
    return parseInt(result, 16);
  }

  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    const result = await this.call("alchemy_getTokenBalances", [
      address,
      ["erc20", "NATIVE_TOKEN"],
    ]);

    return result.tokenBalances.map((t: any): TokenBalance => {
      if (t.contractAddress === "null") {
        // Native ETH
        return {
          contractAddress: "ETH",
          tokenBalance: WeiToEth(BigInt(t.tokenBalance)),
          isNative: true,
        };
      }

      // ERC20
      return {
        contractAddress: t.contractAddress,
        tokenBalance: BigInt(t.tokenBalance).toString(),
        isNative: false,
      };
    });
  }
}

export { Network, NetworkId, type TokenBalance };
