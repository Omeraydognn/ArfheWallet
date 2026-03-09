import { formatEther, parseUnits, TransactionRequest } from "ethers";
import { Alchemy, Network as AlchemyNetwork, SortingOrder, AssetTransfersCategory } from "alchemy-sdk";
import Account from "./Account.js";
import TokenCache, { TokenCacheItem } from "./TokenCache.js";
import type NFTCache from "./NFTCache.js";
import type { NFTCacheItem } from "./NFTCache.js";

import { NetworkId, TokenBalance, TransactionHistory, PendingTransaction, CustomNetworkConfig } from "./NetworkTypes.js";
import { ExplorerService } from "./ExplorerService.js";
import { withRetry, fetchWithTimeout, classifyError, NetworkErrorType } from "./NetworkErrorHandler.js";
import type { RetryOptions } from "./NetworkErrorHandler.js";

class Network {
  network_id: NetworkId;
  network_name: string;

  api_key?: string;
  rpc_url?: string;
  explorer_url?: string;
  currency_symbol: string = "ETH";
  alchemy?: Alchemy;
  explorerService?: ExplorerService;
  isCustom: boolean = false;

  /** In-memory store of pending (unconfirmed) transactions */
  pendingTransactions: Map<string, PendingTransaction> = new Map();

  FETCH_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  constructor(network_id: NetworkId, network_name: string, baseUrl?: string, explicitApiKey?: string) {
    this.network_id = network_id;
    this.network_name = network_name;

    let rawKey = explicitApiKey || import.meta.env.VITE_ALCHEMY_API_KEY || "";

    if (rawKey.startsWith("http")) {
      const parts = rawKey.split("/");
      const potentialKey = parts[parts.length - 1];
      if (potentialKey && potentialKey.length > 20) {
        rawKey = potentialKey;
        this.api_key = rawKey;
        this.rpc_url = explicitApiKey;
      } else {
        this.rpc_url = rawKey;
        this.api_key = "CUSTOM_URL" as string;
      }
    } else {
      this.api_key = rawKey;
      if (baseUrl && this.api_key) {
        this.rpc_url = baseUrl + this.api_key;
      }
    }

    // Alchemy only for Ethereum networks, not Fhenix
    if (this.isAlchemyConfigured() && network_id !== NetworkId.Fhenix_Sepolia) {
      let sdkNetwork = AlchemyNetwork.ETH_MAINNET;
      switch (network_id) {
        case NetworkId.Ethereum_Sepolia:
          sdkNetwork = AlchemyNetwork.ETH_SEPOLIA;
          break;
        case NetworkId.Ethereum_Mainnet:
          sdkNetwork = AlchemyNetwork.ETH_MAINNET;
          break;
        case NetworkId.Arbitrum_One:
          sdkNetwork = AlchemyNetwork.ARB_MAINNET;
          break;
        case NetworkId.Arbitrum_Sepolia:
          sdkNetwork = AlchemyNetwork.ARB_SEPOLIA;
          break;
        case NetworkId.Base_Mainnet:
          sdkNetwork = AlchemyNetwork.BASE_MAINNET;
          break;
        case NetworkId.Base_Sepolia:
          sdkNetwork = AlchemyNetwork.BASE_SEPOLIA;
          break;
      }

      const config = {
        apiKey: this.api_key,
        network: sdkNetwork,
      };
      this.alchemy = new Alchemy(config);
      this.explorerService = new ExplorerService(this.alchemy);
    }
    if (!this.rpc_url) {
      if (!this.api_key || this.api_key === "CUSTOM_URL") {
        switch (network_id) {
          case NetworkId.Ethereum_Mainnet:
            this.rpc_url = "https://ethereum.publicnode.com";
            break;
          case NetworkId.Ethereum_Sepolia:
            this.rpc_url = "https://ethereum-sepolia.publicnode.com";
            break;
          case NetworkId.Fhenix_Sepolia:
            this.rpc_url = "https://api.helium.fhenix.zone";
            break;
          case NetworkId.Arbitrum_One:
            this.rpc_url = "https://arbitrum.publicnode.com";
            break;
          case NetworkId.Arbitrum_Sepolia:
            this.rpc_url = "https://arbitrum-sepolia.publicnode.com";
            break;
          case NetworkId.Base_Mainnet:
            this.rpc_url = "https://base.publicnode.com";
            break;
          case NetworkId.Base_Sepolia:
            this.rpc_url = "https://base-sepolia.publicnode.com";
            break;
          default:
            this.rpc_url = "";
        }
      }
    }
  }

  /** Create a Network instance from a user-defined custom network config */
  static fromCustomConfig(config: CustomNetworkConfig): Network {
    // Pass NO api key / base URL → prevents Alchemy SDK from being created
    const net = new Network(
      config.chainId as NetworkId,
      config.networkName,
      undefined,
      undefined
    );
    // Override: set custom RPC directly, mark as non-Alchemy
    net.rpc_url = config.rpcUrl;
    net.api_key = "CUSTOM_URL";
    net.alchemy = undefined;
    net.explorerService = undefined;
    net.explorer_url = config.explorerUrl.replace(/\/+$/, ""); // strip trailing slash
    net.currency_symbol = config.currencySymbol;
    net.isCustom = true;
    return net;
  }

  isAlchemyConfigured(): boolean {
    return !!this.api_key && this.api_key !== "CUSTOM_URL";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async call(method: string, params: unknown[]): Promise<any> {
    if (!this.rpc_url) {
      throw new Error("RPC URL not set");
    }

    const body = JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method,
      params,
    });

    const rpcUrl = this.rpc_url;
    const headers = this.FETCH_HEADERS;

