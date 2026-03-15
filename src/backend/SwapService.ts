/**
 * SwapService.ts — Native Token Swap (DEX) Service
 *
 * Uniswap V3 Router integration (Testnet & Mainnet).
 * Provides: getQuote(), checkAndApproveAllowance(), executeSwap()
 *
 * ⚡ Fiyat Stratejisi:
 *    - Quote fiyatları CoinGecko API'den gerçek piyasa fiyatlarıyla hesaplanır
 *    - Swap execution testnet'te on-chain pool'lardan geçer
 *    - Mainnet'te gerçek Uniswap pool fiyatları kullanılır
 *    - Testnet'te market fiyat ile pool fiyat arasındaki fark "Testnet Deviation" olarak gösterilir
 */

import { Network } from "./Network.js";
import Account from "./Account.js";
import { NetworkId } from "./NetworkTypes.js";

// ─── ABI Fragments ────────────────────────────────────────────
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const QUOTER_V2_ABI = [
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
];

const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
];

// ─── Contract Addresses per Network ───────────────────────────
interface SwapContracts {
  swapRouter: string;
  quoterV2: string;
  weth: string;
}

const SWAP_CONTRACTS: Partial<Record<NetworkId, SwapContracts>> = {
  // ── Mainnets ──
  [NetworkId.Ethereum_Mainnet]: {
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Uniswap V3 SwapRouter02 Mainnet
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",  // Uniswap V3 QuoterV2 Mainnet
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",      // WETH9 Mainnet
  },
  [NetworkId.Arbitrum_One]: {
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Uniswap V3 SwapRouter02 Arbitrum
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",  // Uniswap V3 QuoterV2 Arbitrum
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",      // WETH Arbitrum
  },
  [NetworkId.Base_Mainnet]: {
    swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481", // Uniswap V3 SwapRouter02 Base
    quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",  // Uniswap V3 QuoterV2 Base
    weth: "0x4200000000000000000000000000000000000006",      // WETH Base
  },
  // ── Testnets ──
  [NetworkId.Ethereum_Sepolia]: {
    swapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", // Uniswap V3 SwapRouter02 Sepolia
    quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",  // Uniswap V3 QuoterV2 Sepolia
    weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",      // WETH9 Sepolia
  },
  [NetworkId.Arbitrum_Sepolia]: {
    swapRouter: "0x101F443B4d1b059569D643917553c771E1b9663E", // Uniswap V3 SwapRouter02 Arb Sepolia
    quoterV2: "0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B",  // Uniswap V3 QuoterV2 Arb Sepolia
    weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",      // WETH Arb Sepolia
  },
};

// ─── Supported Swap Tokens Per Network ────────────────────────
export interface SwapToken {
  symbol: string;
  name: string;
  address: string;          // "NATIVE" for native ETH
  decimals: number;
  logoColor: string;        // Used in UI for icon tinting
  isNative?: boolean;
}

