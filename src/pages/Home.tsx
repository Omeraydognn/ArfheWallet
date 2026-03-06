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
  alpha
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
  VisibilityOff
} from "@mui/icons-material";
import { useMatrixText } from "../hooks/useMatrixText.js";
import ImportTokenModal from "../components/ImportTokenModal.js";
import ImportNftModal from "../components/ImportNftModal.js";
import NftGalleryCard from "../components/NftGalleryCard.js";
import { AppContext, WalletContext } from "../AppContext.js";
import { ActiveAccountContext } from "../ActiveAccountProvider.js";
import { useNavigate } from "react-router";
import { NetworkId } from "../backend/NetworkTypes.js";

import { getAddress } from "ethers";

const KNOWN_LOGOS: Record<string, string> = {
  "ETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  "WETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  "cETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  "USDC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  "cUSDC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  "USDT": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  "LINK": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
  "EURC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png"
};

// Token logo resolver: Alchemy → TrustWallet CDN → symbol fallback
const getTokenLogoUrl = (contractAddress: string, logoSrc?: string, symbol?: string, name?: string): string => {
  // 1. Use Alchemy logo if available (skip broken local placeholders like /logos/eth.png)
  if (logoSrc && logoSrc.length > 0 && !logoSrc.startsWith("/logos/")) return logoSrc;

  // 2. Known tokens by symbol
  if (symbol && KNOWN_LOGOS[symbol]) return KNOWN_LOGOS[symbol];
  if (contractAddress === "ETH" || name === "Ethereum") return KNOWN_LOGOS["ETH"];

  // 3. TrustWallet assets CDN (requires checksummed address)
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
  variant?: any;
}) {
  const displayed = useMatrixText(value, isHidden);
  return (
    <Typography
      variant={variant}
      fontWeight="800"
      sx={{
        letterSpacing: -1,
        // Always use the same gradient — no green on hidden
        background: 'linear-gradient(45deg, #fff 50%, #6366f1 90%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        fontFamily: isHidden ? 'monospace' : 'inherit',
        transition: 'all 0.3s ease',
        userSelect: 'none',
      }}
    >
      {displayed}
    </Typography>
  );
}

