import { formatEther, parseUnits, TransactionRequest } from "ethers";
import Account from "./Account.js";
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

type TransactionHistory = {
  hash: string;              // Transaction hash
  from: string;              // Sender address
  to: string;                // Receiver address
  contractAddress: string;   // "ETH" for native, otherwise token contract
  value: string;             // Human-readable value (ETH or token amount)
  timestamp: string;         // ISO timestamp of the block
  isNative: boolean;         // true if native token (ETH), false if ERC20
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

  private formatTokenAmount(value: bigint, decimals: number): string {
    if (decimals < 0) decimals = 0;
    const base = 10n ** BigInt(decimals);

    const whole = value / base;
    const fraction = value % base;

    // Pad fraction to full decimals, then trim trailing zeros
    let fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");

    if (fractionStr.length === 0) {
      return whole.toString();
    }

    return `${whole}.${fractionStr}`;
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
            tokenBalance: this.formatTokenAmount(BigInt(t.tokenBalance), 18),
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
          tokenBalance: this.formatTokenAmount(
            BigInt(t.tokenBalance),
            tokenCacheObj.getToken(this.network_id, contract)?.decimals ?? 18
          ),
          isNative: false,
        };
      })
    );
  }

  async getHistory(address: string, tokenCacheObj: TokenCache | undefined): Promise<TransactionHistory[]> {
    if (!tokenCacheObj) {
      console.error("TokenCache not found. Returning empty...");
      return [];
    }

    const params = {
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: address,
      category: ["external", "erc20"],
    };

    const result = await this.call("alchemy_getAssetTransfers", [params]);

    return Promise.all(
      result.transfers.map(async (transfer: any): Promise<TransactionHistory> => {
        const isNative = !transfer.rawContract.address; // Native token if asset is null
        const contractAddress = isNative ? "ETH" : transfer.rawContract.address.toLowerCase();

        // Fetch token metadata for ERC20 tokens if not cached
        if (!isNative && !tokenCacheObj.hasToken(this.network_id, contractAddress)) {
          try {
            await this.getTokenMetadata(tokenCacheObj, contractAddress);
          } catch (err) {
            console.warn(`Failed to fetch metadata for ${contractAddress}:`, err);
          }
        }

        // Fetch block timestamp
        const blockData = await this.call("eth_getBlockByNumber", [transfer.blockNum, false]);
        const timestamp = new Date(parseInt(blockData.timestamp, 16) * 1000).toISOString();

        const decimals =
          isNative
            ? 18
            : tokenCacheObj.getToken(this.network_id, contractAddress)?.decimals ?? 18;

        const value = this.formatTokenAmount(
          BigInt(transfer.rawContract?.value || "0"),
          decimals
        );

        return {
          hash: transfer.hash,
          from: transfer.from.toLowerCase(),
          to: transfer.to.toLowerCase(),
          contractAddress,
          value,
          timestamp,
          isNative,
        };
      })
    );
  }

  async sendTransaction(
    account: Account,
    tx: {
      to: string;
      value?: string;         // in ETH (human readable)
      gasLimit?: bigint;      // optional
      gasPrice?: string;      // in gwei (human readable)
      data?: string;          // calldata (optional)
    }
  ): Promise<string> {
    if (!this.rpc_url) throw new Error("RPC URL not set");
    if (!account.ethers_wallet) throw new Error("Account is missing ethers_wallet");

    const wallet = account.ethers_wallet;

    // Nonce
    const nonceHex = await this.call("eth_getTransactionCount", [
      wallet.address,
      "pending",
    ]);
    const nonce = BigInt(nonceHex);

    // Gas price (fallback to eth_gasPrice if not provided)
    let gasPrice = tx.gasPrice
      ? parseUnits(tx.gasPrice, "gwei")
      : BigInt(await this.call("eth_gasPrice", []));

    // Value in wei
    const valueWei = tx.value ? parseUnits(tx.value, "ether") : 0n;

    const chainIdHex = await this.call("eth_chainId", []);
    const chainId = parseInt(chainIdHex, 16);

    // Construct transaction
    const txRequest: TransactionRequest = {
      to: tx.to,
      value: valueWei,
      gasLimit: tx.gasLimit ?? 21_000n,
      gasPrice,
      nonce: Number(nonce),
      data: tx.data ?? "0x",
      chainId,
    };

    // Sign and serialize
    const signedTx = await wallet.signTransaction(txRequest);

    // Broadcast
    const txHash = await this.call("eth_sendRawTransaction", [signedTx]);
    return txHash;
  }
}

export { Network, NetworkId, type TokenBalance, type TransactionHistory };