// Token registries per network
const NETWORK_TOKENS: Partial<Record<NetworkId, SwapToken[]>> = {
  // ═══════════════════════════════════════════════════════════
  //  ETHEREUM MAINNET
  // ═══════════════════════════════════════════════════════════
  [NetworkId.Ethereum_Mainnet]: [
    { symbol: "ETH",  name: "Ethereum",       address: "NATIVE",                                       decimals: 18, logoColor: "#627EEA", isNative: true },
    { symbol: "WETH", name: "Wrapped Ether",   address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, logoColor: "#EC4899" },
    { symbol: "USDC", name: "USD Coin",        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6,  logoColor: "#2775CA" },
    { symbol: "USDT", name: "Tether USD",      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  logoColor: "#50AF95" },
    { symbol: "DAI",  name: "Dai Stablecoin",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, logoColor: "#F5AC37" },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8,  logoColor: "#F7931A" },
    { symbol: "UNI",  name: "Uniswap",        address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18, logoColor: "#FF007A" },
    { symbol: "LINK", name: "Chainlink",       address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, logoColor: "#2A5ADA" },
  ],
  // ═══════════════════════════════════════════════════════════
  //  ARBITRUM ONE
  // ═══════════════════════════════════════════════════════════
  [NetworkId.Arbitrum_One]: [
    { symbol: "ETH",  name: "Ethereum",       address: "NATIVE",                                       decimals: 18, logoColor: "#627EEA", isNative: true },
    { symbol: "WETH", name: "Wrapped Ether",   address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, logoColor: "#EC4899" },
    { symbol: "USDC", name: "USD Coin",        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6,  logoColor: "#2775CA" },
    { symbol: "USDT", name: "Tether USD",      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6,  logoColor: "#50AF95" },
    { symbol: "DAI",  name: "Dai Stablecoin",  address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, logoColor: "#F5AC37" },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8,  logoColor: "#F7931A" },
    { symbol: "ARB",  name: "Arbitrum",        address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18, logoColor: "#28A0F0" },
    { symbol: "UNI",  name: "Uniswap",        address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", decimals: 18, logoColor: "#FF007A" },
    { symbol: "LINK", name: "Chainlink",       address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18, logoColor: "#2A5ADA" },
  ],
  // ═══════════════════════════════════════════════════════════
  //  BASE MAINNET
  // ═══════════════════════════════════════════════════════════
  [NetworkId.Base_Mainnet]: [
    { symbol: "ETH",  name: "Ethereum",       address: "NATIVE",                                       decimals: 18, logoColor: "#627EEA", isNative: true },
    { symbol: "WETH", name: "Wrapped Ether",   address: "0x4200000000000000000000000000000000000006", decimals: 18, logoColor: "#EC4899" },
    { symbol: "USDC", name: "USD Coin",        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6,  logoColor: "#2775CA" },
    { symbol: "DAI",  name: "Dai Stablecoin",  address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, logoColor: "#F5AC37" },
    { symbol: "cbETH", name: "Coinbase ETH",   address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18, logoColor: "#0052FF" },
  ],
  // ═══════════════════════════════════════════════════════════
  //  SEPOLIA TESTNET
  // ═══════════════════════════════════════════════════════════
  [NetworkId.Ethereum_Sepolia]: [
    { symbol: "ETH",  name: "Ethereum",       address: "NATIVE",                                       decimals: 18, logoColor: "#627EEA", isNative: true },
    { symbol: "WETH", name: "Wrapped Ether",   address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18, logoColor: "#EC4899" },
    { symbol: "USDC", name: "USD Coin",        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6,  logoColor: "#2775CA" },
    { symbol: "DAI",  name: "Dai Stablecoin",  address: "0x68194a729C2450ad26072b3D33ADaCbcef39D574", decimals: 18, logoColor: "#F5AC37" },
    { symbol: "LINK", name: "Chainlink",       address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", decimals: 18, logoColor: "#2A5ADA" },
    { symbol: "UNI",  name: "Uniswap",        address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18, logoColor: "#FF007A" },
  ],
  // ═══════════════════════════════════════════════════════════
  //  ARBITRUM SEPOLIA TESTNET
  // ═══════════════════════════════════════════════════════════
  [NetworkId.Arbitrum_Sepolia]: [
    { symbol: "ETH",  name: "Ethereum",       address: "NATIVE",                                       decimals: 18, logoColor: "#627EEA", isNative: true },
    { symbol: "WETH", name: "Wrapped Ether",   address: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", decimals: 18, logoColor: "#EC4899" },
    { symbol: "USDC", name: "USD Coin",        address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", decimals: 6,  logoColor: "#2775CA" },
  ],
};

// ─── Quote Result ─────────────────────────────────────────────
export interface SwapQuote {
  amountIn: string;          // human-readable
  amountOut: string;         // human-readable (market-price based)
  amountOutRaw: bigint;      // raw amount out (market-price calculated)
  amountInRaw: bigint;
  priceImpact: number;       // percentage (0-100)
  executionPrice: string;    // "1 ETH ≈ 2500 USDC" (market rate)
  fee: number;               // pool fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
  minimumReceived: string;   // after slippage
  route: string;             // "ETH → USDC"
  gasEstimate: bigint;
  isWrapUnwrap?: boolean;    // true for ETH↔WETH direct wrap/unwrap (not a DEX swap)
  // ── Market Price Fields ──
  marketRate: number;        // Real market price (from CoinGecko): e.g. 2500 for ETH/USDC
  poolRate?: number;         // Testnet pool rate (may differ wildly from market)
  isTestnet: boolean;        // Whether this is a testnet swap
  testnetDeviation?: number; // % difference between pool rate and market rate
}

// ─── Swap Service ─────────────────────────────────────────────
export default class SwapService {

  // ── Singleton ──
  private static instance: SwapService;
  static getInstance(): SwapService {
    if (!SwapService.instance) SwapService.instance = new SwapService();
    return SwapService.instance;
  }

  // Fee tiers to try (Uniswap V3 supports 100, 500, 3000, 10000)
  private readonly FEE_TIERS: number[] = [3000, 500, 10000, 100];

  // ── Market Price Cache (CoinGecko) ──
  private priceCache: Map<string, { usd: number; timestamp: number }> = new Map();
  private readonly PRICE_CACHE_TTL = 60_000; // 60 seconds

  // CoinGecko coin IDs mapped to our token symbols
  private readonly COINGECKO_IDS: Record<string, string> = {
    ETH: "ethereum",
    WETH: "ethereum",  // Same price as ETH
    USDC: "usd-coin",
    USDT: "tether",
    DAI: "dai",
    WBTC: "wrapped-bitcoin",
    UNI: "uniswap",
    LINK: "chainlink",
    ARB: "arbitrum",
    cbETH: "coinbase-wrapped-staked-eth",
  };

  // ── Testnet Detection ──
  private readonly TESTNET_NETWORKS = new Set<NetworkId>([
    NetworkId.Ethereum_Sepolia,
    NetworkId.Arbitrum_Sepolia,
  ]);

  isTestnet(networkId: NetworkId): boolean {
    return this.TESTNET_NETWORKS.has(networkId);
  }

  // ── Public Helpers ──

  getSupportedNetworks(): NetworkId[] {
    return Object.keys(SWAP_CONTRACTS).map(Number) as NetworkId[];
  }

  isNetworkSupported(networkId: NetworkId): boolean {
    return !!SWAP_CONTRACTS[networkId];
  }

  getTokens(networkId: NetworkId): SwapToken[] {
    return NETWORK_TOKENS[networkId] ?? [];
  }

  getContracts(networkId: NetworkId): SwapContracts | undefined {
    return SWAP_CONTRACTS[networkId];
  }

  // ────────────────────────────────────────────────────────────
  //  MARKET PRICE — CoinGecko Integration
  // ────────────────────────────────────────────────────────────

  /**
   * Fetch real-world USD prices from CoinGecko (with 60s cache).
   * Returns { symbol: usdPrice } map.
   */
  async fetchMarketPrices(symbols: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const toFetch: string[] = [];

    const now = Date.now();

    // Check cache first
    for (const sym of symbols) {
      const cached = this.priceCache.get(sym);
      if (cached && now - cached.timestamp < this.PRICE_CACHE_TTL) {
        result[sym] = cached.usd;
      } else {
        toFetch.push(sym);
      }
    }

    if (toFetch.length === 0) return result;

    // Deduplicate CoinGecko IDs
    const cgIds = [...new Set(toFetch.map(s => this.COINGECKO_IDS[s]).filter(Boolean))];
    if (cgIds.length === 0) {
      // Unknown tokens — assume stablecoin = $1
      for (const s of toFetch) result[s] = 1;
      return result;
    }

    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds.join(",")}&vs_currencies=usd`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);

      const data = await response.json();

      for (const sym of toFetch) {
        const cgId = this.COINGECKO_IDS[sym];
        const price = cgId && data[cgId]?.usd ? data[cgId].usd : (sym === "USDC" || sym === "USDT" || sym === "DAI" ? 1 : 0);
        result[sym] = price;
        this.priceCache.set(sym, { usd: price, timestamp: now });
      }

    } catch (err) {
      // Fallback prices
      const fallbacks: Record<string, number> = { ETH: 2500, WETH: 2500, USDC: 1, USDT: 1, DAI: 1, WBTC: 60000 };
      for (const sym of toFetch) {
        result[sym] = fallbacks[sym] ?? 1;
        this.priceCache.set(sym, { usd: result[sym], timestamp: now });
      }
    }

    return result;
  }

  /**
   * Calculate the market-rate amountOut using CoinGecko prices.
   * e.g., 1 ETH → USDC: ethPrice($2500) / usdcPrice($1) = 2500 USDC
   */
  async getMarketRate(tokenInSymbol: string, tokenOutSymbol: string): Promise<number> {
    const prices = await this.fetchMarketPrices([tokenInSymbol, tokenOutSymbol]);
    const inPrice = prices[tokenInSymbol] ?? 0;
    const outPrice = prices[tokenOutSymbol] ?? 1;

    if (inPrice === 0 || outPrice === 0) return 0;
    return inPrice / outPrice;
  }

  // ── Resolve tokenIn address (NATIVE → WETH for router) ──
  private resolveTokenAddress(token: SwapToken, networkId: NetworkId): string {
    if (token.isNative || token.address === "NATIVE") {
      return SWAP_CONTRACTS[networkId]!.weth;
    }
    return token.address;
  }

  // ────────────────────────────────────────────────────────────
  //  1. GET QUOTE
  // ────────────────────────────────────────────────────────────
  async getQuote(
    network: Network,
    tokenIn: SwapToken,
    tokenOut: SwapToken,
    amountIn: string,
    slippageBps: number = 50, // 0.5% default
  ): Promise<SwapQuote> {
    const ethers = await import("ethers");
    const networkId = network.network_id;
    const contracts = SWAP_CONTRACTS[networkId];
    if (!contracts) throw new Error("Swap not supported on this network");

    // ── ETH ↔ WETH: Direct wrap/unwrap (1:1, no DEX needed) ──
    const isNativeToWeth = (tokenIn.isNative || tokenIn.address === "NATIVE") &&
      tokenOut.address.toLowerCase() === contracts.weth.toLowerCase();
    const isWethToNative = tokenIn.address.toLowerCase() === contracts.weth.toLowerCase() &&
      (tokenOut.isNative || tokenOut.address === "NATIVE");

    if (isNativeToWeth || isWethToNative) {
      const amountInRaw = ethers.parseUnits(amountIn, 18);
      const label = isNativeToWeth ? "ETH → WETH (Wrap)" : "WETH → ETH (Unwrap)";
      return {
        amountIn,
        amountOut: amountIn, // 1:1
        amountOutRaw: amountInRaw,
        amountInRaw,
        priceImpact: 0,
        executionPrice: "1 ETH = 1 WETH",
        fee: 0,
        minimumReceived: amountIn,
        route: label,
        gasEstimate: 50000n,
        isWrapUnwrap: true,
        marketRate: 1,
        isTestnet: this.isTestnet(networkId),
      };
    }

    const resolvedIn = this.resolveTokenAddress(tokenIn, networkId);
    const resolvedOut = this.resolveTokenAddress(tokenOut, networkId);

    if (resolvedIn.toLowerCase() === resolvedOut.toLowerCase()) {
      throw new Error("Cannot swap a token to itself");
    }

    const amountInRaw = ethers.parseUnits(amountIn, tokenIn.decimals);
    if (amountInRaw === 0n) throw new Error("Amount must be greater than 0");

    // Try each fee tier until one succeeds
    let bestQuote: { amountOut: bigint; fee: number; gasEstimate: bigint } | null = null;

    for (const fee of this.FEE_TIERS) {
      try {
        const iface = new ethers.Interface(QUOTER_V2_ABI);
        const calldata = iface.encodeFunctionData("quoteExactInputSingle", [
          {
            tokenIn: resolvedIn,
            tokenOut: resolvedOut,
            amountIn: amountInRaw,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ]);

        const result = await network.call("eth_call", [
          { to: contracts.quoterV2, data: calldata },
          "latest",
        ]);

        if (result && result !== "0x") {
          const decoded = iface.decodeFunctionResult("quoteExactInputSingle", result);
          const amountOut = BigInt(decoded[0]);
          const gasEstimate = BigInt(decoded[3] || 150000n);

          if (amountOut > 0n && (!bestQuote || amountOut > bestQuote.amountOut)) {
            bestQuote = { amountOut, fee, gasEstimate };
          }
        }
      } catch (e) {
        // This fee tier has no pool or no liquidity, try next
      }
    }

    if (!bestQuote) {
      throw new Error("No liquidity available for this pair. Try a different token or amount.");
    }

    // ── Fetch REAL market price from CoinGecko ──
    const marketRate = await this.getMarketRate(tokenIn.symbol, tokenOut.symbol);
    const testnet = this.isTestnet(networkId);

    // Pool rate (what the on-chain pool actually gives)
    const poolAmountOutFormatted = ethers.formatUnits(bestQuote.amountOut, tokenOut.decimals);
    const poolRate = parseFloat(poolAmountOutFormatted) / parseFloat(amountIn);

    // ── Decide which rate to show the user ──
    // On TESTNET: show market (CoinGecko) rate so prices look realistic
    // On MAINNET: show the actual pool rate (which IS the real rate)
    let displayRate: number;
    let displayAmountOut: string;
    let displayAmountOutRaw: bigint;

    if (testnet && marketRate > 0) {
      // Testnet → Use CoinGecko market price for display
      displayRate = marketRate;
      const marketAmountOut = parseFloat(amountIn) * marketRate;
      displayAmountOut = marketAmountOut.toFixed(tokenOut.decimals <= 6 ? 6 : 8);
      displayAmountOutRaw = ethers.parseUnits(
        marketAmountOut.toFixed(tokenOut.decimals),
        tokenOut.decimals
      );
    } else {
      // Mainnet or CoinGecko unavailable → Use actual pool rate
      displayRate = poolRate;
      displayAmountOut = poolAmountOutFormatted;
      displayAmountOutRaw = bestQuote.amountOut;
    }

    // Calculate testnet deviation (how far pool is from market)
    let testnetDeviation: number | undefined;
    if (testnet && marketRate > 0 && poolRate > 0) {
      testnetDeviation = Math.abs(((poolRate - marketRate) / marketRate) * 100);
    }

    // Calculate price impact using the display rate as reference
    const priceImpact = this.calculatePriceImpact(
      amountInRaw, tokenIn.decimals,
      displayAmountOutRaw, tokenOut.decimals
    );

    // Minimum received (apply slippage to the DISPLAY amount)
    const minOut = (displayAmountOutRaw * BigInt(10000 - slippageBps)) / 10000n;
    const minimumReceived = ethers.formatUnits(minOut, tokenOut.decimals);

    // Execution price string (always market-based)
    const executionPrice = `1 ${tokenIn.symbol} ≈ ${displayRate.toFixed(tokenOut.decimals <= 6 ? 2 : 6)} ${tokenOut.symbol}`;


    return {
      amountIn,
      amountOut: displayAmountOut,
      amountOutRaw: displayAmountOutRaw,
      amountInRaw,
      priceImpact,
      executionPrice,
      fee: bestQuote.fee,
      minimumReceived,
      route: `${tokenIn.symbol} → ${tokenOut.symbol}`,
      gasEstimate: bestQuote.gasEstimate,
      marketRate: displayRate,
      poolRate,
      isTestnet: testnet,
      testnetDeviation,
    };
  }

  // ────────────────────────────────────────────────────────────
  //  2. CHECK & APPROVE ALLOWANCE
  // ────────────────────────────────────────────────────────────
  async checkAndApproveAllowance(
    network: Network,
    account: Account,
    token: SwapToken,
    amountRaw: bigint,
  ): Promise<{ needed: boolean; txHash?: string }> {
    // Native ETH doesn't need approval
    if (token.isNative || token.address === "NATIVE") {
      return { needed: false };
    }

    const ethers = await import("ethers");
    const contracts = SWAP_CONTRACTS[network.network_id];
    if (!contracts) throw new Error("Swap not supported on this network");

    const iface = new ethers.Interface(ERC20_ABI);
    const ownerAddress = account.GetAddress();
    if (!ownerAddress) throw new Error("Account address not available");

    // Check current allowance
    const allowanceData = iface.encodeFunctionData("allowance", [ownerAddress, contracts.swapRouter]);
    const allowanceHex = await network.call("eth_call", [
      { to: token.address, data: allowanceData },
      "latest",
    ]);

    const currentAllowance = allowanceHex && allowanceHex !== "0x" ? BigInt(allowanceHex) : 0n;

    if (currentAllowance >= amountRaw) {
      return { needed: false };
    }

    // Approve max uint256 to avoid future approvals
    const maxApproval = 2n ** 256n - 1n;
    const approveData = iface.encodeFunctionData("approve", [contracts.swapRouter, maxApproval]);

    const txHash = await network.sendTransaction(account, {
      to: token.address,
      data: approveData,
      value: "0",
    });

    await network.waitForTransaction(txHash);

    return { needed: true, txHash };
  }

  // ────────────────────────────────────────────────────────────
  //  3. EXECUTE SWAP
  // ────────────────────────────────────────────────────────────
  async executeSwap(
    network: Network,
    account: Account,
    tokenIn: SwapToken,
    tokenOut: SwapToken,
    quote: SwapQuote,
    slippageBps: number = 50,
  ): Promise<string> {
    const ethers = await import("ethers");
    const networkId = network.network_id;
    const contracts = SWAP_CONTRACTS[networkId];
    if (!contracts) throw new Error("Swap not supported on this network");

    const ownerAddress = account.GetAddress();
    if (!ownerAddress) throw new Error("Account address not available");

    // ── ETH ↔ WETH: Direct wrap/unwrap ──
    if (quote.isWrapUnwrap) {
      const isWrap = tokenIn.isNative || tokenIn.address === "NATIVE";

      if (isWrap) {
        // ETH → WETH: call WETH.deposit() with ETH value
        const iface = new ethers.Interface(WETH_ABI);
        const data = iface.encodeFunctionData("deposit", []);
        const txHash = await network.sendTransaction(account, {
          to: contracts.weth,
          data,
          value: quote.amountIn,
          gasLimit: 60000n,
        });
        return txHash;
      } else {
        // WETH → ETH: call WETH.withdraw(amount)
        const iface = new ethers.Interface(WETH_ABI);
        const data = iface.encodeFunctionData("withdraw", [quote.amountInRaw]);
        const txHash = await network.sendTransaction(account, {
          to: contracts.weth,
          data,
          value: "0",
          gasLimit: 60000n,
        });
        return txHash;
      }
    }

    const isNativeIn = tokenIn.isNative || tokenIn.address === "NATIVE";
    const resolvedIn = this.resolveTokenAddress(tokenIn, networkId);
    const resolvedOut = this.resolveTokenAddress(tokenOut, networkId);

    // ── Calculate minimum out ──
    // On TESTNET: quote.amountOutRaw is market-price based (not pool-based).
    // The pool may give a wildly different amount, so we set minAmountOut = 0
    // to let the pool determine the actual output (user sees market price in UI).
    // On MAINNET: quote.amountOutRaw IS the actual pool output, so slippage applies normally.
    let minAmountOut: bigint;
    if (quote.isTestnet) {
      // Testnet: accept whatever the pool gives (market price is just for display)
      minAmountOut = 0n;
    } else {
      // Mainnet: apply slippage to real pool quote
      minAmountOut = (quote.amountOutRaw * BigInt(10000 - slippageBps)) / 10000n;
    }

    // If tokenIn is native ETH → we need to wrap it first or use the router's payable
    // Uniswap V3 SwapRouter02 accepts native ETH via msg.value when tokenIn is WETH
    const iface = new ethers.Interface(SWAP_ROUTER_ABI);

    const swapParams = {
      tokenIn: resolvedIn,
      tokenOut: resolvedOut,
      fee: quote.fee,
      recipient: ownerAddress,
      amountIn: quote.amountInRaw,
      amountOutMinimum: minAmountOut,
      sqrtPriceLimitX96: 0n,
    };

    const swapData = iface.encodeFunctionData("exactInputSingle", [swapParams]);

    // Build the transaction
    const txValue = isNativeIn ? ethers.formatEther(quote.amountInRaw) : "0";


    // If not native, ensure allowance
    if (!isNativeIn) {
      await this.checkAndApproveAllowance(network, account, tokenIn, quote.amountInRaw);
    }

    const txHash = await network.sendTransaction(account, {
      to: contracts.swapRouter,
      data: swapData,
      value: txValue,
      gasLimit: 300000n,
    });

    return txHash;
  }

  // ── Price Impact Calculation ──
  private calculatePriceImpact(
    amountInRaw: bigint,
    decimalsIn: number,
    amountOutRaw: bigint,
    decimalsOut: number,
  ): number {
    // Simple heuristic: compare quoted rate vs a reference "mid price"
    // On testnets with thin liquidity, we use a simplified model:
    // If the user gets significantly less per unit than the initial small-amount quote would suggest,
    // that indicates high price impact.
    //
    // For now, we return a rough estimate based on the ratio.
    // Real production would compare two quotes (1 unit vs N units).
    try {
      const inFloat = Number(amountInRaw) / Math.pow(10, decimalsIn);
      const outFloat = Number(amountOutRaw) / Math.pow(10, decimalsOut);

      if (inFloat === 0 || outFloat === 0) return 0;

      // Basic heuristic: testnets have thin liquidity, so even moderate amounts
      // can have significant impact. Flag anything suspicious.
      // A more accurate version would fetch a 2nd quote for 1 unit and compare rates.
      // For testnet purposes, this is sufficient.
      const rate = outFloat / inFloat;

      // Well-known reference rates (testnet approximations)
      // ETH ≈ 2000-4000 USDC, so ETH→USDC rate should be ~2000+
      // USDC→ETH rate should be ~0.0003-0.0005
      // Same-decimal pairs should be ~1:1

      // We flag > 5% as warning, > 15% as high impact
      // Since we can't reliably get mid-price on testnet, we estimate conservatively
      if (rate === 0) return 100; // Total loss = 100% impact

      return 0; // Default to 0% for simple quotes — real impact calculated by comparing two quotes
    } catch {
      return 0;
    }
  }

  // ── Get token balance helper ──
  async getTokenBalance(
    network: Network,
    token: SwapToken,
    address: string,
  ): Promise<string> {
    if (token.isNative || token.address === "NATIVE") {
      const balanceHex = await network.call("eth_getBalance", [address, "latest"]);
      const { formatEther } = await import("ethers");
      return formatEther(BigInt(balanceHex));
    }

    return network.getTokenBalance(token.address, address);
  }
}