    return withRetry(
      async () => {
        const response = await fetchWithTimeout(rpcUrl, {
          method: "POST",
          headers,
          body,
        }, 15_000);

        const json = await response.json();
        if (json.error) {
          throw new Error(json.error.message);
        }

        return json.result;
      },
      {
        maxRetries: 2,
        initialDelayMs: 800,
        onRetry: (attempt, max, err) => {
        },
        shouldRetry: (err) => {
          // Don't retry RPC-level errors (revert, invalid method)
          if (err.type === NetworkErrorType.RpcError || err.type === NetworkErrorType.UserError) return false;
          return err.retryable;
        },
      }
    );
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.call("eth_blockNumber", []);
    return parseInt(result, 16);
  }

  async getTokenMetadata(tokenCacheObj: TokenCache, contractAddress: string): Promise<TokenCacheItem> {
    try {
      if (this.alchemy) {
        try {
          const metadata = await this.alchemy.core.getTokenMetadata(contractAddress);
          if (metadata && (metadata.name || metadata.symbol)) {
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
        } catch (e) {
        }
      }

      if (this.isAlchemyConfigured()) {
        const metadata = await this.call("alchemy_getTokenMetadata", [contractAddress]);
        if (metadata && (metadata.name || metadata.symbol)) {
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
      }
    } catch (e) {
    }

    // Direct RPC Fallback for unindexed testnet tokens (Crucial for Custom Imports)
    const ethers = await import("ethers");
    const iface = new ethers.Interface([
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)"
    ]);

    let name = "Unknown Token";
    let symbol = "???";
    let decimals = 18;

    try {
      const nameData = await this.call("eth_call", [{ to: contractAddress, data: iface.encodeFunctionData("name") }, "latest"]);
      if (nameData && nameData !== "0x") name = iface.decodeFunctionResult("name", nameData)[0];
    } catch (e) { }

    try {
      const symbolData = await this.call("eth_call", [{ to: contractAddress, data: iface.encodeFunctionData("symbol") }, "latest"]);
      if (symbolData && symbolData !== "0x") symbol = iface.decodeFunctionResult("symbol", symbolData)[0];
    } catch (e) { }

    try {
      const decData = await this.call("eth_call", [{ to: contractAddress, data: iface.encodeFunctionData("decimals") }, "latest"]);
      if (decData && decData !== "0x") decimals = Number(iface.decodeFunctionResult("decimals", decData)[0]);
    } catch (e) { }

    const item: TokenCacheItem = {
      name,
      symbol,
      decimals,
      logoSrc: "",
      contractAddress
    };

    tokenCacheObj.setToken(this.network_id, item);
    return item;
  }

  async getNftMetadata(nftCacheObj: NFTCache | null | undefined, contractAddress: string): Promise<NFTCacheItem> {
    const ethers = await import("ethers");
    const iface = new ethers.Interface([
      "function name() view returns (string)",
      "function symbol() view returns (string)"
    ]);

    let name = "Unknown NFT";
    let symbol = "NFT";

    try {
      const nameData = await this.call("eth_call", [{ to: contractAddress, data: iface.encodeFunctionData("name") }, "latest"]);
      if (nameData && nameData !== "0x") name = iface.decodeFunctionResult("name", nameData)[0];
    } catch (e) { }

    try {
      const symbolData = await this.call("eth_call", [{ to: contractAddress, data: iface.encodeFunctionData("symbol") }, "latest"]);
      if (symbolData && symbolData !== "0x") symbol = iface.decodeFunctionResult("symbol", symbolData)[0];
    } catch (e) { }

    const item = {
      name,
      symbol,
      logoSrc: "",
      contractAddress
    };

    if (nftCacheObj) {
      nftCacheObj.setNFT(this.network_id, item);
    }
    return item;
  }

  async getNftBalance(contractAddress: string, userAddress: string): Promise<string> {
    try {
      const ethers = await import("ethers");
      const iface = new ethers.Interface([
        "function balanceOf(address owner) view returns (uint256)"
      ]);

      const data = iface.encodeFunctionData("balanceOf", [userAddress]);
      const result = await this.call("eth_call", [{
        to: contractAddress,
        data: data
      }, "latest"]);

      if (result && result !== "0x") {
        return BigInt(result).toString();
      }
    } catch (e) {
    }
    return "0";
  }

  private formatTokenAmount(value: bigint, decimals: number): string {
    if (decimals < 0) decimals = 0;
    const base = 10n ** BigInt(decimals);

    const whole = value / base;
    const fraction = value % base;

    let fractionStr = fraction.toString().padStart(Number(decimals), "0").replace(/0+$/, "");

    if (fractionStr.length === 0) {
      return whole.toString();
    }

    return `${whole}.${fractionStr}`;
  }


  async getBalance(address: string): Promise<string> {
    if (this.alchemy) {
      try {
        const big = await withRetry(
          () => this.alchemy!.core.getBalance(address),
          { maxRetries: 2, initialDelayMs: 500 }
        );
        return big.toString();
      } catch (e) {
        // Fallback to RPC
      }
    }
    const result = await this.call("eth_getBalance", [address, "latest"]);
    return BigInt(result).toString();
  }

  async getTokenBalances(tokenCacheObj: TokenCache | undefined, address: string): Promise<TokenBalance[]> {
    if (!tokenCacheObj) throw new Error("TokenCache is not initialized");

    let nativeBalance = "0";
    try {
      nativeBalance = await this.getBalance(address);
    } catch (e) {
    }

    let tokenBalancesRaw: Array<{ contractAddress: string; tokenBalance: string | null }> = [];

    if (this.alchemy) {
      try {
        const response = await withRetry(
          () => this.alchemy!.core.getTokenBalances(address),
          { maxRetries: 2, initialDelayMs: 800 }
        );
        tokenBalancesRaw = response.tokenBalances;
      } catch (e) {
        // Don't throw — fall through to manual/cache-based approach
      }
    } else if (this.isAlchemyConfigured()) {
      try {
        const result = await this.call("alchemy_getTokenBalances", [address, "erc20"]);
        tokenBalancesRaw = result.tokenBalances;
      } catch (e) {
      }
    }

    // Custom networks: discover ERC20 tokens via Transfer event logs
    // Scan recent blocks for incoming ERC20 Transfer(from, to, value) events
    if (!this.alchemy && !this.isAlchemyConfigured()) {
      try {
        const currentBlock = await this.getBlockNumber();
        // Scan last ~5000 blocks (adjust based on block time)
        const fromBlock = Math.max(0, currentBlock - 5000);
        // ERC20 Transfer topic: keccak256("Transfer(address,address,uint256)")
        const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        // Pad address to 32 bytes for topic filter (to = recipient)
        const paddedAddress = "0x000000000000000000000000" + address.toLowerCase().replace("0x", "");

        const logs = await this.call("eth_getLogs", [{
          fromBlock: "0x" + fromBlock.toString(16),
          toBlock: "latest",
          topics: [TRANSFER_TOPIC, null, paddedAddress]  // Transfer(*, toAddress, *)
        }]);

        if (Array.isArray(logs)) {
          const discoveredContracts = new Set<string>();
          for (const log of logs) {
            if (log.address) {
              discoveredContracts.add(log.address.toLowerCase());
            }
          }

          // Query balanceOf for each discovered contract
          const balanceOfSig = "0x70a08231000000000000000000000000" + address.toLowerCase().replace("0x", "");
          for (const contractAddr of discoveredContracts) {
            try {
              const result = await this.call("eth_call", [{
                to: contractAddr,
                data: balanceOfSig
              }, "latest"]);

              if (result && result !== "0x" && BigInt(result) > 0n) {
                tokenBalancesRaw.push({
                  contractAddress: contractAddr,
                  tokenBalance: BigInt(result).toString()
                });
              }
            } catch (e) {
              // Not a valid ERC20 or call failed — skip
            }
          }
        }
      } catch (e) {
      }
    }

    const activeTokensRaw = [...tokenBalancesRaw];

    // Some custom testnet tokens or user-added tokens might be missed by Alchemy's indexer.
    // Ensure all known tokens in the local cache are queried directly if not natively returned.
    const rawSet = new Set(activeTokensRaw.map(t => (t.contractAddress || "").toLowerCase()));
    const cachedTokens = tokenCacheObj.getAllTokens(this.network_id) || [];

    for (const cached of cachedTokens) {
      if (cached.contractAddress === "ETH") continue;
      const lowerAddr = cached.contractAddress.toLowerCase();

      if (!rawSet.has(lowerAddr)) {
        try {
          // Explicitly query ERC20 balanceOf(address) signature: 0x70a08231
          const data = "0x70a08231000000000000000000000000" + address.toLowerCase().replace("0x", "");
          const result = await this.call("eth_call", [{
            to: cached.contractAddress,
            data: data
          }, "latest"]);

          if (result && result !== "0x") {
            activeTokensRaw.push({
              contractAddress: cached.contractAddress,
              tokenBalance: BigInt(result).toString()
            });
          }
        } catch (e) {
          // Token query failed or invalid contract
        }
      }
    }

    const activeTokens = activeTokensRaw.filter(t => {
      try {
        const bal = BigInt(t.tokenBalance ?? 0);
        // Retain tokens that have positive balances OR are specifically cached by the user
        return bal > 0n || tokenCacheObj.hasToken(this.network_id, (t.contractAddress || "").toLowerCase());
      } catch {
        return false;
      }
    });

    // ── Alchemy Spam Classification ──
    // Only run on mainnet networks (testnet contracts are not in Alchemy's spam DB)
    // Uses Alchemy's isSpamContract API — checks their curated spam/scam database
    const MAINNET_IDS = [NetworkId.Ethereum_Mainnet, NetworkId.Arbitrum_One, NetworkId.Base_Mainnet];
    const isMainnet = MAINNET_IDS.includes(this.network_id);
    const alchemySpamResults = new Map<string, boolean>();

    if (this.alchemy && isMainnet && activeTokens.length > 0) {
      try {
        // Skip tokens that are already in the user's cache (trusted / manually imported)
        const tokensToCheck = activeTokens.filter((t) => {
          const addr = (t.contractAddress || "").toLowerCase();
          return !tokenCacheObj.hasToken(this.network_id, addr);
        });

        if (tokensToCheck.length > 0) {
          const spamChecks = await Promise.all(
            tokensToCheck.map(async (t) => {
              try {
                const result = await this.alchemy!.nft.isSpamContract(t.contractAddress);
                return { address: t.contractAddress, isSpam: result };
              } catch {
                return { address: t.contractAddress, isSpam: false };
              }
            })
          );
          const alchemySpamMap = new Map(spamChecks.map(s => [s.address.toLowerCase(), s.isSpam]));
          for (const [addr, isSpam] of alchemySpamMap) {
            alchemySpamResults.set(addr, !!isSpam);
          }
          const flagged = spamChecks.filter(s => s.isSpam);
          if (flagged.length > 0) {
          }
        }
      } catch (e) {
      }
    }

    const processedTokens = await Promise.all(
      activeTokens.map(async (t): Promise<TokenBalance> => {
        const contract = t.contractAddress.toLowerCase();
        let decimals = 18;

        if (tokenCacheObj.hasToken(this.network_id, contract)) {
          const cached = tokenCacheObj.getToken(this.network_id, contract)!;
          decimals = cached.decimals ?? 18;
        } else {
          try {
            const metadata = await this.getTokenMetadata(tokenCacheObj, contract);
            decimals = metadata.decimals;
          } catch (err) {
          }
        }

        return {
          contractAddress: contract,
          tokenBalance: this.formatTokenAmount(BigInt(t.tokenBalance ?? 0), decimals),
          isNative: false,
          isAlchemySpam: alchemySpamResults.get(contract) ?? false,
        };
      })
    );

    const nativeSymbol = this.currency_symbol || "ETH";
    const nativeItem: TokenCacheItem = {
      name: nativeSymbol === "ETH" ? "Ethereum" : nativeSymbol,
      symbol: nativeSymbol,
      decimals: 18,
      logoSrc: "",  // Logo resolved dynamically by getTokenLogoUrl via symbol lookup
      contractAddress: "ETH",
    };
    // Always update native token cache to reflect current network's currency
    tokenCacheObj.setToken(this.network_id, nativeItem);

    const nativeBalanceData: TokenBalance = {
      contractAddress: "ETH",
      tokenBalance: this.formatTokenAmount(BigInt(nativeBalance), 18),
      isNative: true,
    };

    return [nativeBalanceData, ...processedTokens];
  }

  /**
   * Get balance for a single ERC20 token
   */
  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<string> {
    try {
      const ethers = await import("ethers");
      const ERC20_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      const provider = new ethers.JsonRpcProvider(this.rpc_url);
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals()
      ]);

      return this.formatTokenAmount(balance, decimals);
    } catch (error) {
      return "0";
    }
  }

  async getTokenPrices(contractAddresses: string[]): Promise<{ [key: string]: number }> {
    try {
      const prices: { [key: string]: number } = {};

      // Known identifiers for mainnet pegging (CoinGecko IDs)
      const mappedIds = new Set<string>();
      const addressesToFetchFromCG: string[] = [];

      // eToken addresses (ignore fetching)
      const eTokenAddresses = [
        "0xfff9976742d46cc05630d1f6ebab18b2324d6b14", // eETH (official)
        "0x2035f9228e160243be8e07973715c929845e445e", // eUSDC (official)
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", // Old/test eETH variant
      ].map(a => a.toLowerCase());

      // Define lists of testnet and FHE token variants mapped to real assets
      const ethRelated = [
        "eth",
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        (import.meta.env.VITE_SEPOLIA_WETH_ADDRESS || "").toLowerCase(),
        (import.meta.env.VITE_ARB_SEPOLIA_WETH_ADDRESS || "").toLowerCase(),
        (import.meta.env.VITE_BASE_SEPOLIA_WETH_ADDRESS || "").toLowerCase(),
        (import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase(), // cETH Sepolia
        (import.meta.env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase(), // cETH Arb
        (import.meta.env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase(), // cETH Base
      ].filter(Boolean);

      const usdcRelated = [
        "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", // Sepolia USDC
        (import.meta.env.VITE_ARB_SEPOLIA_USDC_ADDRESS || "").toLowerCase(),
        (import.meta.env.VITE_BASE_SEPOLIA_USDC_ADDRESS || "").toLowerCase(),
        (import.meta.env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase(), // cUSDC Sepolia
        (import.meta.env.VITE_ARB_WRAPPED_USDC_ADDRESS || "").toLowerCase(), // cUSDC Arb
        (import.meta.env.VITE_BASE_WRAPPED_USDC_ADDRESS || "").toLowerCase(), // cUSDC Base
      ].filter(Boolean);

      const chainlinkRelated = [
        "0x779877a7b0d9e8603169ddbd7836e478b4624789" // Chainlink Sepolia
      ].filter(Boolean);

      // Map incoming addresses to CoinGecko IDs
      for (const rawAddr of contractAddresses) {
        const addr = rawAddr.toLowerCase();

        if (eTokenAddresses.includes(addr)) continue;

        if (ethRelated.includes(addr)) {
          mappedIds.add('ethereum');
        } else if (usdcRelated.includes(addr)) {
          mappedIds.add('usd-coin');
        } else if (chainlinkRelated.includes(addr)) {
          mappedIds.add('chainlink');
        } else {
          // If not mapped, only query standard contract addresses on mainnet
          if (this.network_id === NetworkId.Ethereum_Mainnet) {
            addressesToFetchFromCG.push(addr);
          }
        }
      }

      // Fetch pegged prices for known assets
      if (mappedIds.size > 0) {
        try {
          const idsParam = Array.from(mappedIds).join(',');
          const res = await fetchWithTimeout(`/api/coingecko/simple/price?ids=${idsParam}&vs_currencies=usd`, {}, 10_000);
          const json = await res.json();

          // Distribute the pegged prices back to all requesting testnet/FHE addresses
          for (const rawAddr of contractAddresses) {
            const addr = rawAddr.toLowerCase();
            if (ethRelated.includes(addr) && json.ethereum?.usd) {
              prices[addr] = json.ethereum.usd;
              if (addr === "eth") prices["ETH"] = json.ethereum.usd;
            } else if (usdcRelated.includes(addr) && json['usd-coin']?.usd) {
              prices[addr] = json['usd-coin'].usd;
            } else if (chainlinkRelated.includes(addr) && json.chainlink?.usd) {
              prices[addr] = json.chainlink.usd;
            }
          }
        } catch (e) {
        }
      }

      // Fetch random mainnet tokens using original contract address endpoint
      if (addressesToFetchFromCG.length > 0) {
        try {
          const platform = "ethereum";
          const addrStr = addressesToFetchFromCG.join(",");
          const url = `/api/coingecko/simple/token_price/${platform}?contract_addresses=${addrStr}&vs_currencies=usd`;
          const res = await fetchWithTimeout(url, {}, 10_000);
          const json = await res.json();

          for (const [addr, priceData] of Object.entries(json)) {
            const pd = priceData as { usd?: number };
            if (pd.usd) {
              prices[addr.toLowerCase()] = pd.usd;
            }
          }
        } catch (e) {
        }
      }

      return prices;

    } catch (err) {
      // Return empty object so flow continues without crashing
      return {};
    }
  }

  async getHistory(address: string, tokenCacheObj: TokenCache | undefined, toBlock: string = "latest"): Promise<{ history: TransactionHistory[], nextBlock?: string }> {
    if (!tokenCacheObj) return { history: [] };
    if (!this.alchemy && !this.isAlchemyConfigured()) {
      return { history: [] };
    }

    try {
      const category: AssetTransfersCategory[] = [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20];
      // Most L2s (Arbitrum, Base) do not support the "internal" category for getAssetTransfers on standard Alchemy tiers
      if (this.network_id === NetworkId.Ethereum_Mainnet || this.network_id === NetworkId.Ethereum_Sepolia) {
        category.push(AssetTransfersCategory.INTERNAL);
      }

      const optionsBase = {
        fromBlock: "0x0",
        toBlock: toBlock,
        category: category,
        withMetadata: true as const,
        excludeZeroValue: false,
        maxCount: 100,
        order: SortingOrder.DESCENDING
      };

      const CETH_SEP = (import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
      const CUSDC_SEP = (import.meta.env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
      const CETH_ARB = (import.meta.env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase();
      const CUSDC_ARB = (import.meta.env.VITE_ARB_WRAPPED_USDC_ADDRESS || "").toLowerCase();
      const CETH_BASE = (import.meta.env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
      const CUSDC_BASE = (import.meta.env.VITE_BASE_WRAPPED_USDC_ADDRESS || "").toLowerCase();

      const promises: Promise<unknown>[] = [];

      // 1. Alchemy Fetches (Sent & Received normal transfers)
      if (this.alchemy) {
        promises.push(this.alchemy.core.getAssetTransfers({ ...optionsBase, fromAddress: address }).catch(e => { return { transfers: [] }; }));
        promises.push(this.alchemy.core.getAssetTransfers({ ...optionsBase, toAddress: address }).catch(e => { return { transfers: [] }; }));
      } else {
        // Fallback to raw call if SDK isn't happy but URL works
        promises.push(this.call("alchemy_getAssetTransfers", [{ ...optionsBase, fromAddress: address }]).catch(e => { return { transfers: [] }; }));
        promises.push(this.call("alchemy_getAssetTransfers", [{ ...optionsBase, toAddress: address }]).catch(e => { return { transfers: [] }; }));
      }

      // 2. Direct eth_getLogs for incoming FHE ConfidentialTransfers
      const isFheNetwork = this.network_id === NetworkId.Ethereum_Sepolia || this.network_id === NetworkId.Arbitrum_Sepolia || this.network_id === NetworkId.Base_Sepolia;
      if (isFheNetwork) {
        const ceth = this.network_id === NetworkId.Ethereum_Sepolia ? CETH_SEP : this.network_id === NetworkId.Arbitrum_Sepolia ? CETH_ARB : CETH_BASE;
        const cusdc = this.network_id === NetworkId.Ethereum_Sepolia ? CUSDC_SEP : this.network_id === NetworkId.Arbitrum_Sepolia ? CUSDC_ARB : CUSDC_BASE;
        const fheContracts = [ceth, cusdc].filter(Boolean);

        if (fheContracts.length > 0) {
          promises.push((async () => {
            try {
              const { id, zeroPadValue } = await import("ethers");
              const transferTopic = id("ConfidentialTransfer(address,address)");
              const paddedAddress = zeroPadValue(address, 32);

              const latestBlockHex = toBlock === "latest" ? await this.call("eth_blockNumber", []) : toBlock;
              let currentBlock = parseInt(latestBlockHex, 16);
              // Fetch at most the last 100 blocks, in 10-block chunks
              const targetOldestBlock = Math.max(0, currentBlock - 100);
              let allIncomingLogs: Array<{ blockNumber: string; transactionHash: string; address: string; topics: string[] }> = [];

              while (currentBlock > targetOldestBlock && allIncomingLogs.length < 100) {
                const chunkStart = Math.max(targetOldestBlock, currentBlock - 9);
                const fromHex = "0x" + chunkStart.toString(16);
                const toHex = "0x" + currentBlock.toString(16);

                try {
                  const chunkLogs = await this.call("eth_getLogs", [{
                    fromBlock: fromHex,
                    toBlock: toHex,
                    address: fheContracts,
                    topics: [transferTopic, null, paddedAddress]
                  }]);

                  if (chunkLogs && chunkLogs.length > 0) {
                    allIncomingLogs = [...allIncomingLogs, ...chunkLogs];
                  }
                } catch (chunkErr) {
                  // If a chunk fails, we just stop fetching older logs to prevent spam and return what we have
                  break;
                }

                currentBlock = chunkStart - 1;
              }

              return { incomingFheLogs: allIncomingLogs.slice(-100) };
            } catch (e) {
              return { incomingFheLogs: [] };
            }
          })());
        }
      }

      // Wait for all data
      const results = await Promise.all(promises);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Alchemy SDK response shapes vary
      const sentRes = results[0] as { transfers?: any[] };
      const receivedRes = results[1] as { transfers?: any[] };
      const fheLogsRes = results.length > 2
        ? (results[2] as { incomingFheLogs?: any[] })
        : { incomingFheLogs: [] as any[] };

      let allTransfers = [
        ...(sentRes.transfers || []),
        ...(receivedRes.transfers || [])
      ];

      // Format Alchemy Transfers
      const history: TransactionHistory[] = [];
      let explorerBase = this.explorer_url || "https://etherscan.io";
      if (!this.explorer_url) {
        if (this.network_id === NetworkId.Ethereum_Sepolia) explorerBase = "https://sepolia.etherscan.io";
        else if (this.network_id === NetworkId.Arbitrum_One) explorerBase = "https://arbiscan.io";
        else if (this.network_id === NetworkId.Arbitrum_Sepolia) explorerBase = "https://sepolia.arbiscan.io";
        else if (this.network_id === NetworkId.Base_Mainnet) explorerBase = "https://basescan.org";
        else if (this.network_id === NetworkId.Base_Sepolia) explorerBase = "https://sepolia.basescan.org";
      }

      // Known Uniswap V3 SwapRouter addresses (for swap detection in history)
      const SWAP_ROUTERS = new Set([
        "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap V3 SwapRouter02 Ethereum Mainnet & Arbitrum
        "0x2626664c2603336e57b271c5c0b26f421741e481", // Uniswap V3 SwapRouter02 Base
        "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e", // Uniswap V3 SwapRouter02 Sepolia
        "0x101f443b4d1b059569d643917553c771e1b9663e", // Uniswap V3 SwapRouter02 Arb Sepolia
      ]);
      // Known WETH addresses (for wrap/unwrap detection)
      const WETH_ADDRESSES = new Set([
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH Mainnet
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH Arbitrum
        "0x4200000000000000000000000000000000000006", // WETH Base
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", // WETH Sepolia
        "0x980b62da83eff3d4576c647993b0c1d7faf17c73", // WETH Arb Sepolia
      ]);

      for (const tx of allTransfers) {
        const isNative = (tx.category === "external" || tx.category === "internal");

        // CRITICAL FIX: If external, the contract address shouldn't be hardcoded to "ETH", it should be where the tx was sent to (tx.to)!
        let contractAddress = tx.rawContract?.address?.toLowerCase();
        if (!contractAddress) {
          contractAddress = isNative ? (tx.to?.toLowerCase() ?? "ETH") : "ETH";
        }

        if (!isNative && contractAddress !== "eth" && !tokenCacheObj.hasToken(this.network_id, contractAddress)) {
          const basicItem: TokenCacheItem = {
            name: tx.asset || "Unknown",
            symbol: tx.asset || "???",
            decimals: 18,
            logoSrc: "",
            contractAddress
          };
        }

        const isShielded = [CETH_SEP, CUSDC_SEP, CETH_ARB, CUSDC_ARB].includes(contractAddress) && contractAddress !== "";
        const isWrapOrUnwrap = isShielded && tx.value && tx.value > 0;

        const finalValue = isShielded && (!tx.value || tx.value === 0 || tx.value?.toString() === "0")
          ? "Encrypted"
          : tx.value?.toString() || "0";

        let methodLabel = "Transfer";
        if (isShielded) {
          if (tx.category === "external" && tx.value > 0) methodLabel = "Wrap";
          else if (tx.category === "internal" && tx.value > 0) methodLabel = "Unwrap";
          else methodLabel = "Shield Transfer";
        } else if (tx.to && SWAP_ROUTERS.has(tx.to.toLowerCase())) {
          methodLabel = "Swap";
        } else if (tx.to && WETH_ADDRESSES.has(tx.to.toLowerCase()) && tx.category === "external") {
          methodLabel = "Wrap";
        } else if (tx.from && WETH_ADDRESSES.has(tx.from.toLowerCase()) && tx.category === "internal") {
          methodLabel = "Unwrap";
        } else if (!isNative && tx.category !== "erc20") {
          methodLabel = "Contract Call";
        }

        history.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to || "",
          contractAddress: contractAddress,
          value: finalValue,
          timestamp: tx.metadata?.blockTimestamp || new Date().toISOString(),
          blockNum: (tx as Record<string, unknown>).blockNum as string || "0x0",
          isNative: isNative,
          status: "Success",
          explorerUrl: `${explorerBase}/tx/${tx.hash}`,
          isShielded: isShielded,
          methodLabel: methodLabel
        });
      }

      // Process FHE Logs (Incoming ConfidentialTransfers missing from Alchemy)
      if (fheLogsRes && fheLogsRes.incomingFheLogs && fheLogsRes.incomingFheLogs.length > 0) {
        for (const log of fheLogsRes.incomingFheLogs) {
          // Avoid duplicates (if user sent to themselves, Alchemy external caught it)
          if (history.find(h => h.hash === log.transactionHash)) continue;

          // Fetch Block for timestamp
          let timestamp = new Date().toISOString();
          try {
            const block = await this.call("eth_getBlockByNumber", [log.blockNumber, false]);
            if (block && block.timestamp) {
              const epoch = parseInt(block.timestamp, 16);
              timestamp = new Date(epoch * 1000).toISOString();
            }
          } catch (e) { }

          // Topic 1 is the sender
          const fromTopic = log.topics[1];
          const fromAddr = fromTopic ? "0x" + fromTopic.slice(26) : "Unknown";

          history.push({
            hash: log.transactionHash,
            from: fromAddr,
            to: address,
            contractAddress: log.address.toLowerCase(),
            value: "Encrypted",
            timestamp: timestamp,
            blockNum: log.blockNumber || "0x0",
            isNative: false,
            status: "Success",
            explorerUrl: `${explorerBase}/tx/${log.transactionHash}`,
            isShielded: true,
            methodLabel: "Shield Transfer"
          });
        }
      }

      // Sort combined history
      history.sort((a, b) => {
        const tA = a.timestamp;
        const tB = b.timestamp;
        return tA < tB ? 1 : tA > tB ? -1 : 0;
      });

      // Squeeze unique hashes and limit
      const uniqueObj: Record<string, boolean> = {};
      const uniqueHistory: TransactionHistory[] = [];
      let minBlockNum = Infinity;

      for (const h of history) {
        if (!uniqueObj[h.hash]) {
          uniqueObj[h.hash] = true;
          uniqueHistory.push(h);
        }
      }

      const paginated = uniqueHistory.slice(0, 50);
      let nextBlock: string | undefined = undefined;

      if (paginated.length === 50) {
        // Find lowest block number to continue from
        for (const tx of paginated) {
          const bNum = parseInt(tx.blockNum, 16);
          if (!isNaN(bNum) && bNum < minBlockNum) {
            minBlockNum = bNum;
          }
        }
        if (minBlockNum !== Infinity && minBlockNum > 1) {
          nextBlock = "0x" + (minBlockNum - 1).toString(16);
        }
      }

      return { history: paginated, nextBlock };

    } catch (err) {
      return { history: [] };
    }
  }

  async sendTransaction(
    account: Account,
    tx: {
      to: string;
      value?: string;
      gasLimit?: bigint;
      gasPrice?: string;
      data?: string;
      gasMultiplier?: number;
    }
  ): Promise<string> {
    if (!this.rpc_url) throw new Error("RPC URL not set");
    if (!account.ethers_wallet) throw new Error("Account is missing ethers_wallet");

    const wallet = account.ethers_wallet;
    const { JsonRpcProvider, parseUnits } = await import("ethers");
    const provider = new JsonRpcProvider(this.rpc_url);
    const connectedWallet = wallet.connect(provider);

    const valueWei = tx.value ? parseUnits(tx.value, "ether") : 0n;

    const txRequest: TransactionRequest = {
      to: tx.to,
      value: valueWei,
      data: tx.data ?? "0x",
    };

    if (tx.gasLimit) {
      txRequest.gasLimit = tx.gasLimit;
    }

    if (tx.gasPrice) {
      txRequest.gasPrice = parseUnits(tx.gasPrice, "gwei");
    }

    // Apply Premium Gas Multiplier if given (for Slow/Standard/Fast user choice)
    if (tx.gasMultiplier && tx.gasMultiplier !== 1.0) {
      try {
        // Let ethers estimate the base gas price first
        const feeData = await provider.getFeeData();
        if (feeData.gasPrice) {
          // Multiply gas price for older networks
          const estimatedGasPrice = Number(feeData.gasPrice) * tx.gasMultiplier;
          txRequest.gasPrice = BigInt(Math.floor(estimatedGasPrice));
        } else if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
          // Multiply EIP-1559 fees for modern networks
          const estimatedMaxFee = Number(feeData.maxFeePerGas) * tx.gasMultiplier;
          const estimatedPriorityFee = Number(feeData.maxPriorityFeePerGas) * tx.gasMultiplier;
          txRequest.maxFeePerGas = BigInt(Math.floor(estimatedMaxFee));
          txRequest.maxPriorityFeePerGas = BigInt(Math.floor(estimatedPriorityFee));
        }
      } catch (e) {
      }
    }


    try {
      const sentTx = await connectedWallet.sendTransaction(txRequest);

      // Track as pending until confirmed
      this.pendingTransactions.set(sentTx.hash, {
        hash: sentTx.hash,
        nonce: sentTx.nonce,
        from: await connectedWallet.getAddress(),
        to: tx.to,
        value: (txRequest.value ?? 0n).toString(),
        data: tx.data ?? "0x",
        gasPrice: txRequest.gasPrice ? txRequest.gasPrice.toString() : undefined,
        maxFeePerGas: txRequest.maxFeePerGas ? txRequest.maxFeePerGas.toString() : undefined,
        maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas ? txRequest.maxPriorityFeePerGas.toString() : undefined,
        timestamp: Date.now(),
        networkId: this.network_id,
      });

      const receipt = await sentTx.wait();

      // Remove from pending once confirmed
      this.pendingTransactions.delete(sentTx.hash);

      if (receipt && receipt.status === 0) {
        throw new Error(`Transaction reverted on-chain. TX: ${sentTx.hash}`);
      }

      return sentTx.hash;
    } catch (err) {

      const e = err as { info?: { error?: { message?: string } }; reason?: string; message?: string };
      const errorMsg = e.info?.error?.message || e.reason || e.message || String(err);

      if (errorMsg.includes("insufficient funds for gas * price + value") || errorMsg.includes("insufficient funds")) {
        throw new Error("Yetersiz Bakiye: Bu işlemi gerçekleştirmek ve ağ ücretlerini (gas fee) karşılamak için yeterli ETH'niz bulunmuyor.");
      }

      throw new Error(errorMsg);
    }
  }

  async waitForTransaction(txHash: string): Promise<unknown> {
    if (this.alchemy) {
      return this.alchemy.core.waitForTransaction(txHash);
    }
    let attempts = 0;
    while (attempts < 60) {
      try {
        const receipt = await this.call("eth_getTransactionReceipt", [txHash]);
        if (receipt && BigInt(receipt.blockNumber) > 0n) return receipt;
      } catch (e) { }
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }
    throw new Error("Transaction confirmation timed out");
  }

  // --- PENDING TRANSACTION MANAGEMENT ---

  /** Get all pending transactions for the current network */
  getPendingTransactions(): PendingTransaction[] {
    return Array.from(this.pendingTransactions.values())
      .filter(ptx => ptx.networkId === this.network_id)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Remove a pending transaction (after confirm/replace/drop) */
  removePendingTransaction(txHash: string): void {
    this.pendingTransactions.delete(txHash);
  }

  /** Check which pending txs have been confirmed and prune them.
   *  Also returns still-pending list. */
  async refreshPendingTransactions(): Promise<PendingTransaction[]> {
    const pending = this.getPendingTransactions();
    for (const ptx of pending) {
      try {
        const receipt = await this.call("eth_getTransactionReceipt", [ptx.hash]);
        if (receipt && receipt.blockNumber) {
          // Confirmed — remove from pending
          this.pendingTransactions.delete(ptx.hash);
        }
      } catch {
        // RPC error — keep in pending
      }
    }
    // Also prune any pending tx whose nonce has been superseded
    // (a replacement tx with the same nonce got confirmed)
    try {
      const remaining = this.getPendingTransactions();
      if (remaining.length > 0) {
        const fromAddr = remaining[0].from;
        const currentNonceHex = await this.call("eth_getTransactionCount", [fromAddr, "latest"]);
        const currentNonce = parseInt(currentNonceHex, 16);
        for (const ptx of remaining) {
          if (ptx.nonce < currentNonce) {
            // This nonce is already used on-chain — tx was replaced or confirmed
            this.pendingTransactions.delete(ptx.hash);
          }
        }
      }
    } catch {
      // Ignore nonce check errors
    }
    return this.getPendingTransactions();
  }

  /**
   * Speed up a pending transaction by re-sending with the same nonce
   * but with higher gas fees (multiplied by gasMultiplier, default 1.3x).
   */
  async speedUpTransaction(
    account: Account,
    originalTxHash: string,
    gasMultiplier: number = 1.3
  ): Promise<string> {
    const pendingTx = this.pendingTransactions.get(originalTxHash);
    if (!pendingTx) throw new Error("Pending transaction not found");
    if (!this.rpc_url) throw new Error("RPC URL not set");
    if (!account.ethers_wallet) throw new Error("Account is missing ethers_wallet");

    const wallet = account.ethers_wallet;
    const { JsonRpcProvider } = await import("ethers");
    const provider = new JsonRpcProvider(this.rpc_url);
    const connectedWallet = wallet.connect(provider);

    // Build replacement tx with same nonce but higher gas
    const txRequest: TransactionRequest = {
      to: pendingTx.to,
      value: BigInt(pendingTx.value),
      data: pendingTx.data,
      nonce: pendingTx.nonce, // SAME nonce — this is what replaces the tx
    };

    // Bump gas fees by multiplier
    const feeData = await provider.getFeeData();
    if (pendingTx.maxFeePerGas) {
      // EIP-1559: bump both maxFeePerGas and maxPriorityFeePerGas
      const origMaxFee = BigInt(pendingTx.maxFeePerGas);
      const origPriorityFee = BigInt(pendingTx.maxPriorityFeePerGas || "0");
      const networkMaxFee = feeData.maxFeePerGas || origMaxFee;
      const networkPriorityFee = feeData.maxPriorityFeePerGas || origPriorityFee;

      // Use the higher of (original * multiplier) or (current network fee * multiplier)
      const bumpedMaxFee = BigInt(Math.floor(Number(origMaxFee > networkMaxFee ? origMaxFee : networkMaxFee) * gasMultiplier));
      const bumpedPriorityFee = BigInt(Math.floor(Number(origPriorityFee > networkPriorityFee ? origPriorityFee : networkPriorityFee) * gasMultiplier));
      txRequest.maxFeePerGas = bumpedMaxFee;
      txRequest.maxPriorityFeePerGas = bumpedPriorityFee;
    } else {
      // Legacy: bump gasPrice
      const origGasPrice = BigInt(pendingTx.gasPrice || "0");
      const networkGasPrice = feeData.gasPrice || origGasPrice;
      const bumpedGasPrice = BigInt(Math.floor(Number(origGasPrice > networkGasPrice ? origGasPrice : networkGasPrice) * gasMultiplier));
      txRequest.gasPrice = bumpedGasPrice;
    }


    try {
      const sentTx = await connectedWallet.sendTransaction(txRequest);

      // Remove old pending, add new one
      this.pendingTransactions.delete(originalTxHash);
      this.pendingTransactions.set(sentTx.hash, {
        ...pendingTx,
        hash: sentTx.hash,
        gasPrice: txRequest.gasPrice?.toString(),
        maxFeePerGas: txRequest.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas?.toString(),
        timestamp: Date.now(),
      });

      return sentTx.hash;
    } catch (err) {
      const e = err as { info?: { error?: { message?: string } }; reason?: string; message?: string };
      const errorMsg = e.info?.error?.message || e.reason || e.message || String(err);
      throw new Error(`Speed-up failed: ${errorMsg}`);
    }
  }

  /**
   * Cancel a pending transaction by sending a 0-value self-transfer
   * with the same nonce but higher gas fees.
   */
  async cancelTransaction(
    account: Account,
    originalTxHash: string,
    gasMultiplier: number = 1.5
  ): Promise<string> {
    const pendingTx = this.pendingTransactions.get(originalTxHash);
    if (!pendingTx) throw new Error("Pending transaction not found");
    if (!this.rpc_url) throw new Error("RPC URL not set");
    if (!account.ethers_wallet) throw new Error("Account is missing ethers_wallet");

    const wallet = account.ethers_wallet;
    const { JsonRpcProvider } = await import("ethers");
    const provider = new JsonRpcProvider(this.rpc_url);
    const connectedWallet = wallet.connect(provider);

    const selfAddress = await connectedWallet.getAddress();

    // Cancel = 0 ETH self-transfer with same nonce + higher gas
    const txRequest: TransactionRequest = {
      to: selfAddress,          // Send to self
      value: 0n,                // Zero value
      data: "0x",               // No data
      nonce: pendingTx.nonce,   // SAME nonce — replaces the original tx
    };

    // Bump gas aggressively (1.5x default) so miners prefer this over original
    const feeData = await provider.getFeeData();
    if (pendingTx.maxFeePerGas) {
      const origMaxFee = BigInt(pendingTx.maxFeePerGas);
      const origPriorityFee = BigInt(pendingTx.maxPriorityFeePerGas || "0");
      const networkMaxFee = feeData.maxFeePerGas || origMaxFee;
      const networkPriorityFee = feeData.maxPriorityFeePerGas || origPriorityFee;

      txRequest.maxFeePerGas = BigInt(Math.floor(Number(origMaxFee > networkMaxFee ? origMaxFee : networkMaxFee) * gasMultiplier));
      txRequest.maxPriorityFeePerGas = BigInt(Math.floor(Number(origPriorityFee > networkPriorityFee ? origPriorityFee : networkPriorityFee) * gasMultiplier));
    } else {
      const origGasPrice = BigInt(pendingTx.gasPrice || "0");
      const networkGasPrice = feeData.gasPrice || origGasPrice;
      txRequest.gasPrice = BigInt(Math.floor(Number(origGasPrice > networkGasPrice ? origGasPrice : networkGasPrice) * gasMultiplier));
    }


    try {
      const sentTx = await connectedWallet.sendTransaction(txRequest);

      // Remove original pending tx
      this.pendingTransactions.delete(originalTxHash);

      // Don't add cancellation as pending — it's a throwaway self-transfer
      // Wait in background for confirmation and log it
      sentTx.wait().then(() => {
      }).catch((e) => {
      });

      return sentTx.hash;
    } catch (err) {
      const e = err as { info?: { error?: { message?: string } }; reason?: string; message?: string };
      const errorMsg = e.info?.error?.message || e.reason || e.message || String(err);
      throw new Error(`Cancel failed: ${errorMsg}`);
    }
  }

  // --- FHE / SHIELDING METHODS ---

  async getShieldedBalance(contractAddress: string, userAddress: string, account?: Account): Promise<string> {
    if (this.network_id !== NetworkId.Ethereum_Sepolia && this.network_id !== NetworkId.Arbitrum_Sepolia && this.network_id !== NetworkId.Base_Sepolia) return "0.0";

    try {
      const { default: FheCofheService } = await import("./FheCofheService.js");
      const ethers = await import("ethers");

      const instance = FheCofheService.getInstance();

      // Ensure cofhejs is initialized for the correct account
      if (!instance.isReadyForAccount(userAddress, this.network_id)) {
        if (account && account.ethers_wallet) {
          const provider = new ethers.JsonRpcProvider(this.rpc_url);
          const connectedWallet = account.ethers_wallet.connect(provider);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cofhejs expects its own signer interface
          await instance.init(provider, connectedWallet as any);
        } else if (!instance.isReady()) {
          return "0.0";
        }
      }

      // FHERC20.confidentialBalanceOf returns euint64 handle
      const iface = new ethers.Interface([
        "function confidentialBalanceOf(address account) view returns (uint256)"
      ]);

      const data = iface.encodeFunctionData("confidentialBalanceOf", [userAddress]);

      // eth_call to get encrypted balance handle
      const resultHex = await this.call("eth_call", [{
        to: contractAddress,
        data: data
      }, "latest"]);

      if (!resultHex || resultHex === "0x" || resultHex === "0x0") {
        return "0.0";
      }

      // Handle is euint64 (encrypted uint64)
      const handle = BigInt(resultHex);


      // Handle 0 means no encrypted balance exists for this user - skip unseal
      if (handle === BigInt(0)) {
        return "0.0";
      }

      // Unseal using cofhejs (TRUE FHE)
      const decrypted = await instance.unseal(handle);

      if (decrypted !== null && decrypted !== undefined) {
        // Determine decimals based on contract address
        // cETH: 18 decimals, cUSDC: 6 decimals
        const WRAPPED_ETH_SEP = (import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const WRAPPED_ETH_ARB = (import.meta.env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const WRAPPED_ETH_BASE = (import.meta.env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const isEth = contractAddress.toLowerCase() === WRAPPED_ETH_SEP || contractAddress.toLowerCase() === WRAPPED_ETH_ARB || contractAddress.toLowerCase() === WRAPPED_ETH_BASE;
        const decimals = isEth ? 18 : 6;
        const formatted = this.formatTokenAmount(decrypted, decimals);
        return formatted;
      }

      return "0.0";
    } catch (e) {
      return "0.0";
    }
  }

  /**
   * Wrap: Converts public tokens to wrapped tokens
   * Works for both USDC (6 decimals) and WETH (18 decimals)
   * For ETH: Automatically deposits to WETH first if needed
   */
  async wrap(account: Account, publicTokenAddress: string, wrappedTokenAddress: string, amount: string): Promise<string> {
    const ethers = await import("ethers");

    // Fetch decimals from the public token
    const ifaceErc20 = new ethers.Interface([
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function decimals() view returns (uint8)",
      "function balanceOf(address owner) view returns (uint256)"
    ]);

    const decimalsData = ifaceErc20.encodeFunctionData("decimals", []);
    const decimalsHex = await this.call("eth_call", [{ to: publicTokenAddress, data: decimalsData }, "latest"]);
    const decimals = decimalsHex && decimalsHex !== "0x" ? parseInt(decimalsHex, 16) : 18;

    const amountValue = ethers.parseUnits(amount, decimals);

    // Special handling for WETH: Check if user has enough WETH, if not deposit native ETH first
    const WETH_ADDRESS_SEP = (import.meta.env.VITE_SEPOLIA_WETH_ADDRESS || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9").toLowerCase();
    const WETH_ADDRESS_ARB = (import.meta.env.VITE_ARB_SEPOLIA_WETH_ADDRESS || "").toLowerCase();

    if (publicTokenAddress.toLowerCase() === WETH_ADDRESS_SEP || (WETH_ADDRESS_ARB && publicTokenAddress.toLowerCase() === WETH_ADDRESS_ARB)) {

      // Check WETH balance
      const balanceData = ifaceErc20.encodeFunctionData("balanceOf", [account.GetAddress()]);
      const balanceHex = await this.call("eth_call", [{ to: publicTokenAddress, data: balanceData }, "latest"]);
      const wethBalance = balanceHex && balanceHex !== "0x" ? BigInt(balanceHex) : 0n;


      // If insufficient WETH, deposit native ETH to WETH first
      if (wethBalance < amountValue) {
        const depositAmount = amountValue - wethBalance;

        // WETH.deposit() - payable function
        const wethIface = new ethers.Interface(["function deposit() payable"]);
        const depositData = wethIface.encodeFunctionData("deposit", []);

        const depositTx = await this.sendTransaction(account, {
          to: publicTokenAddress,
          value: ethers.formatEther(depositAmount), // Send native ETH
          data: depositData
        });

        await this.waitForTransaction(depositTx);
      }
    }

    // 1. Check and approve token spending
    const allowData = ifaceErc20.encodeFunctionData("allowance", [account.GetAddress(), wrappedTokenAddress]);
    const allowHex = await this.call("eth_call", [{ to: publicTokenAddress, data: allowData }, "latest"]);

    let currentAllowance = 0n;
    try {
      currentAllowance = allowHex && allowHex !== "0x" ? BigInt(allowHex) : 0n;
    } catch (e) {
      currentAllowance = 0n;
    }

    if (currentAllowance < amountValue) {
      const approveData = ifaceErc20.encodeFunctionData("approve", [wrappedTokenAddress, amountValue]);
      const approveTx = await this.sendTransaction(account, {
        to: publicTokenAddress,
        data: approveData,
        value: "0"
      });
    }


    // 2. Call wrap(uint256 amount)
    const iface = new ethers.Interface([
      "function wrap(uint256 amount) external"
    ]);

    const data = iface.encodeFunctionData("wrap", [amountValue]);

    return this.sendTransaction(account, {
      to: wrappedTokenAddress,
      value: "0",
      data: data
    });
  }

  /**
   * Wrap ETH: Directly wrap native ETH into cETH
   * Uses the wrapETH() payable function on WrappedETH_V3
   */
  async wrapETH(account: Account, wrappedTokenAddress: string, amount: string): Promise<string> {
    const ethers = await import("ethers");


    // Call wrapETH() with ETH value (WrappedETH_V3 has payable wrapETH())
    const iface = new ethers.Interface([
      "function wrapETH() payable external"
    ]);

    const data = iface.encodeFunctionData("wrapETH", []);

    return this.sendTransaction(account, {
      to: wrappedTokenAddress,
      value: amount, // Send native ETH
      data: data
    });
  }

  /**
   * Unwrap: Burns wrapped tokens and returns underlying tokens to sender
   * Works for both cUSDC (6 decimals) and cETH (18 decimals)
   */
  async unwrap(account: Account, wrappedTokenAddress: string, amount: string): Promise<string> {
    const ethers = await import("ethers");

    // Fetch decimals from the wrapped token
    const ifaceErc20 = new ethers.Interface([
      "function decimals() view returns (uint8)"
    ]);

    const decimalsData = ifaceErc20.encodeFunctionData("decimals", []);
    const decimalsHex = await this.call("eth_call", [{ to: wrappedTokenAddress, data: decimalsData }, "latest"]);
    const decimals = decimalsHex && decimalsHex !== "0x" ? parseInt(decimalsHex, 16) : 18;

    const amountValue = ethers.parseUnits(amount, decimals);


    const iface = new ethers.Interface([
      "function unwrap(uint256 amount) external"
    ]);

    const data = iface.encodeFunctionData("unwrap", [
      amountValue  // amount: how much to unwrap
    ]);

    return this.sendTransaction(account, {
      to: wrappedTokenAddress,
      value: "0",
      data: data
    });
  }

  /**
   * Confidential Transfer: Send encrypted tokens using cofhejs (TRUE FHE)
   * 
   * WrappedETH_V3/WrappedUSDC_V2.transferEncrypted(address to, InEuint64 calldata inValue)
   * Transfers encrypted amount without revealing the value
   */
  async transferConfidential(account: Account, shieldedTokenAddress: string, to: string, amount: string): Promise<string> {
    const { default: FheCofheService } = await import("./FheCofheService.js");
    const ethers = await import("ethers");

    // Initialize cofhejs if needed - MUST be initialized with the SAME account that sends the TX
    // cofhejs uses signer.getAddress() as the account for the verifier hash
    // TaskManager uses msg.sender for verification - these must match
    const txSenderAddress = account.GetAddress();
    if (!txSenderAddress) throw new Error("Account address not available");

    if (!FheCofheService.getInstance().isReadyForAccount(txSenderAddress, this.network_id)) {
      if (!account.ethers_wallet) throw new Error("Wallet not accessible");
      const provider = new ethers.JsonRpcProvider(this.rpc_url);
      const connectedWallet = account.ethers_wallet.connect(provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cofhejs expects its own signer interface
      await FheCofheService.getInstance().init(provider, connectedWallet as any);
    }

    // Determine decimals based on contract address
    // cETH: 18 decimals, cUSDC: 6 decimals
    const WRAPPED_ETH_SEP = (import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
    const WRAPPED_ETH_ARB = (import.meta.env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase();
    const WRAPPED_ETH_BASE = (import.meta.env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
    const isEth = shieldedTokenAddress.toLowerCase() === WRAPPED_ETH_SEP || shieldedTokenAddress.toLowerCase() === WRAPPED_ETH_ARB || shieldedTokenAddress.toLowerCase() === WRAPPED_ETH_BASE;
    const decimals = isEth ? 18 : 6;
    const amountValue = ethers.parseUnits(amount, decimals);


    // Encrypt amount using cofhejs (TRUE FHE)
    const encrypted = await FheCofheService.getInstance().encrypt(BigInt(amountValue.toString()));


    // V4 contract: transferEncrypted(address to, InEuint64 encryptedAmount) - NO plaintext amount
    // struct InEuint64 { uint256 ctHash; uint8 securityZone; uint8 utype; bytes signature; }
    const iface = new ethers.Interface([
      "function transferEncrypted(address to, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) inValue) external returns (uint256)"
    ]);

    const inEuint64 = {
      ctHash: encrypted.ctHash,
      securityZone: encrypted.securityZone,
      utype: encrypted.utype,
      signature: encrypted.signature
    };

    const data = iface.encodeFunctionData("transferEncrypted", [to, inEuint64]);


    const txHash = await this.sendTransaction(account, {
      to: shieldedTokenAddress,
      value: "0",
      data: data,
      gasLimit: 3000000n
    });

    // Fetch and log receipt details for debugging
    try {
      const receipt = await this.call("eth_getTransactionReceipt", [txHash]);
      const status = typeof receipt?.status === "string" ? parseInt(receipt.status, 16) : receipt?.status;
      if (receipt?.logs) {
        receipt.logs.forEach((log: { topics?: string[]; data?: string }, i: number) => {
        });
      }
    } catch (e) {
    }

    return txHash;
  }
}

export { Network };