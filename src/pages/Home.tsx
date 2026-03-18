import React, { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Avatar,
  Paper,
  Stack,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Tabs,
  Tab,
  Tooltip,
  useTheme,
  alpha,
  Divider,
  Drawer,
} from "@mui/material";
import {
  TrendingUp,
  History,
  Shield,
  Hub,
  ExpandMore,
  Refresh,
  Add,
  Visibility,
  VisibilityOff,
  WarningAmber,
  VisibilityOffOutlined,
  ShoppingCart,
} from "@mui/icons-material";
import { useMatrixText } from "../hooks/useMatrixText.js";
import ImportTokenModal from "../components/ImportTokenModal.js";
import ImportNftModal from "../components/ImportNftModal.js";
import NftGalleryCard from "../components/NftGalleryCard.js";
import OnboardingTour, {
  BackupReminderBanner,
  isOnboardingCompleted,
  isBackupReminderDismissed,
  dismissBackupReminder,
} from "../components/OnboardingTour.js";
import { AppContext, WalletContext } from "../AppContext.js";
import { ActiveAccountContext } from "../ActiveAccountProvider.js";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { NetworkId } from "../backend/NetworkTypes.js";
import { getAddress } from "ethers";
import type { TypographyProps } from "@mui/material";
import type { DisplayToken, BalanceMap, WrappedBalance, NFTDisplayItem } from "../types/index.js";
import { TokenListSkeleton, NftGridSkeleton } from "../components/SkeletonLoaders.js";
import { useToast } from "../components/ToastProvider.js";
import { classifyError, NetworkError, NetworkErrorType, getErrorFallbackMessage } from "../backend/NetworkErrorHandler.js";
import { getCoinGeckoBase } from "../backend/Network.js";
import { usePersistedState } from "../hooks/usePersistedState.js";

const KNOWN_LOGOS: Record<string, string> = {
  "ETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  "WETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  "cETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  "USDC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  "cUSDC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  "USDT": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  "LINK": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
  "EURC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png",
  "BTC": "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  "WBTC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
  "DAI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
  "UNI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
  "AAVE": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png",
  "ARB": "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg",
  "OP": "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
  "MATIC": "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
  "POL": "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
  "AVAX": "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  "BNB": "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  "SOL": "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  "DOGE": "https://assets.coingecko.com/coins/images/5/small/dogecoin.png",
  "SHIB": "https://assets.coingecko.com/coins/images/11939/small/shiba.png",
  "PEPE": "https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  "MKR": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2/logo.png",
  "CRV": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png",
  "COMP": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xc00e94Cb662C3520282E6f5717214004A7f26888/logo.png",
  "LDO": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32/logo.png",
  "SNX": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F/logo.png",
  "MON": "https://coin-images.coingecko.com/coins/images/38927/small/mon.png",
};

