import { formatEther, parseUnits, TransactionRequest } from "ethers";
import { Alchemy, Network as AlchemyNetwork, SortingOrder } from "alchemy-sdk";
import Account from "./Account.js";
import TokenCache, { TokenCacheItem } from "./TokenCache.js";

import { NetworkId, TokenBalance, TransactionHistory } from "./NetworkTypes.js";
import { ExplorerService } from "./ExplorerService.js";

class Network {
  network_id: NetworkId;
  network_name: string;

  api_key?: string;
  rpc_url?: string;
  alchemy?: Alchemy;
  explorerService?: ExplorerService;

  FETCH_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  constructor(network_id: NetworkId, network_name: string, baseUrl?: string, explicitApiKey?: string) {
    this.network_id = network_id;
    this.network_name = network_name;

    let rawKey = explicitApiKey || (import.meta as any).env.VITE_ALCHEMY_API_KEY || "";

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

  isAlchemyConfigured(): boolean {
    return !!this.api_key && this.api_key !== "CUSTOM_URL";
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
    if (this.alchemy) {
      try {
        const metadata = await this.alchemy.core.getTokenMetadata(contractAddress);
        const item: TokenCacheItem = {
          name: metadata.name ?? "Unknown Token",
          symbol: metadata.symbol ?? "",
          decimals: metadata.decimals ?? 18,
          logoSrc: metadata.logo ?? "",
          contractAddress: contractAddress,
        };
        tokenCacheObj.setToken(this.network_id, item);
        return item;
      } catch (e) {
        console.warn("[Network] Alchemy getTokenMetadata fallback failed", e);
      }
    }

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

    let fractionStr = fraction.toString().padStart(Number(decimals), "0").replace(/0+$/, "");

    if (fractionStr.length === 0) {
      return whole.toString();
    }

    return `${whole}.${fractionStr}`;
  }


  async getBalance(address: string): Promise<string> {
    if (this.alchemy) {
      try {
        const big = await this.alchemy.core.getBalance(address);
        return big.toString();
      } catch (e) {
        // Fallback
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
      console.error("[Network] Failed to fetch native balance", e);
    }

    let tokenBalancesRaw: any[] = [];

    if (this.alchemy) {
      try {
        const response = await this.alchemy.core.getTokenBalances(address);
        tokenBalancesRaw = response.tokenBalances;
      } catch (e) {
        console.error("[Network] SDK fetch failed", e);
        throw new Error("Failed to fetch tokens via Alchemy SDK");
      }
    } else if (this.isAlchemyConfigured()) {
      try {
        const result = await this.call("alchemy_getTokenBalances", [address, "erc20"]);
        tokenBalancesRaw = result.tokenBalances;
      } catch (e) {
        console.error("[Network] Manual fetch failed", e);
      }
    }

    const activeTokens = tokenBalancesRaw.filter(t => {
      try {
        return BigInt(t.tokenBalance ?? 0) > 0n;
      } catch { return false; }
    });

    const processedTokens = await Promise.all(
      activeTokens.map(async (t: any): Promise<TokenBalance> => {
        const contract = t.contractAddress.toLowerCase();
        let decimals = 18;

        if (tokenCacheObj.hasToken(this.network_id, contract)) {
          decimals = tokenCacheObj.getToken(this.network_id, contract)?.decimals ?? 18;
        } else {
          try {
            const metadata = await this.getTokenMetadata(tokenCacheObj, contract);
            decimals = metadata.decimals;
          } catch (err) {
            console.warn(`[Network] Metadata fetch failed for ${contract}:`, err);
          }
        }

        return {
          contractAddress: contract,
          tokenBalance: this.formatTokenAmount(BigInt(t.tokenBalance ?? 0), decimals),
          isNative: false,
        };
      })
    );

    const nativeItem: TokenCacheItem = {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
      logoSrc: "/logos/eth.png",
      contractAddress: "ETH",
    };
    if (!tokenCacheObj.hasToken(this.network_id, "ETH")) {
      tokenCacheObj.setToken(this.network_id, nativeItem);
    }

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
      console.error(`[Network] Failed to fetch balance for ${tokenAddress}:`, error);
      return "0";
    }
  }

  async getTokenPrices(contractAddresses: string[]): Promise<{ [key: string]: number }> {
    try {
      // Skip price fetching for testnets (CoinGecko only supports mainnet)
      if (this.network_id !== NetworkId.Ethereum_Mainnet) {
        console.log("[Network] Skipping price fetch on testnet");
        return {};
      }

      // eToken addresses (don't fetch prices for these)
      // Including both official and any test/old variants
      const eTokenAddresses = [
        "0xfff9976742d46cc05630d1f6ebab18b2324d6b14", // eETH (official)
        "0x2035f9228e160243be8e07973715c929845e445e", // eUSDC (official)
        "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", // Old/test eETH variant
      ].map(a => a.toLowerCase());

      // 1. Prepare addresses (filter out ETH/Native markers and eTokens)
      const tokenAddresses = contractAddresses
        .filter(a => {
          const lower = a.toLowerCase();
          const isEth = a === "ETH" || lower.startsWith("0xeeee");
          const isEToken = eTokenAddresses.includes(lower);
          return !isEth && !isEToken;
        })
        .map(a => a.toLowerCase());

      const prices: { [key: string]: number } = {};

      // 2. Fetch ETH Price
      try {
        const ethRes = await fetch("/api/coingecko/simple/price?ids=ethereum&vs_currencies=usd");
        const ethJson = await ethRes.json();
        if (ethJson.ethereum?.usd) {
          prices["ETH"] = ethJson.ethereum.usd;
          prices["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"] = ethJson.ethereum.usd;
        }
      } catch (e) {
        console.warn("[Network] Failed to fetch ETH price", e);
      }

      // 3. Fetch Token Prices (if any)
      if (tokenAddresses.length > 0) {
        // CoinGecko expects comma-separated addresses for 'contract_addresses'
        // Note: This endpoint depends on the network (platform). 
        // For Mainnet uses 'ethereum'. For Sepolia, prices might be same or mock.
        // We will assert 'ethereum' for now.
        const platform = "ethereum";
        const addrStr = tokenAddresses.join(",");

        const url = `/api/coingecko/simple/token_price/${platform}?contract_addresses=${addrStr}&vs_currencies=usd`;
        const res = await fetch(url);
        const json = await res.json();

        // json structure: { "0x123...": { "usd": 12.34 } }
        for (const [addr, priceData] of Object.entries(json)) {
          if ((priceData as any).usd) {
            prices[addr.toLowerCase()] = (priceData as any).usd;
          }
        }
      }

      return prices;

    } catch (err) {
      console.error("[Network] unexpected error fetching prices", err);
      // Return empty object so flow continues without crashing
      return {};
    }
  }

  async getHistory(address: string, tokenCacheObj: TokenCache | undefined, toBlock: string = "latest"): Promise<{ history: TransactionHistory[], nextBlock?: string }> {
    if (!tokenCacheObj) return { history: [] };
    if (!this.alchemy && !this.isAlchemyConfigured()) {
      console.warn("Alchemy SDK not configured for this network");
      return { history: [] };
    }

    try {
      const category = ["external", "erc20"] as any[];
      // Most L2s (Arbitrum, Base) do not support the "internal" category for getAssetTransfers on standard Alchemy tiers
      if (this.network_id === NetworkId.Ethereum_Mainnet || this.network_id === NetworkId.Ethereum_Sepolia) {
        category.push("internal");
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

      const CETH_SEP = ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
      const CUSDC_SEP = ((import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
      const CETH_ARB = ((import.meta as any).env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase();
      const CUSDC_ARB = ((import.meta as any).env.VITE_ARB_WRAPPED_USDC_ADDRESS || "").toLowerCase();
      const CETH_BASE = ((import.meta as any).env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
      const CUSDC_BASE = ((import.meta as any).env.VITE_BASE_WRAPPED_USDC_ADDRESS || "").toLowerCase();

      const promises: Promise<any>[] = [];

      // 1. Alchemy Fetches (Sent & Received normal transfers)
      if (this.alchemy) {
        promises.push(this.alchemy.core.getAssetTransfers({ ...optionsBase, fromAddress: address }).catch(e => { console.warn("[getHistory] Alchemy sent transfers failed:", e); return { transfers: [] }; }));
        promises.push(this.alchemy.core.getAssetTransfers({ ...optionsBase, toAddress: address }).catch(e => { console.warn("[getHistory] Alchemy recv transfers failed:", e); return { transfers: [] }; }));
      } else {
        // Fallback to raw call if SDK isn't happy but URL works
        promises.push(this.call("alchemy_getAssetTransfers", [{ ...optionsBase, fromAddress: address }]).catch(e => { console.warn("[getHistory] RPC sent transfers failed:", e); return { transfers: [] }; }));
        promises.push(this.call("alchemy_getAssetTransfers", [{ ...optionsBase, toAddress: address }]).catch(e => { console.warn("[getHistory] RPC recv transfers failed:", e); return { transfers: [] }; }));
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
              let allIncomingLogs: any[] = [];

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
                  console.warn(`[Network] getLogs chunk failed ${fromHex} to ${toHex}`, chunkErr);
                  // If a chunk fails, we just stop fetching older logs to prevent spam and return what we have
                  break;
                }

                currentBlock = chunkStart - 1;
              }

              return { incomingFheLogs: allIncomingLogs.slice(-100) };
            } catch (e) {
              console.warn("eth_getLogs failed for FHE:", e);
              return { incomingFheLogs: [] };
            }
          })());
        }
      }

      // Wait for all data
      const results = await Promise.all(promises);
      const sentRes = results[0];
      const receivedRes = results[1];
      const fheLogsRes = results.length > 2 ? results[2] : { incomingFheLogs: [] };

      let allTransfers = [
        ...(sentRes.transfers || []),
        ...(receivedRes.transfers || [])
      ];

      // Format Alchemy Transfers
      const history: TransactionHistory[] = [];
      let explorerBase = "https://etherscan.io";
      if (this.network_id === NetworkId.Ethereum_Sepolia) explorerBase = "https://sepolia.etherscan.io";
      else if (this.network_id === NetworkId.Arbitrum_One) explorerBase = "https://arbiscan.io";
      else if (this.network_id === NetworkId.Arbitrum_Sepolia) explorerBase = "https://sepolia.arbiscan.io";
      else if (this.network_id === NetworkId.Base_Mainnet) explorerBase = "https://basescan.org";
      else if (this.network_id === NetworkId.Base_Sepolia) explorerBase = "https://sepolia.basescan.org";

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
          blockNum: (tx as any).blockNum || "0x0",
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
      const uniqueObj: any = {};
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
      console.error("Error fetching history:", err);
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
    }
  ): Promise<string> {
    if (!this.rpc_url) throw new Error("RPC URL not set");
    if (!account.ethers_wallet) throw new Error("Account is missing ethers_wallet");

    const wallet = account.ethers_wallet;
    const { JsonRpcProvider, parseUnits } = await import("ethers");
    const provider = new JsonRpcProvider(this.rpc_url);
    const connectedWallet = wallet.connect(provider);

    const valueWei = tx.value ? parseUnits(tx.value, "ether") : 0n;

    const txRequest: any = {
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

    console.log("[Network] Sending TX via Provider:", {
      to: txRequest.to,
      dataLen: txRequest.data ? txRequest.data.toString().length : 0,
      value: (txRequest.value ?? "0").toString()
    });

    try {
      const sentTx = await connectedWallet.sendTransaction(txRequest);
      console.log(`[Network] Waiting for TX ${sentTx.hash}...`);

      const receipt = await sentTx.wait();

      if (receipt && receipt.status === 0) {
        console.error(`[Network] ❌ TX REVERTED: ${sentTx.hash}`);
        throw new Error(`Transaction reverted on-chain. TX: ${sentTx.hash}`);
      }

      console.log(`[Network] ✅ TX Confirmed: ${sentTx.hash}`);
      return sentTx.hash;
    } catch (err: any) {
      console.error("[Network] SendTransaction Error:", err);

      const errorMsg = err.info?.error?.message || err.reason || err.message || String(err);

      if (errorMsg.includes("insufficient funds for gas * price + value") || errorMsg.includes("insufficient funds")) {
        throw new Error("Yetersiz Bakiye: Bu işlemi gerçekleştirmek ve ağ ücretlerini (gas fee) karşılamak için yeterli ETH'niz bulunmuyor.");
      }

      throw new Error(errorMsg);
    }
  }

  async waitForTransaction(txHash: string): Promise<any> {
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
          console.log(`[getShieldedBalance] Initializing cofhejs for account: ${userAddress}`);
          const provider = new ethers.JsonRpcProvider(this.rpc_url);
          const connectedWallet = account.ethers_wallet.connect(provider);
          await instance.init(provider, connectedWallet as any);
        } else if (!instance.isReady()) {
          console.warn("[Network] cofhejs FHE not ready and no account provided, cannot fetch shielded balance");
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

      console.log(`[getShieldedBalance] Unsealing handle: ${handle}`);

      // Handle 0 means no encrypted balance exists for this user - skip unseal
      if (handle === BigInt(0)) {
        console.log("[getShieldedBalance] Handle is 0 (no encrypted balance), returning 0.0");
        return "0.0";
      }

      // Unseal using cofhejs (TRUE FHE)
      const decrypted = await instance.unseal(handle);

      if (decrypted !== null && decrypted !== undefined) {
        // Determine decimals based on contract address
        // cETH: 18 decimals, cUSDC: 6 decimals
        const WRAPPED_ETH_SEP = ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const WRAPPED_ETH_ARB = ((import.meta as any).env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const WRAPPED_ETH_BASE = ((import.meta as any).env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const isEth = contractAddress.toLowerCase() === WRAPPED_ETH_SEP || contractAddress.toLowerCase() === WRAPPED_ETH_ARB || contractAddress.toLowerCase() === WRAPPED_ETH_BASE;
        const decimals = isEth ? 18 : 6;
        const formatted = this.formatTokenAmount(decrypted, decimals);
        console.log(`[getShieldedBalance] ✅ Unsealed: ${formatted}`);
        return formatted;
      }

      console.warn("[getShieldedBalance] ⚠️ Unseal returned null");
      return "0.0";
    } catch (e) {
      console.error("[getShieldedBalance] ❌ Error:", e);
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
    const WETH_ADDRESS_SEP = ((import.meta as any).env.VITE_SEPOLIA_WETH_ADDRESS || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9").toLowerCase();
    const WETH_ADDRESS_ARB = ((import.meta as any).env.VITE_ARB_SEPOLIA_WETH_ADDRESS || "").toLowerCase();

    if (publicTokenAddress.toLowerCase() === WETH_ADDRESS_SEP || (WETH_ADDRESS_ARB && publicTokenAddress.toLowerCase() === WETH_ADDRESS_ARB)) {
      console.log("[Wrap] WETH detected - checking balance...");

      // Check WETH balance
      const balanceData = ifaceErc20.encodeFunctionData("balanceOf", [account.GetAddress()]);
      const balanceHex = await this.call("eth_call", [{ to: publicTokenAddress, data: balanceData }, "latest"]);
      const wethBalance = balanceHex && balanceHex !== "0x" ? BigInt(balanceHex) : 0n;

      console.log(`[Wrap] Current WETH balance: ${wethBalance}, needed: ${amountValue}`);

      // If insufficient WETH, deposit native ETH to WETH first
      if (wethBalance < amountValue) {
        const depositAmount = amountValue - wethBalance;
        console.log(`[Wrap] Insufficient WETH. Depositing ${ethers.formatEther(depositAmount)} ETH to WETH...`);

        // WETH.deposit() - payable function
        const wethIface = new ethers.Interface(["function deposit() payable"]);
        const depositData = wethIface.encodeFunctionData("deposit", []);

        const depositTx = await this.sendTransaction(account, {
          to: publicTokenAddress,
          value: ethers.formatEther(depositAmount), // Send native ETH
          data: depositData
        });

        console.log("[Wrap] ETH → WETH deposit successful ✓ TX:", depositTx);
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
      console.warn("[Wrap] Failed to parse allowance, assuming 0:", allowHex);
      currentAllowance = 0n;
    }

    if (currentAllowance < amountValue) {
      console.log(`[Wrap] Approving ${decimals === 6 ? 'USDC' : 'WETH'} tokens...`);
      const approveData = ifaceErc20.encodeFunctionData("approve", [wrappedTokenAddress, amountValue]);
      const approveTx = await this.sendTransaction(account, {
        to: publicTokenAddress,
        data: approveData,
        value: "0"
      });
      console.log("[Wrap] Token approved ✓ TX:", approveTx);
    }

    console.log(`[Wrap] Wrapping ${amount} tokens (${amountValue} units, ${decimals} decimals)...`);

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

    console.log(`[WrapETH] Wrapping ${amount} ETH directly to cETH...`);

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

    console.log(`[Unwrap] Unwrapping ${amount} tokens (${amountValue} units, ${decimals} decimals)`);

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
      console.log(`[TransferConfidential] Initializing cofhejs for account: ${txSenderAddress}`);
      await FheCofheService.getInstance().init(provider, connectedWallet as any);
    }

    // Determine decimals based on contract address
    // cETH: 18 decimals, cUSDC: 6 decimals
    const WRAPPED_ETH_SEP = ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
    const WRAPPED_ETH_ARB = ((import.meta as any).env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase();
    const WRAPPED_ETH_BASE = ((import.meta as any).env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
    const isEth = shieldedTokenAddress.toLowerCase() === WRAPPED_ETH_SEP || shieldedTokenAddress.toLowerCase() === WRAPPED_ETH_ARB || shieldedTokenAddress.toLowerCase() === WRAPPED_ETH_BASE;
    const decimals = isEth ? 18 : 6;
    const amountValue = ethers.parseUnits(amount, decimals);

    console.log(`[TransferConfidential] Sending ${amount} (${amountValue} units) to ${to}`);
    console.log(`[TransferConfidential] Encrypting amount with cofhejs...`);

    // Encrypt amount using cofhejs (TRUE FHE)
    const encrypted = await FheCofheService.getInstance().encrypt(BigInt(amountValue.toString()));

    console.log(`[TransferConfidential] ✅ Encrypted ctHash: ${encrypted.ctHash}`);

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

    console.log(`[TransferConfidential] Contract: ${shieldedTokenAddress}`);
    console.log(`[TransferConfidential] To (recipient): ${to}`);
    console.log(`[TransferConfidential] inEuint64:`, JSON.stringify(inEuint64, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    console.log(`[TransferConfidential] Encoded data length: ${data.length}`);
    console.log(`[TransferConfidential] Sending transaction...`);

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
      console.log(`[TransferConfidential] TX Receipt Status: ${status === 1 ? '✅ SUCCESS' : '❌ REVERTED'}`);
      console.log(`[TransferConfidential] Gas Used: ${receipt?.gasUsed}`);
      console.log(`[TransferConfidential] Logs count: ${receipt?.logs?.length || 0}`);
      if (receipt?.logs) {
        receipt.logs.forEach((log: any, i: number) => {
          console.log(`[TransferConfidential] Log[${i}]: topic0=${log.topics?.[0]?.slice(0, 10)}... topics=${log.topics?.length} data=${log.data?.length}chars`);
        });
      }
    } catch (e) {
      console.warn("[TransferConfidential] Could not fetch receipt for debug:", e);
    }

    return txHash;
  }
}

export { Network };