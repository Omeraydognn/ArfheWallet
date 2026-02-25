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
  MenuItem
} from "@mui/material";
import {
  TrendingUp,
  History,
  Shield,
  Hub,
  ExpandMore,
  Refresh
} from "@mui/icons-material";
import { AppContext, WalletContext } from "../AppContext.js";
import { ActiveAccountContext } from "../ActiveAccountProvider.js";
import ArfGraph from "../components/ArfGraph.js";
import { useNavigate } from "react-router";
import { NetworkId } from "../backend/NetworkTypes.js";

// Mock data for graph
const demoData = [
  { x: 0, y: 2 },
  { x: 1, y: 5.5 },
  { x: 2, y: 2 },
  { x: 3, y: 8.5 },
  { x: 4, y: 1.5 },
  { x: 5, y: 5 },
];

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

function Home() {
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
  const [totalBalanceUsd, setTotalBalanceUsd] = useState(0.00);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

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
      const isFheNetwork = activeNetworkId === NetworkId.Ethereum_Sepolia || activeNetworkId === NetworkId.Arbitrum_Sepolia;
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
        : ((import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
      const WRAPPED_ETH_ADDRESS = activeNetworkId === NetworkId.Arbitrum_Sepolia
        ? ((import.meta as any).env.VITE_ARB_WRAPPED_ETH_ADDRESS || "").toLowerCase()
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

      // Testnet price fallback: fetch mainnet ETH price and map known tokens
      if (activeNetworkId !== NetworkId.Ethereum_Mainnet && Object.keys(currentPrices).length === 0) {
        try {
          const ethRes = await fetch("/api/coingecko/simple/price?ids=ethereum,chainlink,usd-coin&vs_currencies=usd");
          const ethJson = await ethRes.json();
          const ethPrice = ethJson.ethereum?.usd ?? 0;
          const linkPrice = ethJson.chainlink?.usd ?? 0;
          const usdcPrice = ethJson["usd-coin"]?.usd ?? 1;

          // Map native ETH
          currentPrices["ETH"] = ethPrice;

          // Map all known testnet tokens to mainnet prices by symbol
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

          // Apply prices by matching token symbol from cache
          allBalances.forEach((tb: any) => {
            const meta = wallet_context.tokenCache.getToken(activeNetworkId, tb.contractAddress);
            const symbol = meta?.symbol ?? (tb.isNative ? "ETH" : "");
            if (symbol && symbolPriceMap[symbol] !== undefined) {
              currentPrices[tb.contractAddress.toLowerCase()] = symbolPriceMap[symbol];
            }
          });

          console.log("[Home] Testnet prices mapped:", currentPrices);
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
      // (tokens will be set below, so we store after final token list is determined)

      const cached = wallet_context.tokenCache.getAllTokens(activeNetworkId) ?? [];

      // FIX: Use 'balanceMap' (local var) instead of 'balances' (stale state)
      // We must ensure that any token with a positive balance in balanceMap is displayed,
      // even if it wasn't in the initial 'cached' list (which often misses wrapped tokens if they have 0 public balance)

      const tokensToDisplay: any[] = [];
      const seenContracts = new Set<string>();

      // 1. Add all tokens from cache that have > 0 balance or are ETH
      cached.forEach(t => {
        if (IGNORED_CONTRACTS.includes(t.contractAddress.toLowerCase())) return;
        const entry = balanceMap[t.contractAddress];
        if (t.symbol === "ETH" || (entry && parseFloat(entry.tokenBalance) > 0)) {
          tokensToDisplay.push(t);
          seenContracts.add(t.contractAddress);
        }
      });

      // 2. Add any wrapped tokens (like cUSDC) that we explicitly fetched and have > 0 balance,
      // but were NOT in the cached public list
      wrappedBalances.forEach(wb => {
        if (!seenContracts.has(wb.contractAddress) && parseFloat(wb.tokenBalance) > 0) {
          const meta = wallet_context.tokenCache.getToken(activeNetworkId, wb.contractAddress);
          if (meta) {
            tokensToDisplay.push(meta);
            seenContracts.add(wb.contractAddress);
          }
        }
      });

      const displayTokens = tokensToDisplay;

      // Update the list or fallback to showing what we found in balances if cache is desync
      if (displayTokens.length > 0) {
        setTokens(displayTokens.map(t => ({
          ...t,
          isShielded: balanceMap[t.contractAddress]?.isShielded ?? false
        })));
      } else {
        // Fallback layout if cache didn't match
        const fallback = Object.values(balanceMap).map((b: any) => ({
          name: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.name ?? (b.isNative ? "Ethereum" : "Token"),
          symbol: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.symbol ?? (b.isNative ? "ETH" : "???"),
          logoSrc: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.logoSrc ?? "",
          contractAddress: b.contractAddress,
          decimals: 18,
          isShielded: b.isShielded ?? false
        }));
        setTokens(fallback);
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
          overflow: 'hidden'
        }}>
          <Typography variant="body2" sx={{ opacity: 0.8 }} gutterBottom>
            Total Balance
          </Typography>
          <Typography variant="h3" fontWeight="800" sx={{ letterSpacing: -1, background: 'linear-gradient(45deg, #fff 50%, #6366f1 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ${totalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>

          {/* Action Buttons (Graph, Revoke) - Moved Inside */}
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 3, gap: 2, zIndex: 10 }}>
            <Button
              variant="contained"
              onClick={() => navigate('/GraphExplorer')}
              startIcon={<Hub />}
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'white',
                backdropFilter: 'blur(10px)',
                boxShadow: 'none',
                borderRadius: 3,
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
              }}
            >
              Graph
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
                '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
              }}
            >
              Revoke
            </Button>
          </Box>

          {/* Decorative Graph BG */}
          <Box sx={{
            position: 'absolute',
            bottom: -20,
            left: 0,
            right: 0,
            opacity: 0.4,
            zIndex: 0,
            pointerEvents: 'none',
            mixBlendMode: 'overlay'
          }}>
            <ArfGraph data={demoData} height={100} />
          </Box>
        </Paper>
      </Box>

      {/* 2. Action Buttons (Removed - Moved to Card) */}

      {/* 3. Assets List */}
      <Box sx={{ px: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em' }}>
            Assets
          </Typography>
          {tokens.length > 0 && (
            <Chip
              label={`${tokens.length} token${tokens.length !== 1 ? 's' : ''}`}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: 'action.hover',
                color: 'text.secondary',
              }}
            />
          )}
        </Stack>

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
                balance={balanceStr}
                value={valStr}
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
        </Box>
      </Box>

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