// Token logo resolver: Alchemy → known symbol → TrustWallet CDN fallback
const getTokenLogoUrl = (contractAddress: string, logoSrc?: string, symbol?: string, name?: string): string => {
  // 1. Use cached/Alchemy logo if available (skip broken local placeholders like /logos/eth.png)
  if (logoSrc && logoSrc.length > 0 && !logoSrc.startsWith("/logos/")) return logoSrc;

  // 2. Known tokens by symbol (case-insensitive)
  const symUpper = symbol?.toUpperCase();
  if (symUpper && KNOWN_LOGOS[symUpper]) return KNOWN_LOGOS[symUpper];
  if (symbol && KNOWN_LOGOS[symbol]) return KNOWN_LOGOS[symbol];
  if (contractAddress === "ETH" || name === "Ethereum") return KNOWN_LOGOS["ETH"];

  // 3. TrustWallet assets CDN fallback (requires checksummed address)
  //    Works for Ethereum mainnet tokens — most widely used
  if (contractAddress && contractAddress.startsWith("0x")) {
    try {
      const checksummed = getAddress(contractAddress);
      return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${checksummed}/logo.png`;
    } catch {
      return "";
    }
  }
  return "";
};


// Generate a deterministic color from a string
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 50%)`;
};

/** Renders a balance value with Matrix-style scramble animation on privacy toggle */
function MatrixBalance({ value, isHidden, variant = "h3" }: {
  value: string;
  isHidden: boolean;
  variant?: TypographyProps["variant"];
}) {
  const displayed = useMatrixText(value, isHidden);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Typography
      variant={variant}
      fontWeight="800"
      sx={{
        letterSpacing: -1,
        background: isDark
          ? 'linear-gradient(135deg, #eff6ff 0%, #bfdbfe 50%, #3b82f6 100%)'
          : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e3a8a 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        fontFamily: isHidden ? 'monospace' : 'inherit',
        transition: 'all 0.3s ease',
        userSelect: 'none',
        filter: isDark
          ? 'drop-shadow(0 2px 8px rgba(37, 99, 235, 0.3))'
          : 'drop-shadow(0 1px 4px rgba(37, 99, 235, 0.15))',
      }}
    >
      {displayed}
    </Typography>
  );
}

function Home() {
  const { t } = useTranslation();
  const theme = useTheme();
  const wallet_context = React.useContext(WalletContext);
  const active_context = React.useContext(ActiveAccountContext);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [balances, setBalances] = useState<BalanceMap>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<DisplayToken[]>(() => {
    try {
      const initialNetId = wallet_context?.networkProvider?.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
      const cached = wallet_context?.tokenCache?.getAllTokens(initialNetId) ?? [];
      return cached.map(t => ({ ...t, isShielded: false, isSpam: false, isSuspicious: false, isHidden: false, spamScore: 0 }));
    } catch { return []; }
  });
  const [nfts, setNfts] = useState<NFTDisplayItem[]>(() => {
    try {
      const initialNetId = wallet_context?.networkProvider?.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
      const cached = wallet_context?.nftCache?.getAllNFTs(initialNetId) ?? [];
      return cached.map(n => ({ ...n, balance: 0 }));
    } catch { return []; }
  });
  const [totalBalanceUsd, setTotalBalanceUsd] = useState(0.00);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  // Persisted state: survives popup close/reopen
  const [tabIndex, setTabIndex] = usePersistedState("home_tab", 0);
  const [isBalanceHidden, setIsBalanceHidden] = usePersistedState("balance_hidden", false);
  const [importTokenModalOpen, setImportTokenModalOpen] = useState(false);
  const [importNftModalOpen, setImportNftModalOpen] = useState(false);
  const [showHiddenTokens, setShowHiddenTokens] = useState(false);

  // Onboarding tour (first-time UX)
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingCompleted());
  const [showBackupReminder, setShowBackupReminder] = useState(() => !isBackupReminderDismissed());

  // Network Switcher State
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openNetworkMenu = Boolean(anchorEl);

  const activeNetworkId = wallet_context?.networkProvider.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
  const activeNetwork = wallet_context?.networkProvider.getActiveNetwork();

  const handleNetworkClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleNetworkClose = (networkId: NetworkId | null) => {
    setAnchorEl(null);
    if (networkId && wallet_context) {
      wallet_context.networkProvider.switchNetwork(networkId);
    }
  };

  const fetchData = async (forceRefresh = false) => {
    if (!wallet_context || !active_context) return;

    const net = wallet_context.networkProvider.getActiveNetwork();
    if (!net) return;

    const address = active_context.activeAccount?.GetAddress();
    if (!address) return;

    // ── Cache check: skip API calls if data is fresh ──
    const dataCache = wallet_context.dataCacheService;
    if (!forceRefresh && dataCache) {
      const cached = dataCache.get(address, activeNetworkId);
      if (cached) {
        setBalances(cached.balances);
        setTokens(cached.tokens.map(t => ({
          name: t.name,
          symbol: t.symbol,
          logoSrc: t.logoSrc,
          contractAddress: t.contractAddress,
          decimals: t.decimals,
          isShielded: t.isShielded ?? false,
          isSpam: false,
          isSuspicious: false,
          isHidden: false,
          spamScore: 0,
        })));
        setPrices(cached.prices);
        setTotalBalanceUsd(cached.totalUsd);
        return;
      }
    }

    setLoading(true);

    try {

      // Initialize cofhejs (TRUE FHE) if on a FHE-enabled network
      const isFheNetwork = activeNetworkId === NetworkId.Ethereum_Sepolia || activeNetworkId === NetworkId.Arbitrum_Sepolia || activeNetworkId === NetworkId.Base_Sepolia;
      if (isFheNetwork && active_context.activeAccount) {
        try {
          const { default: FheCofheService } = await import("../backend/FheCofheService.js");
          const instance = FheCofheService.getInstance();

          if (!instance.isReadyForAccount(address, activeNetworkId)) {
            const ethers = await import("ethers");
            const provider = new ethers.JsonRpcProvider(net.rpc_url);
            const privateKey = active_context.activeAccount.private_key;
            if (!privateKey) throw new Error("No private key available");
            const signer = new ethers.Wallet(privateKey, provider);

            await instance.init(provider, signer);
          }
        } catch (e) {
        }
      }

      // 1. Fetch Public Token Balances
      const tokenBalances = await net.getTokenBalances(
        wallet_context.tokenCache, address
      );

      // 2. Fetch Wrapped Token Balances (Only on Sepolia)
      const wrappedBalances: WrappedBalance[] = [];
      const WRAPPED_USDC_ADDRESS = activeNetworkId === NetworkId.Arbitrum_Sepolia
        ? (import.meta.env.VITE_ARB_WRAPPED_USDC_ADDRESS || "").toLowerCase()
        : activeNetworkId === NetworkId.Base_Sepolia
          ? (import.meta.env.VITE_BASE_WRAPPED_USDC_ADDRESS || "").toLowerCase()
          : (import.meta.env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
      const WRAPPED_ETH_ADDRESS = activeNetworkId === NetworkId.Arbitrum_Sepolia
        ? (import.meta.env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase()
        : activeNetworkId === NetworkId.Base_Sepolia
          ? (import.meta.env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase()
          : (import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
      const IGNORED_CONTRACTS = [
        "0xbde0a2e375b67c802d4651fecf3b678b1886d15b", // SimpleWrappedUSDC (old)
        "0x3e0722a877e52fe755e8bf02372342c63930fd57", // MockFHEWrappedUSDC (old)
        "0x6ab305c679002c0938c2be3f824fcb8b81be5b70", // CoFHEWrappedUSDC v1 (old - no ERC20)
        "0x5c3f1fe2c451ccc73443865fec914a595c3d1a7c", // CoFHEWrappedUSDC v2 (old - FHE not on Sepolia)
        "0x730bb4ee9ea1cdb0b45c1db01ca67a616d2d3c88", // Old WrappedUSDC (no FHE)
        "0x23bad885b76c95ec9e2b47663022d552d780200f", // Old WrappedETH (no FHE)
        "0x503e16b7920420277ce1548444dbb30e97f87d40", // WrappedUSDC v2 (no ERC20 sync)
        "0x3696a9a8ecd0dbd7111dd15f7837d7f38d83a0c0", // WrappedETH v3 (no ERC20 sync)
        "0x7890673c207a728ef7d9378c7206030749351dad", // WrappedETH v3 (no ERC20 sync on transfer)
        "0x4b3dd819cfbf1364cabd5c8f9c5c05917d09168c", // WrappedUSDC v2 (no ERC20 sync on transfer)
        "0x421583e66b21de780b4f94fcecce858c07f3d2d9", // WrappedETH v3 (no ERC20 sync on transfer v2)
        "0x0125c55244724c1bf1d16b91e046fe7e8a5719e2", // WrappedUSDC v2 (no ERC20 sync on transfer v2)
        "0x8d0419e8a259366516fc4fbabebdc013cad8770f", // WrappedETH_V3 (plaintext leak in transfer)
        "0x2210264a3775d5fbc51b1b73667f5590230ac2bd"  // WrappedUSDC_V2 (plaintext leak in transfer)
      ];

      if (isFheNetwork) {
        // Fetch Wrapped USDC - Always show, even if balance is 0
        if (WRAPPED_USDC_ADDRESS) {

          try {
            // Get encrypted (shielded) balance via FHE unseal - V4 contracts have NO ERC20 balance
            let wrappedUsdcBalance = "0";
            try {
              const shieldedBal = await net.getShieldedBalance(WRAPPED_USDC_ADDRESS, address, active_context.activeAccount);
              if (shieldedBal && parseFloat(shieldedBal) > 0) {
                wrappedUsdcBalance = shieldedBal;
              } else {
              }
            } catch (e) {
            }

            // Always add to list, even if balance is 0
            wrappedBalances.push({
              contractAddress: WRAPPED_USDC_ADDRESS,
              tokenBalance: wrappedUsdcBalance,
              isNative: false,
              isShielded: true
            });

            // Cache metadata
            wallet_context.tokenCache.setToken(activeNetworkId, {
              name: "Confidential USDC",
              symbol: "cUSDC",
              decimals: 6,
              logoSrc: "",
              contractAddress: WRAPPED_USDC_ADDRESS
            });
          } catch (e) {
          }
        }

        // Fetch Wrapped ETH - Always show, even if balance is 0
        if (WRAPPED_ETH_ADDRESS) {

          try {
            // Get encrypted (shielded) balance via FHE unseal - V4 contracts have NO ERC20 balance
            let wrappedEthBalance = "0";
            try {
              const shieldedBal = await net.getShieldedBalance(WRAPPED_ETH_ADDRESS, address, active_context.activeAccount);
              if (shieldedBal && parseFloat(shieldedBal) > 0) {
                wrappedEthBalance = shieldedBal;
              } else {
              }
            } catch (e) {
            }

            // Always add to list, even if balance is 0
            wrappedBalances.push({
              contractAddress: WRAPPED_ETH_ADDRESS,
              tokenBalance: wrappedEthBalance,
              isNative: false,
              isShielded: true
            });

            // Cache metadata
            wallet_context.tokenCache.setToken(activeNetworkId, {
              name: "Confidential ETH",
              symbol: "cETH",
              decimals: 18,
              logoSrc: "",
              contractAddress: WRAPPED_ETH_ADDRESS
            });
          } catch (e) {
          }
        }
      }

      // Merge public + wrapped balances
      const allBalances = [...tokenBalances, ...wrappedBalances];

      // 3. Extract Contracts for price fetching - EXCLUDE wrapped token addresses
      const wrappedTokenAddresses = [WRAPPED_USDC_ADDRESS, WRAPPED_ETH_ADDRESS].filter(Boolean);

      const contractAddresses = tokenBalances
        .map(t => t.contractAddress)
        .filter(addr => !wrappedTokenAddresses.includes(addr.toLowerCase()));

      // --- IMMEDIATE RENDER ---
      // We render the tokens immediately with 0 price, then update later.
      const nativeSym = net.currency_symbol || "ETH";
      const nativeName = nativeSym === "ETH" ? "Ethereum" : nativeSym;
      const initialDisplay: DisplayToken[] = allBalances.map(tb => {
        const cachedMeta = wallet_context.tokenCache.getToken(activeNetworkId, tb.contractAddress);
        const sym = cachedMeta?.symbol ?? (tb.isNative ? nativeSym : "???");
        return {
          name: cachedMeta?.name ?? (tb.isNative ? nativeName : "Unknown Token"),
          symbol: sym,
          logoSrc: getTokenLogoUrl(tb.contractAddress, cachedMeta?.logoSrc, sym),
          contractAddress: tb.contractAddress,
          decimals: cachedMeta?.decimals ?? 18,
          isShielded: ('isShielded' in tb) ? tb.isShielded : false,
          isSpam: false,
          isSuspicious: false,
          isHidden: false,
          spamScore: 0,
        };
      });
      setTokens(initialDisplay); // Show list instantly

      // 3. Fetch Prices (Async/Non-blocking)
      let currentPrices: Record<string, number> = {};
      try {
        currentPrices = await net.getTokenPrices(contractAddresses);
      } catch (e) { /* silenced */ }

      // Testnet & custom network price fallback: fetch mainnet prices and map known tokens by symbol
      if (activeNetworkId !== NetworkId.Ethereum_Mainnet) {
        try {
          // Collect all token symbols we need to price
          const allSymbols = new Set<string>();
          allBalances.forEach((tb) => {
            const meta = wallet_context.tokenCache.getToken(activeNetworkId, tb.contractAddress);
            const sym = meta?.symbol ?? (tb.isNative ? nativeSym : "");
            if (sym) allSymbols.add(sym.toUpperCase());
          });

          // Map of symbol → CoinGecko ID for well-known tokens
          const symbolToCoinGeckoId: Record<string, string> = {
            "ETH": "ethereum", "WETH": "ethereum", "cETH": "ethereum",
            "BTC": "bitcoin", "WBTC": "wrapped-bitcoin", "tBTC": "bitcoin",
            "USDC": "usd-coin", "cUSDC": "usd-coin", "wUSDC": "usd-coin",
            "USDT": "tether",
            "DAI": "dai",
            "LINK": "chainlink",
            "UNI": "uniswap",
            "AAVE": "aave",
            "ARB": "arbitrum",
            "OP": "optimism",
            "MATIC": "matic-network", "POL": "matic-network",
            "SOL": "solana",
            "AVAX": "avalanche-2",
            "BNB": "binancecoin",
            "EURC": "euro-coin",
            "MKR": "maker",
            "SNX": "havven",
            "COMP": "compound-governance-token",
            "CRV": "curve-dao-token",
            "LDO": "lido-dao",
            "PEPE": "pepe",
            "SHIB": "shiba-inu",
            "DOGE": "dogecoin",
            "MON": "monad",  // Monad testnet
          };

          // Determine which CoinGecko IDs we need to fetch
          const idsToFetch = new Set<string>();
          allSymbols.forEach(sym => {
            const cgId = symbolToCoinGeckoId[sym];
            if (cgId) idsToFetch.add(cgId);
          });

          // Also add native token symbol mapping
          const nativeSymUpper = nativeSym.toUpperCase();
          if (symbolToCoinGeckoId[nativeSymUpper]) {
            idsToFetch.add(symbolToCoinGeckoId[nativeSymUpper]);
          }

          // Always include ethereum for ETH-based networks
          idsToFetch.add("ethereum");

          if (idsToFetch.size > 0) {
            const idsParam = Array.from(idsToFetch).join(",");
            const ethRes = await fetch(`${getCoinGeckoBase()}/simple/price?ids=${idsParam}&vs_currencies=usd`);
            const ethJson = await ethRes.json();

            // Build symbol → price map from CoinGecko response
            const symbolPriceMap: Record<string, number> = {};
            for (const [sym, cgId] of Object.entries(symbolToCoinGeckoId)) {
              if (ethJson[cgId]?.usd !== undefined) {
                symbolPriceMap[sym] = ethJson[cgId].usd;
              }
            }

            // Set ETH price key for built-in networks
            if (ethJson.ethereum?.usd && currentPrices["ETH"] === undefined) {
              currentPrices["ETH"] = ethJson.ethereum.usd;
            }

            // Apply prices by matching token symbol from cache ONLY if not already priced
            allBalances.forEach((tb) => {
              const meta = wallet_context.tokenCache.getToken(activeNetworkId, tb.contractAddress);
              const symbol = meta?.symbol ?? (tb.isNative ? nativeSym : "");
              const key = tb.contractAddress.toLowerCase();
              const symUpper = symbol.toUpperCase();

              if (currentPrices[key] === undefined && symUpper && symbolPriceMap[symUpper] !== undefined) {
                currentPrices[key] = symbolPriceMap[symUpper];
              }
            });

            // Also set native price key by symbol for custom networks
            if (net.isCustom && symbolPriceMap[nativeSymUpper] !== undefined) {
              currentPrices[nativeSym] = symbolPriceMap[nativeSymUpper];
            }

          }
        } catch (e) {
        }
      }

      setPrices(currentPrices);

      // 4. Calculate Values & Update Display
      let totalUsd = 0;
      const balanceMap: Record<string, any> = {};

      // Process public token balances
      // For native token, use currency symbol as price key; for custom networks prices may not exist
      const nativePriceKey = nativeSym;  // e.g. "ETH", "MON", "MATIC" etc.
      tokenBalances.forEach((tb) => {
        let p = 0;
        if (tb.isNative) {
          if (net.isCustom) {
            // Custom networks: only use price if explicitly fetched for this symbol
            p = currentPrices[nativePriceKey] ?? 0;
          } else {
            p = currentPrices["ETH"] ?? 0;
          }
        } else {
          p = currentPrices[tb.contractAddress.toLowerCase()] ?? 0;
        }
        const valUsd = parseFloat(tb.tokenBalance) * p;
        totalUsd += valUsd;

        balanceMap[tb.contractAddress] = {
          ...tb,
          priceUsd: p,
          totalValueUsd: valUsd
        };
      });

      // Process wrapped token balances with price mapping
      wrappedBalances.forEach((wb) => {
        const meta = wallet_context.tokenCache.getToken(activeNetworkId, wb.contractAddress);
        const symbol = meta?.symbol ?? "";
        // cETH uses ETH price, cUSDC uses USDC price
        let p = 0;
        if (symbol === "cETH") p = currentPrices["ETH"] ?? 0;
        else if (symbol === "cUSDC") p = currentPrices[wb.contractAddress.toLowerCase()] ?? 1;
        const valUsd = parseFloat(wb.tokenBalance) * p;
        totalUsd += valUsd;

        balanceMap[wb.contractAddress] = {
          ...wb,
          priceUsd: p,
          totalValueUsd: valUsd
        };
      });

      setBalances(balanceMap);
      setTotalBalanceUsd(totalUsd);

      // ── Spam Filter + Display Data ──
      const spamFilter = wallet_context.spamFilter;
      const displayTokens: DisplayToken[] = [];

      Object.values(balanceMap).forEach((b) => {
        const lowerAddr = b.contractAddress.toLowerCase();
        // Only apply IGNORED filter on Ethereum Sepolia (these are old broken contracts on Sepolia only)
        if (activeNetworkId === NetworkId.Ethereum_Sepolia && IGNORED_CONTRACTS.includes(lowerAddr)) return;

        const meta = wallet_context.tokenCache.getToken(activeNetworkId, lowerAddr) ||
          wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress);

        const tokenName = meta?.name ?? (b.isNative ? nativeName : "Token");
        const tokenSymbol = meta?.symbol ?? (b.isNative ? nativeSym : "???");
        const hasLogo = !!(meta?.logoSrc && meta.logoSrc.length > 0);

        // Run spam check (skip native tokens)
        const spamResult = (b.contractAddress !== "ETH" && b.contractAddress !== "NATIVE" && !b.isNative)
          ? spamFilter.checkToken(activeNetworkId, b.contractAddress, tokenSymbol, tokenName, meta?.decimals ?? 18, hasLogo, b.isAlchemySpam ?? false)
          : { isSpam: false, isSuspicious: false, isHidden: false, score: 0, reasons: [] };

        displayTokens.push({
          name: tokenName,
          symbol: tokenSymbol,
          logoSrc: meta?.logoSrc ?? "",
          contractAddress: b.contractAddress,
          decimals: meta?.decimals ?? 18,
          isShielded: b.isShielded ?? false,
          isSpam: spamResult.isSpam,
          isSuspicious: spamResult.isSuspicious,
          isHidden: spamResult.isHidden,
          spamScore: spamResult.score,
        });
      });

      // Mark all current contracts as "known" for next visit
      const allContracts = displayTokens
        .filter(t => t.contractAddress !== "ETH" && t.contractAddress !== "NATIVE")
        .map(t => t.contractAddress);
      spamFilter.markAllKnown(activeNetworkId, allContracts);

      // Sort tokens by USD value (highest to lowest)
      displayTokens.sort((a, b) => {
        const valA = balanceMap[a.contractAddress]?.totalValueUsd ?? 0;
        const valB = balanceMap[b.contractAddress]?.totalValueUsd ?? 0;
        return valB - valA;
      });

      setTokens(displayTokens);

      // Fetch NFTs balances manually from the cache list
      try {
        const cachedNfts = wallet_context.nftCache.getAllNFTs(activeNetworkId) || [];
        const nftWithBalances = await Promise.all(
          cachedNfts.map(async (nft) => {
            const balStr = await net.getNftBalance(nft.contractAddress, address);
            return {
              ...nft,
              balance: parseInt(balStr) || 0
            };
          })
        );
        setNfts(nftWithBalances);
      } catch (err) {
      }

      // ── Persist to cache for next mount ──
      // Clear any previous error on successful fetch
      setFetchError(null);
      if (dataCache) {
        const finalTokens = displayTokens.length > 0
          ? displayTokens.map(t => ({ ...t, isShielded: balanceMap[t.contractAddress]?.isShielded ?? false }))
          : Object.values(balanceMap).map((b) => ({
            name: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.name ?? (b.isNative ? nativeName : "Token"),
            symbol: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.symbol ?? (b.isNative ? nativeSym : "???"),
            logoSrc: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.logoSrc ?? "",
            contractAddress: b.contractAddress,
            decimals: 18,
            isShielded: b.isShielded ?? false
          }));
        dataCache.set(address, activeNetworkId, {
          balances: balanceMap,
          tokens: finalTokens,
          prices: currentPrices,
          totalUsd,
        });
      }

    } catch (err) {

      // Classify the error and show a user-friendly toast
      const classified = err instanceof NetworkError
        ? err.classified
        : classifyError(err);

      const errorMsg = t(classified.i18nKey, { defaultValue: getErrorFallbackMessage(classified.type) });

      setFetchError(errorMsg);

      // Show toast with retry action for retryable errors
      if (classified.retryable) {
        showToast(errorMsg, "error", {
          duration: 8000,
          actionLabel: t("common.retry"),
          onAction: () => {
            setFetchError(null);
            fetchData(true);
          },
          dedupeKey: "home-fetch-error",
        });
      } else {
        showToast(errorMsg, "error", {
          duration: 6000,
          dedupeKey: "home-fetch-error",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFetchError(null);
    fetchData();
  }, [active_context?.activeAccount, activeNetworkId]);

  if (!active_context) return null;

  return (
    <Box sx={{ pb: 2 }}>

      {/* Network Switcher & Header */}
      <Box sx={{ px: 2, pt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          onClick={handleNetworkClick}
          endIcon={<ExpandMore />}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderRadius: 4,
            px: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            textTransform: 'none',
            fontWeight: 600
          }}
        >
          <Box sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: activeNetworkId === NetworkId.Ethereum_Mainnet ? '#10b981' :
              activeNetworkId === NetworkId.Ethereum_Sepolia ? '#f59e0b' :
                activeNetworkId === NetworkId.Arbitrum_One ? '#2563eb' :
                  activeNetworkId === NetworkId.Arbitrum_Sepolia ? '#60a5fa' :
                    activeNetworkId === NetworkId.Base_Mainnet ? '#0052ff' :
                      activeNetworkId === NetworkId.Base_Sepolia ? '#93c5fd' :
                        (wallet_context?.networkProvider?.getCustomNetworks()?.find(cn => cn.chainId === (activeNetworkId as number))?.iconColor) || '#404040',
            mr: 1
          }} />
          {activeNetwork?.network_name}
        </Button>
        <Menu
          anchorEl={anchorEl}
          open={openNetworkMenu}
          onClose={() => handleNetworkClose(null)}
          PaperProps={{ sx: { borderRadius: 3, mt: 1, minWidth: 150 } }}
        >
          <MenuItem onClick={() => handleNetworkClose(NetworkId.Ethereum_Mainnet)}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', mr: 1 }} /> Mainnet
          </MenuItem>
          <MenuItem onClick={() => handleNetworkClose(NetworkId.Ethereum_Sepolia)}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b', mr: 1 }} /> Sepolia
          </MenuItem>
          <MenuItem onClick={() => handleNetworkClose(NetworkId.Arbitrum_One)}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2563eb', mr: 1 }} /> Arbitrum One
          </MenuItem>
          <MenuItem onClick={() => handleNetworkClose(NetworkId.Arbitrum_Sepolia)}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#60a5fa', mr: 1 }} /> Arbitrum Sepolia
          </MenuItem>
          <MenuItem onClick={() => handleNetworkClose(NetworkId.Base_Mainnet)}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#0052ff', mr: 1 }} /> Base Mainnet
          </MenuItem>
          <MenuItem onClick={() => handleNetworkClose(NetworkId.Base_Sepolia)}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#93c5fd', mr: 1 }} /> Base Sepolia
          </MenuItem>
          {/* Custom Networks */}
          {(wallet_context?.networkProvider?.getCustomNetworks() ?? []).length > 0 && (
            <Divider sx={{ my: 0.5 }} />
          )}
          {(wallet_context?.networkProvider?.getCustomNetworks() ?? []).map((cn) => (
            <MenuItem key={cn.chainId} onClick={() => handleNetworkClose(cn.chainId as NetworkId)}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cn.iconColor || '#404040', mr: 1 }} />
              {cn.networkName}
            </MenuItem>
          ))}
        </Menu>

        <IconButton
          onClick={() => { setFetchError(null); fetchData(true); }}
          disabled={loading}
          aria-label="Refresh balances"
          sx={{
            bgcolor: 'background.paper',
            ml: 1,
            '& svg': {
              animation: loading ? 'spin 1.5s linear infinite' : 'none'
            },
            '@keyframes spin': {
              '0%': { transform: 'rotate(0deg)' },
              '100%': { transform: 'rotate(360deg)' }
            }
          }}
        >
          <Refresh />
        </IconButton>
      </Box>

      {/* 1. Main Balance Card */}
      <Box sx={{ p: 2, pt: 1 }}>
        <Paper elevation={0} sx={{
          p: 0,
          borderRadius: 5,
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(145deg, #0b1120 0%, #2563eb 35%, #172554 65%, #1d4ed8 100%)'
            : 'linear-gradient(145deg, #dbeafe 0%, #bfdbfe 35%, #93c5fd 65%, #60a5fa 100%)',
          color: theme.palette.mode === 'dark' ? '#eff6ff' : '#2563eb',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 20px 60px -15px rgba(11, 17, 32, 0.7), 0 0 0 1px rgba(96, 165, 250, 0.06), inset 0 1px 0 rgba(239, 246, 255, 0.04)'
            : '0 16px 48px -12px rgba(37, 99, 235, 0.2), 0 0 0 1px rgba(37, 99, 235, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          mb: 1,
          border: 'none',
        }}>
          {/* ── Animated mesh gradient overlay ────────────────── */}
          <Box sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: theme.palette.mode === 'dark'
              ? `
                radial-gradient(ellipse 120% 80% at 20% 10%, rgba(72, 101, 129, 0.25) 0%, transparent 50%),
                radial-gradient(ellipse 80% 120% at 80% 90%, rgba(51, 78, 104, 0.2) 0%, transparent 50%),
                radial-gradient(circle at 60% 40%, rgba(59, 130, 246, 0.1) 0%, transparent 40%)
              `
              : `
                radial-gradient(ellipse 120% 80% at 20% 10%, rgba(255, 255, 255, 0.35) 0%, transparent 50%),
                radial-gradient(ellipse 80% 120% at 80% 90%, rgba(239, 246, 255, 0.3) 0%, transparent 50%),
                radial-gradient(circle at 60% 40%, rgba(255, 255, 255, 0.15) 0%, transparent 40%)
              `,
            pointerEvents: 'none',
            animation: 'meshShift 8s ease-in-out infinite alternate',
            '@keyframes meshShift': {
              '0%': { opacity: 0.6 },
              '50%': { opacity: 1 },
              '100%': { opacity: 0.7 },
            },
          }} />

          {/* ── Subtle noise texture ─────────────────────────── */}
          <Box sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.03,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            pointerEvents: 'none',
          }} />

          {/* ── Top accent line ──────────────────────────────── */}
          <Box sx={{
            position: 'absolute',
            top: 0,
            left: '15%',
            right: '15%',
            height: '1px',
            background: theme.palette.mode === 'dark'
              ? 'linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.3), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent)',
          }} />

          {/* ── Card content ─────────────────────────────────── */}
          <Box sx={{ position: 'relative', zIndex: 2, p: 2, pt: 1.5, pb: 1.5, width: '100%', textAlign: 'center' }}>
            {/* Total Balance label with subtle icon */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, mb: 0.75 }}>
              <Box sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: theme.palette.mode === 'dark' ? '#3b82f6' : '#1e3a8a',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 0 8px rgba(59, 130, 246, 0.5)'
                  : '0 0 8px rgba(72, 101, 129, 0.4)',
                animation: 'pulse 3s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
                  '50%': { opacity: 1, transform: 'scale(1.3)' },
                },
              }} />
              <Typography variant="body2" sx={{
                color: theme.palette.mode === 'dark' ? '#93c5fd' : '#1e40af',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: '0.7rem',
              }}>
                Total Balance
              </Typography>
            </Box>

            {/* Balance with Matrix privacy toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
              <MatrixBalance
                value={`$${totalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                isHidden={isBalanceHidden}
                variant="h3"
              />
              <Tooltip title={isBalanceHidden ? t('home.showBalance') : t('home.hideBalance')}>
                <IconButton
                  size="small"
                  onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                  aria-label={isBalanceHidden ? t('home.showBalance') : t('home.hideBalance')}
                  sx={{
                    color: theme.palette.mode === 'dark' ? '#3b82f6' : '#1e3a8a',
                    transition: 'all 0.25s ease',
                    '&:hover': {
                      color: theme.palette.mode === 'dark' ? '#93c5fd' : '#1d4ed8',
                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(37, 99, 235, 0.08)',
                    },
                  }}
                >
                  {isBalanceHidden ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>

            {/* ── Separator line ─────────────────────────────── */}
            <Box sx={{
              mt: 1.5,
              mb: 1.5,
              mx: 'auto',
              width: '60%',
              height: '1px',
              background: theme.palette.mode === 'dark'
                ? 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.25), transparent)'
                : 'linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.12), transparent)',
            }} />

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
              <Button
                variant="contained"
                onClick={() => navigate('/portfolio')}
                startIcon={<TrendingUp sx={{ fontSize: 14 }} />}
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.12)',
                  color: '#eff6ff',
                  backdropFilter: 'blur(8px)',
                  boxShadow: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  px: 2,
                  py: 0.5,
                  transition: 'all 0.25s ease',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.2)',
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                Portfolio
              </Button>
              <Button
                variant="contained"
                onClick={() => navigate('/revoke')}
                startIcon={<Shield sx={{ fontSize: 14 }} />}
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.12)',
                  color: '#eff6ff',
                  backdropFilter: 'blur(8px)',
                  boxShadow: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 3,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  px: 2,
                  py: 0.5,
                  transition: 'all 0.25s ease',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.2)',
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                Revoke
              </Button>
            </Box>
          </Box>

          {/* ── Bottom accent line ───────────────────────────── */}
          <Box sx={{
            position: 'absolute',
            bottom: 0,
            left: '25%',
            right: '25%',
            height: '1px',
            background: theme.palette.mode === 'dark'
              ? 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.15), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent)',
          }} />
        </Paper>
      </Box>

      {/* Backup Reminder Banner */}
      {showBackupReminder && !showOnboarding && (
        <BackupReminderBanner
          onBackup={() => {
            setShowBackupReminder(false);
            dismissBackupReminder();
            navigate('/settings/security');
          }}
          onDismiss={() => {
            setShowBackupReminder(false);
            dismissBackupReminder();
          }}
        />
      )}

      {/* Network Error Banner */}
      {fetchError && !loading && (
        <Box sx={{ px: 2, mb: 1 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.error.main, 0.08),
              border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <WarningAmber sx={{ color: 'error.main', fontSize: 20 }} />
            <Typography variant="body2" color="error.main" sx={{ flex: 1, fontWeight: 600, fontSize: '0.78rem' }}>
              {fetchError}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => { setFetchError(null); fetchData(true); }}
              startIcon={<Refresh sx={{ fontSize: 14 }} />}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                minWidth: 'auto',
                px: 1.5,
              }}
            >
              {t("common.retry")}
            </Button>
          </Paper>
        </Box>
      )}

      {/* 3. Assets Tab List */}
      <Box sx={{ px: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Tabs
            value={tabIndex}
            onChange={(e, v) => setTabIndex(v)}
            sx={{
              mb: 1,
              minHeight: 32,
              flex: 1,
              '& .MuiTabs-indicator': { backgroundColor: 'primary.main', height: 3, borderRadius: '3px 3px 0 0' },
              '& .MuiTab-root': { minHeight: 32, textTransform: 'none', fontWeight: 700, fontSize: '0.85rem', color: 'text.secondary', '&.Mui-selected': { color: 'text.primary' } }
            }}
          >
            <Tab
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{t('home.tokens')}</span>
                  {tokens.filter((t) => !t.isSpam && !t.isHidden).length > 0 && (
                    <Chip
                      label={tokens.filter((t) => !t.isSpam && !t.isHidden).length}
                      size="small"
                      sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800, bgcolor: 'action.hover', color: 'text.secondary' }}
                    />
                  )}
                </Stack>
              }
            />
            <Tab label={t('home.nfts')} />
          </Tabs>
        </Stack>

        {tabIndex === 0 && (
          <Box>
            {(() => {
              const visibleTokens = tokens.filter((t) => !t.isSpam && !t.isHidden);
              const hiddenTokens = tokens.filter((t) => t.isSpam || t.isHidden);
              const displayList = showHiddenTokens ? tokens : visibleTokens;

              return (
                <>
                  {displayList.map((token, idx: number) => {
                    const b = balances[token.contractAddress];
                    const rawBalance = b ? parseFloat(b.tokenBalance) : 0;
                    const balanceStr = rawBalance > 0
                      ? (rawBalance < 0.0001 ? '<0.0001' : rawBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }))
                      : '0';
                    const valUsd = b?.totalValueUsd ?? 0;
                    const valStr = valUsd > 0 ? `$${valUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';

                    return (
                      <AssetItem
                        key={`${token.contractAddress}-${idx}`}
                        symbol={token.symbol}
                        name={token.name}
                        balance={isBalanceHidden ? '•••••' : balanceStr}
                        value={isBalanceHidden ? '$•••••' : valStr}
                        icon={getTokenLogoUrl(token.contractAddress, token.logoSrc, token.symbol, token.name)}
                        isShielded={token.isShielded ?? false}
                        isLast={idx === displayList.length - 1}
                        isSuspicious={token.isSuspicious ?? false}
                        isSpamHidden={token.isSpam || token.isHidden}
                        onClick={() => navigate(`/token/${encodeURIComponent(token.contractAddress)}`, {
                          state: { logoSrc: getTokenLogoUrl(token.contractAddress, token.logoSrc, token.symbol, token.name) }
                        })}
                        onToggleHide={() => {
                          if (!wallet_context) return;
                          const sf = wallet_context.spamFilter;
                          const addr = token.contractAddress.toLowerCase();
                          if (sf.isTokenHidden(activeNetworkId, addr)) {
                            sf.unhideToken(activeNetworkId, addr);
                          } else {
                            sf.hideToken(activeNetworkId, addr);
                          }
                          // Update token in state
                          setTokens((prev) => prev.map(t =>
                            t.contractAddress === token.contractAddress
                              ? { ...t, isHidden: !t.isHidden, isSpam: false }
                              : t
                          ));
                        }}
                      />
                    );
                  })}
                  {visibleTokens.length === 0 && loading && (
                    <TokenListSkeleton rows={5} />
                  )}
                  {visibleTokens.length === 0 && !loading && (
                    <Box sx={{
                      textAlign: 'center',
                      py: 6,
                      px: 3,
                      bgcolor: 'background.paper',
                      borderRadius: 3,
                      border: '1px dashed',
                      borderColor: 'divider'
                    }}>
                      <Typography variant="body2" color="text.secondary" fontWeight={500}>
                        {t('home.noAssets')}
                      </Typography>
                    </Box>
                  )}

                  {/* Hidden token toggle */}
                  {hiddenTokens.length > 0 && (
                    <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
                      <Button
                        variant="text"
                        size="small"
                        color="warning"
                        startIcon={showHiddenTokens ? <VisibilityOff /> : <VisibilityOffOutlined />}
                        onClick={() => setShowHiddenTokens(!showHiddenTokens)}
                        sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'none' }}
                      >
                        {showHiddenTokens ? t('home.hideSpamTokens') : t('home.hiddenSpamCount', { count: hiddenTokens.length })}
                      </Button>
                    </Box>
                  )}
                </>
              );
            })()}

            {/* Tokens Tab Footer */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => setImportTokenModalOpen(true)}
                sx={{
                  fontWeight: 600,
                  px: 2.5,
                  py: 0.5,
                  borderRadius: 3,
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  borderColor: 'divider',
                  color: 'text.secondary',
                  '&:hover': {
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(96,165,250,0.04)' : 'rgba(37,99,235,0.03)',
                  },
                }}
              >
                {t('home.importCustomToken')}
              </Button>
            </Box>
          </Box>
        )}

        {tabIndex === 1 && (
          <Box>
            {nfts.length > 0 ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1.5,
                  pb: 2,
                }}
              >
                {nfts.map((nft, idx: number) => (
                  <NftGalleryCard
                    key={`${nft.contractAddress}-${idx}`}
                    contractAddress={nft.contractAddress}
                    symbol={nft.symbol}
                    name={nft.name}
                    balance={nft.balance ?? 1}
                    isShielded={false}
                    rpcUrl={wallet_context?.networkProvider?.getActiveNetwork()?.rpc_url}
                  />
                ))}
              </Box>
            ) : loading ? (
              <NftGridSkeleton count={4} />
            ) : (
              <Box sx={{
                textAlign: 'center',
                py: 8,
                px: 3,
                borderRadius: 3,
                background: theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, rgba(17,29,43,0.5) 0%, rgba(26,47,69,0.3) 100%)'
                  : 'linear-gradient(135deg, rgba(239,246,255,0.8) 0%, rgba(217,226,236,0.4) 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1
              }}>
                <Box sx={{
                  width: 64, height: 64, borderRadius: 4,
                  background: theme.palette.mode === 'dark'
                    ? 'linear-gradient(45deg, #172554, #1d4ed8)'
                    : 'linear-gradient(45deg, #dbeafe, #bfdbfe)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  mb: 1
                }}>
                  <Hub sx={{ color: 'text.disabled', fontSize: 32 }} />
                </Box>
                <Typography variant="subtitle1" color="text.primary" fontWeight={700}>
                  {t('home.noNftsTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('home.noNftsDesc')}
                </Typography>
              </Box>
            )}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => setImportNftModalOpen(true)}
                sx={{
                  fontWeight: 600,
                  px: 3,
                  py: 1,
                  borderRadius: 3,
                  fontSize: '0.8rem',
                  textTransform: 'none',
                  borderColor: 'divider',
                  color: 'text.secondary',
                  '&:hover': {
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(96,165,250,0.04)' : 'rgba(37,99,235,0.03)',
                  },
                }}
              >
                {t('home.importCustomNft')}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <ImportTokenModal
        open={importTokenModalOpen}
        onClose={() => setImportTokenModalOpen(false)}
        onImportSuccess={fetchData}
      />
      <ImportNftModal
        open={importNftModalOpen}
        onClose={() => setImportNftModalOpen(false)}
        onImportSuccess={fetchData}
      />

      {/* Onboarding Tour (first-time users) */}
      <OnboardingTour
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

    </Box>
  );
}

function AssetItem({ symbol, name, balance, value, icon, isShielded = false, isLast = false, isSuspicious = false, isSpamHidden = false, onToggleHide, onClick }: {
  symbol: string,
  name: string,
  balance: string,
  value: string,
  icon: string,
  isShielded?: boolean,
  isLast?: boolean,
  isSuspicious?: boolean,
  isSpamHidden?: boolean,
  onToggleHide?: () => void,
  onClick?: () => void,
}) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const fallbackColor = stringToColor(symbol || name);

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 1.5,
        py: 1,
        borderRadius: 2.5,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease, opacity 0.2s ease',
        opacity: isSpamHidden ? 0.45 : 1,
        '&:hover': {
          bgcolor: 'rgba(37, 99, 235, 0.03)',
        },
        ...(!isLast && {
          borderBottom: '1px solid',
          borderColor: 'divider',
        })
      }}
    >
      {/* Token Logo */}
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <Avatar
          src={!imgError ? icon : undefined}
          onError={() => setImgError(true)}
          sx={{
            width: 36,
            height: 36,
            bgcolor: imgError || !icon ? fallbackColor : 'transparent',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 700,
            border: '2px solid',
            borderColor: 'divider',
          }}
        >
          {(imgError || !icon) && (symbol ? symbol.substring(0, 2) : '?')}
        </Avatar>
        {isShielded && (
          <Box sx={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid',
            borderColor: 'background.default',
          }}>
            <Shield sx={{ fontSize: 9, color: '#fff' }} />
          </Box>
        )}
      </Box>

      {/* Token Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em' }}
          >
            {symbol}
          </Typography>
          {isShielded && (
            <Chip
              label={t('home.private')}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          )}
          {isSuspicious && !isSpamHidden && (
            <Chip
              icon={<WarningAmber sx={{ fontSize: '0.7rem !important' }} />}
              label={t('home.suspicious')}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.58rem',
                fontWeight: 700,
                bgcolor: 'rgba(245, 158, 11, 0.12)',
                color: '#f59e0b',
                '& .MuiChip-label': { px: 0.5 },
                '& .MuiChip-icon': { color: '#f59e0b', ml: 0.3 },
              }}
            />
          )}
          {isSpamHidden && (
            <Chip
              label={t('home.spam')}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.58rem',
                fontWeight: 700,
                bgcolor: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            display: 'block',
            lineHeight: 1.3,
            fontSize: '0.72rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </Typography>
      </Box>

      {/* Balance & Value */}
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: isSpamHidden ? 'text.disabled' : 'text.primary', letterSpacing: '-0.01em', lineHeight: 1.3 }}
        >
          {value}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: '0.72rem',
            lineHeight: 1.3,
          }}
        >
          {balance} {symbol}
        </Typography>
      </Box>

      {/* Hide/Unhide Toggle */}
      {onToggleHide && (
        <Tooltip title={isSpamHidden ? "Show token" : "Hide token"} arrow>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
            aria-label={isSpamHidden ? "Show token" : "Hide token"}
            sx={{
              ml: 0.5,
              flexShrink: 0,
              width: 28,
              height: 28,
              color: isSpamHidden ? 'text.disabled' : 'text.secondary',
              '&:hover': { color: 'warning.main' },
            }}
          >
            {isSpamHidden ? <Visibility sx={{ fontSize: 16 }} /> : <VisibilityOffOutlined sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export default Home;