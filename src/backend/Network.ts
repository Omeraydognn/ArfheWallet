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

    if (this.isAlchemyConfigured()) {
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

    let fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");

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

  async getTokenPrices(contractAddresses: string[]): Promise<{ [key: string]: number }> {
    try {
      // 1. Prepare addresses (filter out ETH/Native markers)
      const tokenAddresses = contractAddresses
        .filter(a => a !== "ETH" && !a.startsWith("0xeeee"))
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
    await this.waitForTransaction(txHash);
    console.log(`[Network] TX Confirmed: ${txHash}`);

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

  async getShieldedBalance(contractAddress: string, userAddress: string): Promise<string> {
    if (this.network_id !== NetworkId.Ethereum_Sepolia) return "0.0";

    try {
      const { default: FheService } = await import("./FheService.js");
      const ethers = await import("ethers");

      let instance = FheService.getInstance();
      if (!instance.isReady()) return "0.0";

      const permit = await FheService.getInstance().createPermit(contractAddress, userAddress);
      if (!permit) return "0.0";

      const iface = new ethers.Interface(["function balanceOf(address owner) view returns (uint256)"]);
      const data = iface.encodeFunctionData("balanceOf", [userAddress]);

      const resultHex = await this.call("eth_call", [{
        to: contractAddress,
        data: data
      }, "latest"]);

      if (!resultHex || resultHex === "0x") return "0.0";

      const handle = BigInt(resultHex).toString();
      const decrypted = await FheService.getInstance().unseal(contractAddress, userAddress, handle, permit);

      if (decrypted !== null) {
        return this.formatTokenAmount(BigInt(decrypted), 18);
      }
      return "0.0";
    } catch (e) {
      return "0.0";
    }
  }

  async wrap(account: Account, publicTokenAddress: string, shieldedTokenAddress: string, amount: string): Promise<string> {
    const ethers = await import("ethers");
    const isEth = publicTokenAddress === "ETH" || publicTokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const decimals = isEth ? 18 : 6;
    const amountBig = ethers.parseUnits(amount, decimals);

    // 1. ERC20 Approve (Sadece Token için)
    if (!isEth) {
      const ifaceer20 = new ethers.Interface([
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)"
      ]);
      const allowData = ifaceer20.encodeFunctionData("allowance", [account.GetAddress(), shieldedTokenAddress]);
      const allowHex = await this.call("eth_call", [{ to: publicTokenAddress, data: allowData }, "latest"]);

      if (BigInt(allowHex) < amountBig) {
        const approveData = ifaceer20.encodeFunctionData("approve", [shieldedTokenAddress, amountBig]);
        await this.sendTransaction(account, { to: publicTokenAddress, data: approveData, value: "0" });
      }
    }

    console.log(`[Wrap] Step 1: Depositing to Public WETH...`);
    const iface = new ethers.Interface([
      "function deposit(uint256 amount)",
      "function deposit() payable",
      "function shield(uint256 amount)" // FHE Shield function
    ]);

    let data;
    if (isEth) {
      // --- 2 AŞAMALI SHIELD (ETH -> WETH -> eETH) ---
      // 1. Deposit (ETH -> Public WETH)
      // Eğer zaten WETH varsa bunu atlayabilirsin ama güvenlik için yapıyoruz.
      const depositData = iface.encodeFunctionData("deposit()", []);
      const tx1 = await this.sendTransaction(account, {
        to: shieldedTokenAddress,
        value: amount,
        data: depositData,
        gasLimit: 500000n
      });

      // Wait for Deposit
      console.log(`[Wrap] Deposit Confirmed (${tx1}). Step 2: Shielding...`);
      // await this.waitForTransaction(tx1); // (sendTransaction zaten bekliyor)

      // 2. Shield (Public WETH -> Encrypted eETH)
      // DİKKAT: Bu işlem Public WETH'i yakar ve sana Gizli eETH verir.
      const shieldData = iface.encodeFunctionData("shield", [amountBig]);

      const tx2 = await this.sendTransaction(account, {
        to: shieldedTokenAddress,
        value: "0",
        data: shieldData,
        gasLimit: 3000000n // FHE işlemi, yüksek gas
      });

      return tx2; // Son hash'i dönüyoruz
    } else {
      // Token -> eToken (Genelde deposit direkt shield eder)
      data = iface.encodeFunctionData("deposit(uint256)", [amountBig]);
      return this.sendTransaction(account, {
        to: shieldedTokenAddress,
        value: "0",
        data: data,
        gasLimit: 1000000n
      });
    }
  }

  async unwrap(account: Account, shieldedTokenAddress: string, amount: string): Promise<string> {
    const ethers = await import("ethers");
    // FHE unwrap genelde: unshield(amount) -> Public WETH yapar. Sonra withdraw gerekebilir.
    // Ama genelde tek adımda eETH -> ETH yapan fonksiyon "withdraw" yerine "unshield" olabilir.
    // Biz standart withdraw'u deneriz ama gas artırırız.
    const iface = new ethers.Interface(["function withdraw(uint256 amount)"]);
    const isEth = shieldedTokenAddress.toLowerCase() === "0xfff9976742d46cc05630d1f6ebab18b2324d6b14".toLowerCase();
    const decimals = isEth ? 18 : 6;
    const amountWei = ethers.parseUnits(amount, decimals);

    const data = iface.encodeFunctionData("withdraw", [amountWei]);

    return this.sendTransaction(account, {
      to: shieldedTokenAddress,
      value: "0",
      data: data,
      gasLimit: 3000000n // Critical for FHE Decryption
    });
  }

  async claimUnwrapped(account: Account, shieldedTokenAddress: string, requestId: string): Promise<string> {
    throw new Error("Claim not implemented yet");
  }

  async transferConfidential(account: Account, shieldedTokenAddress: string, to: string, amount: string): Promise<string> {
    console.log(`[TransferConfidential] Sending ${amount} eTokens to ${to}`);
    const { default: FheService } = await import("./FheService.js");
    const ethers = await import("ethers");

    if (!FheService.getInstance().isReady()) {
      if (!account.ethers_wallet) throw new Error("Wallet not accessible");
      const provider = new ethers.JsonRpcProvider(this.rpc_url);
      const connectedWallet = account.ethers_wallet.connect(provider);
      await FheService.getInstance().init(provider, connectedWallet);
    }

    // FIXED: Use uint32 for Fhenix Testnet compatibility
    const ciphertext = await FheService.getInstance().encrypt(amount, "uint32");

    const iface = new ethers.Interface([
      "function transfer(address to, bytes calldata encryptedAmount) external returns (bool)",
      "function transferEncrypted(address to, bytes calldata encryptedAmount) external returns (bool)",
      "function confidentialTransfer(address to, bytes calldata encryptedAmount) external returns (bool)"
    ]);

    let data;
    try {
      data = iface.encodeFunctionData("transfer", [to, ciphertext]);
    } catch {
      try {
        data = iface.encodeFunctionData("transferEncrypted", [to, ciphertext]);
      } catch {
        data = iface.encodeFunctionData("confidentialTransfer", [to, ciphertext]);
      }
    }

    return this.sendTransaction(account, {
      to: shieldedTokenAddress,
      value: "0",
      data: data,
      gasLimit: 3000000n // High Gas for FHE
    });
  }
}

export { Network };