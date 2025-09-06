import { formatEther } from "ethers";
import TokenCache, { TokenCacheItem } from "./TokenCache.js";

enum NetworkId {
  Unknown = -1,
  Ethereum_Mainnet = 1,
  Zama = 2,
  Fhenix = 3,
  Ethereum_Sepolia = 4,
  Ethereum_Hoodi = 5,
}

type TokenBalance = {
  contractAddress: string;   // "ETH" for native
  tokenBalance: string;      // human-readable string
  isNative: boolean;         // true if ETH, false if ERC20
};

function WeiToEth(value: bigint): string {
  /*
  const WEI_PER_ETH = 10n ** 18n;
  const whole = value / WEI_PER_ETH;
  const fraction = value % WEI_PER_ETH;
  return `${whole}.${fraction.toString().padStart(18, "0")}`.replace(/\.?0+$/, "");
  */

  return formatEther(value);
}

class Network {
  network_id: NetworkId;
  network_name: string;

  api_key?: string;
  rpc_url?: string;

  FETCH_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  constructor(network_id: NetworkId, network_name: string, baseUrl?: string) {
    this.network_id = network_id;
    this.network_name = network_name;

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

  async getTokenMetadata(tokenCacheObj: TokenCache, contractAddress: string): Promise<TokenCacheItem> {
    const metadata = await this.call("alchemy_getTokenMetadata", [contractAddress]);

    const item: TokenCacheItem = {
      name: metadata.name ?? "Unknown Token",
      symbol: metadata.symbol ?? "",
      decimals: metadata.decimals ?? 18,
      logoSrc: metadata.logo ?? "",
      contractAddress: contractAddress,
    };

    tokenCacheObj.setToken(this.network_id, item);
    return item;
  }

  async getTokenBalances(tokenCacheObj: TokenCache | undefined, address: string): Promise<TokenBalance[]> {
    if (!tokenCacheObj) {
      console.error("TokenCache not found. Returning empty...");
      return [];
    }

    const result = await this.call("alchemy_getTokenBalances", [
      address,
      ["erc20", "NATIVE_TOKEN"],
    ]);

    return Promise.all(
      result.tokenBalances.map(async (t: any): Promise<TokenBalance> => {
        if (t.contractAddress === "null") {
          // Native token (ETH, MATIC, etc.)
          const nativeItem: TokenCacheItem = {
            name: "Ethereum",
            symbol: "ETH",
            decimals: 18,
            logoSrc: "/logos/eth.png", // you could customize per network
            contractAddress: "ETH",
          };

          if (!tokenCacheObj.hasToken(this.network_id, "ETH")) {
            tokenCacheObj.setToken(this.network_id, nativeItem);
          }

          return {
            contractAddress: "ETH",
            tokenBalance: WeiToEth(BigInt(t.tokenBalance)),
            isNative: true,
          };
        }

        const contract = t.contractAddress.toLowerCase();

        // Check cache; fetch metadata if missing
        if (!tokenCacheObj.hasToken(this.network_id, contract)) {
          try {
            await this.getTokenMetadata(tokenCacheObj, contract);
          } catch (err) {
            console.warn(`Failed to fetch metadata for ${contract}:`, err);
          }
        }

        return {
          contractAddress: contract,
          tokenBalance: BigInt(t.tokenBalance).toString(),
          isNative: false,
        };
      })
    );
  }
}

export { Network, NetworkId, type TokenBalance };
