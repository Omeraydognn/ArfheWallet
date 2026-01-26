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

  const [balances, setBalances] = useState({});
  // Initialize from cache immediately to prevent blank screen
  const [tokens, setTokens] = useState(() => {
    try {
      const initialNetId = wallet_context?.networkProvider?.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
      return wallet_context?.tokenCache?.getAllTokens(initialNetId) ?? [];
    } catch { return []; }
  });
  const [totalBalanceUsd, setTotalBalanceUsd] = useState(0.00);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);

  // Network Switcher State
  const [anchorEl, setAnchorEl] = useState(null);
  const openNetworkMenu = Boolean(anchorEl);

  const activeNetworkId = wallet_context?.networkProvider.getActiveNetworkId();
  const activeNetwork = wallet_context?.networkProvider.getActiveNetwork();

  const handleNetworkClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleNetworkClose = (networkId) => {
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

      // 1. Fetch Balances
      const tokenBalances = await net.getTokenBalances(
        wallet_context.tokenCache, address
      );

      // 2. Extract Contracts
      const contractAddresses = tokenBalances.map(t => t.contractAddress);

      // --- IMMEDIATE RENDER ---
      // We render the tokens immediately with 0 price, then update later.
      const initialDisplay = tokenBalances.map(tb => {
        const cachedMeta = wallet_context.tokenCache.getToken(activeNetworkId, tb.contractAddress);
        return {
          name: cachedMeta?.name ?? (tb.isNative ? "Ethereum" : "Unknown Token"),
          symbol: cachedMeta?.symbol ?? (tb.isNative ? "ETH" : "???"),
          logoSrc: cachedMeta?.logoSrc ?? (tb.isNative ? "/logos/eth.png" : ""),
          contractAddress: tb.contractAddress,
          decimals: cachedMeta?.decimals ?? 18
        };
      });
      setTokens(initialDisplay); // Show list instantly

      // 3. Fetch Prices (Async/Non-blocking)
      let currentPrices = {};
      try {
        currentPrices = await net.getTokenPrices(contractAddresses);
      } catch (e) { console.warn("Price fetch skipped"); }

      setPrices(currentPrices);

      // 4. Calculate Values & Update Display
      let totalUsd = 0;
      const balanceMap = {};

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

      setBalances(balanceMap);
      setTotalBalanceUsd(totalUsd);

      const cached = wallet_context.tokenCache.getAllTokens(activeNetworkId) ?? [];

      // FIX: Use 'balanceMap' (local var) instead of 'balances' (stale state)
      const displayTokens = cached.filter(t => {
        if (t.symbol === "ETH") return true;
        // Check local map
        const entry = balanceMap[t.contractAddress];
        return entry && parseFloat(entry.tokenBalance) > 0;
      });

      // Update the list or fallback to showing what we found in balances if cache is desync
      if (displayTokens.length > 0) {
        setTokens(displayTokens);
      } else {
        // Fallback layout if cache didn't match
        const fallback = Object.values(balanceMap).map((b: any) => ({
          name: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.name ?? (b.isNative ? "Ethereum" : "Token"),
          symbol: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.symbol ?? (b.isNative ? "ETH" : "???"),
          logoSrc: wallet_context.tokenCache.getToken(activeNetworkId, b.contractAddress)?.logoSrc ?? "",
          contractAddress: b.contractAddress,
          decimals: 18
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
          {tokens.map((token) => {
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
function ActionButton({ icon, label, onClick }) {
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

function AssetItem({ symbol, name, balance, value, icon }) {
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
              bgcolor: 'rgba(79, 70, 229, 0.1)',
              color: 'primary.main',
              width: 42,
              height: 42,
            }}
          >
            {symbol?.[0]}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={<Typography variant="subtitle1" fontWeight={700} color="text.primary">{symbol}</Typography>}
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