function Home() {
  const theme = useTheme();
  const wallet_context = React.useContext(WalletContext);
  const active_context = React.useContext(ActiveAccountContext);
  const navigate = useNavigate();

  const [balances, setBalances] = useState<Record<string, any>>({});
  // Initialize from cache immediately to prevent blank screen
  const [tokens, setTokens] = useState(() => {
    try {
      const initialNetId = wallet_context?.networkProvider?.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
      return wallet_context?.tokenCache?.getAllTokens(initialNetId) ?? [];
    } catch { return []; }
  });
  const [nfts, setNfts] = useState<any[]>(() => {
    try {
      const initialNetId = wallet_context?.networkProvider?.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
      return wallet_context?.nftCache?.getAllNFTs(initialNetId) ?? [];
    } catch { return []; }
  });
  const [totalBalanceUsd, setTotalBalanceUsd] = useState(0.00);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [importTokenModalOpen, setImportTokenModalOpen] = useState(false);
  const [importNftModalOpen, setImportNftModalOpen] = useState(false);

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
        console.log("[Home] Using cached data (age: " + Math.round((dataCache.getAge(address, activeNetworkId) ?? 0) / 1000) + "s)");
        setBalances(cached.balances);
        setTokens(cached.tokens);
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
            console.log("[Home] Initializing cofhejs (TRUE FHE) for account:", address);
            const ethers = await import("ethers");
            const provider = new ethers.JsonRpcProvider(net.rpc_url);
            const privateKey = active_context.activeAccount.private_key;
            if (!privateKey) throw new Error("No private key available");
            const signer = new ethers.Wallet(privateKey, provider);

            await instance.init(provider, signer);
            console.log("[Home] ✅ cofhejs TRUE FHE Ready!");
          }
        } catch (e) {
          console.error("[Home] cofhejs FHE initialization failed:", e);
        }
      }

      // 1. Fetch Public Token Balances
      const tokenBalances = await net.getTokenBalances(
        wallet_context.tokenCache, address
      );

      // 2. Fetch Wrapped Token Balances (Only on Sepolia)
      const wrappedBalances: any[] = [];
      const WRAPPED_USDC_ADDRESS = activeNetworkId === NetworkId.Arbitrum_Sepolia
        ? ((import.meta as any).env.VITE_ARB_WRAPPED_USDC_ADDRESS || "").toLowerCase()
        : activeNetworkId === NetworkId.Base_Sepolia
          ? ((import.meta as any).env.VITE_BASE_WRAPPED_USDC_ADDRESS || "").toLowerCase()
          : ((import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
      const WRAPPED_ETH_ADDRESS = activeNetworkId === NetworkId.Arbitrum_Sepolia
        ? ((import.meta as any).env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase()
        : activeNetworkId === NetworkId.Base_Sepolia
          ? ((import.meta as any).env.VITE_BASE_WRAPPED_ETH_ADDRESS || "").toLowerCase()
          : ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
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
          console.log("[Home] Fetching wrapped USDC balance...", WRAPPED_USDC_ADDRESS);

          try {
            // Get encrypted (shielded) balance via FHE unseal - V4 contracts have NO ERC20 balance
            let wrappedUsdcBalance = "0";
            try {
              const shieldedBal = await net.getShieldedBalance(WRAPPED_USDC_ADDRESS, address, active_context.activeAccount);
              if (shieldedBal && parseFloat(shieldedBal) > 0) {
                wrappedUsdcBalance = shieldedBal;
                console.log("[Home] Wrapped USDC shielded balance:", wrappedUsdcBalance);
              } else {
                console.log("[Home] Wrapped USDC balance: 0 (no encrypted balance)");
              }
            } catch (e) {
              console.warn("[Home] Failed to fetch shielded USDC balance:", e);
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
            console.warn("[Home] Failed to fetch Wrapped USDC balance:", e);
          }
        }

        // Fetch Wrapped ETH - Always show, even if balance is 0
        if (WRAPPED_ETH_ADDRESS) {
          console.log("[Home] Fetching wrapped ETH balance...", WRAPPED_ETH_ADDRESS);

          try {
            // Get encrypted (shielded) balance via FHE unseal - V4 contracts have NO ERC20 balance
            let wrappedEthBalance = "0";
            try {
              const shieldedBal = await net.getShieldedBalance(WRAPPED_ETH_ADDRESS, address, active_context.activeAccount);
              if (shieldedBal && parseFloat(shieldedBal) > 0) {
                wrappedEthBalance = shieldedBal;
                console.log("[Home] Wrapped ETH shielded balance:", wrappedEthBalance);
              } else {
                console.log("[Home] Wrapped ETH balance: 0 (no encrypted balance)");
              }
            } catch (e) {
              console.warn("[Home] Failed to fetch shielded ETH balance:", e);
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
            console.warn("[Home] Failed to fetch Wrapped ETH balance:", e);
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
      const initialDisplay = allBalances.map(tb => {
        const cachedMeta = wallet_context.tokenCache.getToken(activeNetworkId, tb.contractAddress);
        const sym = cachedMeta?.symbol ?? (tb.isNative ? "ETH" : "???");
        return {
          name: cachedMeta?.name ?? (tb.isNative ? "Ethereum" : "Unknown Token"),
          symbol: sym,
          logoSrc: getTokenLogoUrl(tb.contractAddress, cachedMeta?.logoSrc, sym),
          contractAddress: tb.contractAddress,
          decimals: cachedMeta?.decimals ?? 18,
          isShielded: tb.isShielded ?? false
        };
      });
      setTokens(initialDisplay); // Show list instantly

      // 3. Fetch Prices (Async/Non-blocking)
      let currentPrices: Record<string, number> = {};
      try {
        currentPrices = await net.getTokenPrices(contractAddresses);
      } catch (e) { console.warn("Price fetch skipped"); }

      // Testnet price fallback: fetch mainnet ETH/USDC prices and map known testnet tokens by symbol if they lack a price
      if (activeNetworkId !== NetworkId.Ethereum_Mainnet) {
        try {
          // Check if there are any balances missing prices
          const unpriced = allBalances.some((tb: any) => {
            const key = tb.isNative ? "ETH" : tb.contractAddress.toLowerCase();
            return typeof currentPrices[key] !== 'number';
          });

          if (unpriced) {
            const ethRes = await fetch("/api/coingecko/simple/price?ids=ethereum,chainlink,usd-coin&vs_currencies=usd");
            const ethJson = await ethRes.json();
            const ethPrice = ethJson.ethereum?.usd ?? 0;
            const linkPrice = ethJson.chainlink?.usd ?? 0;
            const usdcPrice = ethJson["usd-coin"]?.usd ?? 1;

            if (currentPrices["ETH"] === undefined) currentPrices["ETH"] = ethPrice;

            const symbolPriceMap: Record<string, number> = {
              "ETH": ethPrice,
              "WETH": ethPrice,
              "cETH": ethPrice,
              "USDC": usdcPrice,
              "cUSDC": usdcPrice,
              "EURC": usdcPrice,
              "wUSDC": usdcPrice,
              "LINK": linkPrice,
            };

            // Apply prices by matching token symbol from cache ONLY if not already priced
            allBalances.forEach((tb: any) => {
              const meta = wallet_context.tokenCache.getToken(activeNetworkId, tb.contractAddress);
              const symbol = meta?.symbol ?? (tb.isNative ? "ETH" : "");
              const key = tb.contractAddress.toLowerCase();

              if (currentPrices[key] === undefined && symbol && symbolPriceMap[symbol] !== undefined) {
                currentPrices[key] = symbolPriceMap[symbol];
              }
            });
            console.log("[Home] Testnet symbol price mapping applied:", currentPrices);
          }
        } catch (e) {
          console.warn("[Home] Testnet price fallback failed:", e);
        }
      }

      setPrices(currentPrices);

      // 4. Calculate Values & Update Display
      let totalUsd = 0;
      const balanceMap: Record<string, any> = {};

      // Process public token balances
      tokenBalances.forEach((tb) => {
        const p = tb.isNative ? (currentPrices["ETH"] ?? 0) : (currentPrices[tb.contractAddress.toLowerCase()] ?? 0);
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

      // ── Store final display data in cache ──
      const displayTokens: any[] = [];

      Object.values(balanceMap).forEach((b: any) => {
        const lowerAddr = b.contractAddress.toLowerCase();
        if (IGNORED_CONTRACTS.includes(lowerAddr)) return;

        // Tokens in balanceMap have already been filtered by Network.ts (either balance > 0 or explicitly cached)
        const meta = wallet_context.tokenCache.getToken(activeNetworkId, lowerAddr) ||
          wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress);

        displayTokens.push({
          name: meta?.name ?? (b.isNative ? "Ethereum" : "Token"),
          symbol: meta?.symbol ?? (b.isNative ? "ETH" : "???"),
          logoSrc: meta?.logoSrc ?? "",
          contractAddress: b.contractAddress,
          decimals: meta?.decimals ?? 18,
          isShielded: b.isShielded ?? false
        });
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
        console.warn("Failed to fetch custom NFT balances", err);
      }

      // ── Persist to cache for next mount ──
      if (dataCache) {
        const finalTokens = displayTokens.length > 0
          ? displayTokens.map(t => ({ ...t, isShielded: balanceMap[t.contractAddress]?.isShielded ?? false }))
          : Object.values(balanceMap).map((b: any) => ({
            name: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.name ?? (b.isNative ? "Ethereum" : "Token"),
            symbol: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.symbol ?? (b.isNative ? "ETH" : "???"),
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
        console.log("[Home] Data cached for", address, activeNetworkId);
      }

    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [active_context?.activeAccount, activeNetworkId]);

  if (!active_context) return null;

  return (
    <Box sx={{ pb: 10 }}>

      {/* Network Switcher & Header */}
      <Box sx={{ px: 3, pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                        '#94a3b8',
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
        </Menu>

        <IconButton
          onClick={() => fetchData(true)}
          disabled={loading}
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
      <Box sx={{ p: 3, pt: 2 }}>
        <Paper elevation={0} sx={{
          p: 3,
          borderRadius: 4,
          background: 'linear-gradient(45deg, #6366f1 20%,  #fff 80%)',
          color: 'white',
          boxShadow: '0 20px 40px -10px rgba(50, 47, 113, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          mb: 2
        }}>
          <Typography variant="body2" sx={{ opacity: 0.8 }} gutterBottom>
            Total Balance
          </Typography>

          {/* Balance with Matrix privacy toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MatrixBalance
              value={`$${totalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              isHidden={isBalanceHidden}
              variant="h3"
            />
            <Tooltip title={isBalanceHidden ? 'Show Balance' : 'Hide Balance'}>
              <IconButton
                size="small"
                onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                sx={{
                  color: 'rgba(255,255,255,0.7)',
                  transition: 'all 0.2s',
                  '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                {isBalanceHidden ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, zIndex: 10 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, bgcolor: 'rgba(0,0,0,0.1)', px: 1.5, py: 0.5, borderRadius: 2 }}>
              +2.45% (1D)
            </Typography>
          </Box>

          {/* Action Buttons (Portfolio, Revoke) */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', mt: 3, gap: 1.5, zIndex: 10 }}>
            <Button
              variant="contained"
              onClick={() => navigate('/portfolio')}
              startIcon={<TrendingUp />}
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'white',
                backdropFilter: 'blur(10px)',
                boxShadow: 'none',
                borderRadius: 3,
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
              }}
            >
              Portfolio
            </Button>
            <Button
              variant="contained"
              onClick={() => navigate('/revoke')}
              startIcon={<Shield />}
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'white',
                backdropFilter: 'blur(10px)',
                boxShadow: 'none',
                borderRadius: 3,
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
              }}
            >
              Revoke
            </Button>
          </Box>
        </Paper>
      </Box>

      {/* 3. Assets Tab List */}
      <Box sx={{ px: 2 }}>
        <Tabs
          value={tabIndex}
          onChange={(e, v) => setTabIndex(v)}
          sx={{
            mb: 2,
            minHeight: 36,
            '& .MuiTabs-indicator': { backgroundColor: 'primary.main', height: 3, borderRadius: '3px 3px 0 0' },
            '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 700, fontSize: '0.9rem', color: 'text.secondary', '&.Mui-selected': { color: 'text.primary' } }
          }}
        >
          <Tab
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>Tokens</span>
                {tokens.length > 0 && (
                  <Chip
                    label={tokens.length}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800, bgcolor: 'action.hover', color: 'text.secondary' }}
                  />
                )}
              </Stack>
            }
          />
          <Tab label="NFTs" />
        </Tabs>

        {tabIndex === 0 && (
          <Box>
            {tokens.map((token: any, idx: number) => {
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
                  isLast={idx === tokens.length - 1}
                />
              );
            })}
            {tokens.length === 0 && !loading && (
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
                  No assets found on this network
                </Typography>
              </Box>
            )}

            {/* Tokens Tab Footer */}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="text"
                color="primary"
                startIcon={<Add />}
                onClick={() => setImportTokenModalOpen(true)}
                sx={{ fontWeight: 600, px: 3, py: 1 }}
              >
                Import Custom Token
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
                {nfts.map((nft: any, idx: number) => (
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
            ) : !loading ? (
              <Box sx={{
                textAlign: 'center',
                py: 8,
                px: 3,
                bgcolor: 'background.paper',
                borderRadius: 3,
                border: '1px dashed',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1
              }}>
                <Box sx={{
                  width: 64, height: 64, borderRadius: 4,
                  background: 'linear-gradient(45deg, #f3f4f6, #e5e7eb)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  mb: 1
                }}>
                  <Hub sx={{ color: 'text.disabled', fontSize: 32 }} />
                </Box>
                <Typography variant="subtitle1" color="text.primary" fontWeight={700}>
                  No NFTs Found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Your digital collectibles will appear here.
                </Typography>
              </Box>
            ) : null}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<Add />}
                onClick={() => setImportNftModalOpen(true)}
                sx={{ fontWeight: 600, px: 3, py: 1, borderRadius: 2 }}
              >
                Import Custom NFT
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
    </Box>
  );
}

function AssetItem({ symbol, name, balance, value, icon, isShielded = false, isLast = false }: {
  symbol: string,
  name: string,
  balance: string,
  value: string,
  icon: string,
  isShielded?: boolean,
  isLast?: boolean
}) {
  const [imgError, setImgError] = useState(false);
  const fallbackColor = stringToColor(symbol || name);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderRadius: 2.5,
        cursor: 'default',
        transition: 'background-color 0.15s ease',
        '&:hover': {
          bgcolor: 'rgba(99, 102, 241, 0.04)',
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
            width: 40,
            height: 40,
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
              label="Private"
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
          sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em', lineHeight: 1.3 }}
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
    </Box>
  );
}

export default Home;