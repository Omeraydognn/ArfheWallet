import React, { useEffect, useState } from "react";
import {
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
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

  const fetchData = async () => {
    if (!wallet_context || !active_context) return;
    setLoading(true);

    try {
      const net = wallet_context.networkProvider.getActiveNetwork();
      if (!net) return;

      const address = active_context.activeAccount?.GetAddress();
      if (!address) return;

      // Initialize cofhejs (TRUE FHE) if on Sepolia
      if (activeNetworkId === NetworkId.Ethereum_Sepolia && active_context.activeAccount) {
        try {
          const { default: FheCofheService } = await import("../backend/FheCofheService.js");
          const instance = FheCofheService.getInstance();

          if (!instance.isReadyForAccount(address)) {
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
      const WRAPPED_USDC_ADDRESS = (import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS?.toLowerCase();
      const WRAPPED_ETH_ADDRESS = (import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS?.toLowerCase();
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

      if (activeNetworkId === NetworkId.Ethereum_Sepolia) {
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
        return {
          name: cachedMeta?.name ?? (tb.isNative ? "Ethereum" : "Unknown Token"),
          symbol: cachedMeta?.symbol ?? (tb.isNative ? "ETH" : "???"),
          logoSrc: cachedMeta?.logoSrc ?? (tb.isNative ? "/logos/eth.png" : ""),
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

      const cached = wallet_context.tokenCache.getAllTokens(activeNetworkId) ?? [];

      // FIX: Use 'balanceMap' (local var) instead of 'balances' (stale state)
      // Filter out old wrapped USDC contracts
      const displayTokens = cached.filter(t => {
        if (IGNORED_CONTRACTS.includes(t.contractAddress.toLowerCase())) return false; // IGNORE OLD
        if (t.symbol === "ETH") return true;
        // Check local map
        const entry = balanceMap[t.contractAddress];
        return entry && parseFloat(entry.tokenBalance) > 0;
      });

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
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: activeNetworkId === NetworkId.Ethereum_Mainnet ? '#10b981' : '#f59e0b', mr: 1 }} />
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
        </Menu>

        <IconButton onClick={fetchData} disabled={loading} sx={{ bgcolor: 'background.paper', ml: 1 }}>
          <Refresh className={loading ? "animate-spin" : ""} />
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
        <Typography variant="h6" sx={{ px: 2, mb: 1, fontWeight: 700, color: 'text.primary' }}>
          Assets
        </Typography>

        <List disablePadding>
          {tokens.map((token: any) => {
            const b = balances[token.contractAddress];
            const balanceStr = b ? parseFloat(b.tokenBalance).toFixed(4) : "0.0000";
            const valStr = b?.totalValueUsd ? `$${b.totalValueUsd.toFixed(2)}` : "$0.00";

            return (
              <AssetItem
                key={token.contractAddress}
                symbol={token.symbol}
                name={token.name}
                balance={balanceStr}
                value={valStr}
                icon={token.logoSrc}
                isShielded={token.isShielded ?? false}
              />
            );
          })}
          {/* Fallback if no tokens found yet */}
          {tokens.length === 0 && !loading && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No assets found on this network.
            </Typography>
          )}
        </List>
      </Box>

    </Box>
  );
}

// Helper Components
function ActionButton({ icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <Button
        onClick={onClick}
        variant="text"
        sx={{
          width: 56,
          height: 56,
          borderRadius: 4,
          minWidth: 'auto',
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          '&:hover': {
            bgcolor: 'action.hover',
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.1)'
          }
        }}
      >
        {icon}
      </Button>
      <Typography variant="caption" fontWeight={600} color="text.secondary">{label}</Typography>
    </Box>
  );
}

function AssetItem({ symbol, name, balance, value, icon, isShielded = false }: {
  symbol: string,
  name: string,
  balance: string,
  value: string,
  icon: string,
  isShielded?: boolean
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        mb: 1.5,
        p: 0,
        borderRadius: 3,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        transition: 'all 0.2s',
        '&:hover': {
          bgcolor: 'action.hover',
          boxShadow: '0 4px 8px rgba(0,0,0,0.04)',
        }
      }}
    >
      <ListItem>
        <ListItemAvatar>
          <Avatar
            src={icon}
            sx={{
              bgcolor: isShielded ? 'rgba(139, 92, 246, 0.1)' : 'rgba(79, 70, 229, 0.1)',
              color: isShielded ? 'secondary.main' : 'primary.main',
              width: 42,
              height: 42,
            }}
          >
            {symbol?.[0]}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} color="text.primary">{symbol}</Typography>
              {isShielded && (
                <Chip
                  icon={<Shield sx={{ fontSize: 12 }} />}
                  label="Private"
                  size="small"
                  color="secondary"
                  sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                />
              )}
            </Box>
          }
          secondary={<Typography variant="caption" color="text.secondary">{name}</Typography>}
        />
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="subtitle1" fontWeight={700} color="text.primary">{value}</Typography>
          <Typography variant="caption" color="text.secondary">{balance} {symbol}</Typography>
        </Box>
      </ListItem>
    </Paper>
  );
}

export default Home;