import { formatEther, parseUnits, TransactionRequest } from "ethers";
import { Alchemy, Network as AlchemyNetwork } from "alchemy-sdk";
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
      const big = await this.alchemy.core.getBalance(address);
      return big.toString();
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

  async getHistory(address: string, tokenCacheObj: TokenCache | undefined): Promise<TransactionHistory[]> {
    if (!tokenCacheObj) return [];
    if (!this.alchemy) {
      console.warn("Alchemy SDK not configured for this network");
      return [];
    }

    try {
      const category = ["external", "erc20"] as any;
      const optionsBase = {
        fromBlock: "0x0",
        toBlock: "latest",
        category: category,
        withMetadata: true,
        maxCount: 20
      };

      const [sentRes, receivedRes] = await Promise.all([
        this.alchemy.core.getAssetTransfers({
          ...optionsBase,
          fromAddress: address
        }),
        this.alchemy.core.getAssetTransfers({
          ...optionsBase,
          toAddress: address
        })
      ]);

      const allTransfers = [...sentRes.transfers, ...receivedRes.transfers];

      allTransfers.sort((a, b) => {
        const tA = (a as any).metadata.blockTimestamp;
        const tB = (b as any).metadata.blockTimestamp;
        return tA < tB ? 1 : tA > tB ? -1 : 0;
      });

      const history: TransactionHistory[] = [];
      const limited = allTransfers.slice(0, 15);

      let explorerBase = "https://etherscan.io";
      if (this.network_id === NetworkId.Ethereum_Sepolia) {
        explorerBase = "https://sepolia.etherscan.io";
      }

      for (const tx of limited) {
        const isNative = (tx.category === "external");
        const contractAddress = isNative ? "ETH" : tx.rawContract.address?.toLowerCase() ?? "ETH";

        if (!isNative && !tokenCacheObj.hasToken(this.network_id, contractAddress)) {
          const basicItem: TokenCacheItem = {
            name: tx.asset || "Unknown",
            symbol: tx.asset || "???",
            decimals: 18,
            logoSrc: "",
            contractAddress
          };
        }

        history.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to || "",
          contractAddress: contractAddress,
          value: tx.value?.toString() || "0",
          timestamp: (tx as any).metadata.blockTimestamp,
          isNative: isNative,
          status: "Success",
          explorerUrl: `${explorerBase}/tx/${tx.hash}`
        });
      }

      return history;

    } catch (err) {
      console.error("Error fetching history:", err);
      return [];
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

    const nonceHex = await this.call("eth_getTransactionCount", [wallet.address, "pending"]);
    const nonce = BigInt(nonceHex);

    let gasPrice = tx.gasPrice
      ? parseUnits(tx.gasPrice, "gwei")
      : BigInt(await this.call("eth_gasPrice", []));

    gasPrice = (gasPrice * 120n) / 100n;

    const valueWei = tx.value ? parseUnits(tx.value, "ether") : 0n;

    const chainIdHex = await this.call("eth_chainId", []);
    const chainId = parseInt(chainIdHex, 16);

    const txRequest: TransactionRequest = {
      to: tx.to,
      value: valueWei,
      gasPrice,
      nonce: Number(nonce),
      data: tx.data ?? "0x",
      chainId,
    };

    if (tx.gasLimit) {
      txRequest.gasLimit = tx.gasLimit;
    } else {
      try {
        const estimateHex = await this.call("eth_estimateGas", [{
          from: wallet.address,
          to: tx.to,
          data: txRequest.data,
          value: "0x" + valueWei.toString(16),
        }]);
        const estimate = BigInt(estimateHex);
        txRequest.gasLimit = (estimate * 120n) / 100n;
      } catch (error) {
        console.warn("[Network] Gas Estimate Failed, defaulting.", error);
        if (!tx.data || tx.data === "0x") {
          txRequest.gasLimit = 21_000n;
        } else {
          txRequest.gasLimit = 1000000n;
        }
      }
    }

    console.log("[Network] Sending TX:", {
      to: txRequest.to,
      gasLimit: (txRequest.gasLimit ?? "0").toString(),
      dataLen: txRequest.data ? txRequest.data.toString().length : 0,
      value: (txRequest.value ?? "0").toString()
    });

    const signedTx = await wallet.signTransaction(txRequest);
    const txHash = await this.call("eth_sendRawTransaction", [signedTx]);

    console.log(`[Network] Waiting for TX ${txHash}...`);
    const receipt = await this.waitForTransaction(txHash);
    
    // Check receipt status - 0x0 means reverted
    if (receipt && receipt.status !== undefined) {
      const status = typeof receipt.status === "string" ? parseInt(receipt.status, 16) : receipt.status;
      if (status === 0) {
        console.error(`[Network] ❌ TX REVERTED: ${txHash}`);
        throw new Error(`Transaction reverted on-chain. TX: ${txHash}`);
      }
    }
    console.log(`[Network] ✅ TX Confirmed: ${txHash}`);

    return txHash;
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
    if (this.network_id !== NetworkId.Ethereum_Sepolia) return "0.0";

    try {
      const { default: FheCofheService } = await import("./FheCofheService.js");
      const ethers = await import("ethers");

      const instance = FheCofheService.getInstance();
      
      // Ensure cofhejs is initialized for the correct account
      if (!instance.isReadyForAccount(userAddress)) {
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
        const WRAPPED_ETH = ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "0x17CecF8090B945932e2F592168B636F7A0c986e8").toLowerCase();
        const isEth = contractAddress.toLowerCase() === WRAPPED_ETH;
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
    const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9".toLowerCase();
    if (publicTokenAddress.toLowerCase() === WETH_ADDRESS) {
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
    
    if (!FheCofheService.getInstance().isReadyForAccount(txSenderAddress)) {
      if (!account.ethers_wallet) throw new Error("Wallet not accessible");
      const provider = new ethers.JsonRpcProvider(this.rpc_url);
      const connectedWallet = account.ethers_wallet.connect(provider);
      console.log(`[TransferConfidential] Initializing cofhejs for account: ${txSenderAddress}`);
      await FheCofheService.getInstance().init(provider, connectedWallet as any);
    }

    // Determine decimals based on contract address
    // cETH: 18 decimals, cUSDC: 6 decimals
    const WRAPPED_ETH = ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "0x17CecF8090B945932e2F592168B636F7A0c986e8").toLowerCase();
    const isEth = shieldedTokenAddress.toLowerCase() === WRAPPED_ETH;
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
          console.log(`[TransferConfidential] Log[${i}]: topic0=${log.topics?.[0]?.slice(0,10)}... topics=${log.topics?.length} data=${log.data?.length}chars`);
        });
      }
    } catch (e) {
      console.warn("[TransferConfidential] Could not fetch receipt for debug:", e);
    }

    return txHash;
  }
}

export { Network };