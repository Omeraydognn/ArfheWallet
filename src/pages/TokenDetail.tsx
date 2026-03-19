import React, { useContext, useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
  Skeleton,
  alpha,
  useTheme,
} from "@mui/material";
import {
  ArrowBack,
  Send as SendIcon,
  CallReceived,
  ContentCopy,
  CheckCircle,
  OpenInNew,
  Shield,
  TrendingUp,
  TrendingDown,
  SwapVert,
} from "@mui/icons-material";
import { useNavigate, useParams, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { WalletContext } from "../AppContext.js";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import { useToast } from "../components/ToastProvider.js";
import { NetworkId } from "../backend/NetworkTypes.js";
import { getCoinGeckoBase } from "../backend/Network.js";
import { getAddress } from "ethers";
import ArfGraph from "../components/ArfGraph.js";

// ─── Known Token Logos ────────────────────────────────────────
const KNOWN_LOGOS: Record<string, string> = {
  "ETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  "WETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  "USDC": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  "USDT": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  "LINK": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
  "DAI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
  "UNI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
  "ARB": "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg",
};

const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 55%, 50%)`;
};

const getTokenLogoUrl = (contractAddress: string, logoSrc?: string, symbol?: string): string => {
  if (logoSrc && logoSrc.length > 0 && !logoSrc.startsWith("/logos/")) return logoSrc;
  const symUpper = symbol?.toUpperCase();
  if (symUpper && KNOWN_LOGOS[symUpper]) return KNOWN_LOGOS[symUpper];
  if (contractAddress === "ETH") return KNOWN_LOGOS["ETH"];
  if (contractAddress?.startsWith("0x")) {
    try {
      const checksummed = getAddress(contractAddress);
      return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${checksummed}/logo.png`;
    } catch { return ""; }
  }
  return "";
};

// Explorer URL helper
function getExplorerBase(networkId: NetworkId, explorerUrl?: string): string {
  if (explorerUrl) return explorerUrl;
  switch (networkId) {
    case NetworkId.Ethereum_Mainnet: return "https://etherscan.io";
    case NetworkId.Ethereum_Sepolia: return "https://sepolia.etherscan.io";
    case NetworkId.Arbitrum_One: return "https://arbiscan.io";
    case NetworkId.Arbitrum_Sepolia: return "https://sepolia.arbiscan.io";
    case NetworkId.Base_Mainnet: return "https://basescan.org";
    case NetworkId.Base_Sepolia: return "https://sepolia.basescan.org";
    default: return "https://etherscan.io";
  }
}

// Network color helper
function getNetworkColor(networkId: NetworkId): string {
  switch (networkId) {
    case NetworkId.Ethereum_Mainnet: return '#10b981';
    case NetworkId.Ethereum_Sepolia: return '#f59e0b';
    case NetworkId.Arbitrum_One: return '#2563eb';
    case NetworkId.Arbitrum_Sepolia: return '#60a5fa';
    case NetworkId.Base_Mainnet: return '#0052ff';
    case NetworkId.Base_Sepolia: return '#93c5fd';
    case NetworkId.Base_Sepolia: return '#93c5fd';
    default: return '#2563eb';
  }
}

// Time range type for price chart
type TimeRange = "1D" | "1W" | "1M" | "3M" | "1Y";

const RANGE_DAYS: Record<TimeRange, number> = {
  "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365,
};

// CoinGecko ID mapping for known symbols
const COINGECKO_IDS: Record<string, string> = {
  "ETH": "ethereum",
  "WETH": "ethereum",
  "USDC": "usd-coin",
  "USDT": "tether",
  "DAI": "dai",
  "LINK": "chainlink",
  "UNI": "uniswap",
  "AAVE": "aave",
  "ARB": "arbitrum",
  "OP": "optimism",
  "MATIC": "matic-network",
  "COMP": "compound-governance-token",
  "MKR": "maker",
  "SNX": "havven",
  "CRV": "curve-dao-token",
  "LDO": "lido-dao",
  "WBTC": "wrapped-bitcoin",
};

export default function TokenDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { address: contractAddr } = useParams<{ address: string }>();
  const location = useLocation();
  const passedLogo = (location.state as { logoSrc?: string } | null)?.logoSrc ?? "";
  const theme = useTheme();
  const { showToast } = useToast();

  const context = useContext(WalletContext);
  const { activeAccount } = useActiveAccount();
  const walletAddress = activeAccount?.GetAddress() ?? "";

  const activeNetwork = context?.networkProvider?.getActiveNetwork();
  const activeNetworkId = context?.networkProvider?.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
  const networkName = activeNetwork?.network_name ?? "Unknown";
  const networkColor = getNetworkColor(activeNetworkId);
  const explorerBase = getExplorerBase(activeNetworkId, activeNetwork?.explorer_url);

  // Token state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenLogo, setTokenLogo] = useState(passedLogo);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [tokenValueUsd, setTokenValueUsd] = useState(0);
  const [tokenPriceUsd, setTokenPriceUsd] = useState(0);
  const [isShielded, setIsShielded] = useState(false);
  const [decimals, setDecimals] = useState(18);
  const [isNative, setIsNative] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Price chart state
  const [priceData, setPriceData] = useState<{ x: number; y: number }[]>([]);
  const [priceLoading, setPriceLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("1W");
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null);

  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  // ─── Load token info from DataCacheService (in-memory) ───────
  useEffect(() => {
    if (!context || !contractAddr || !walletAddress) return;

    const addr = contractAddr.toLowerCase();

    // 1. Try DataCacheService (in-memory cache used by Home.tsx)
    const dataCache = context.dataCacheService;
    const cached = dataCache?.get(walletAddress, activeNetworkId);

    if (cached) {
      // Find token in cached tokens list
      const token = cached.tokens?.find(
        (t: { contractAddress: string }) => t.contractAddress.toLowerCase() === addr
      );
      if (token) {
        setTokenName(token.name || "");
        setTokenSymbol(token.symbol || "");
        if (!passedLogo) setTokenLogo(getTokenLogoUrl(token.contractAddress, token.logoSrc, token.symbol));
        setIsShielded(token.isShielded ?? false);
        setDecimals(token.decimals ?? 18);
      }

      // Get balance from cache
      const balance = cached.balances?.[contractAddr] ?? cached.balances?.[addr];
      if (balance) {
        const rawBal = parseFloat(balance.tokenBalance);
        setTokenBalance(
          rawBal > 0
            ? rawBal < 0.0001 ? '<0.0001' : rawBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
            : '0'
        );
        setTokenValueUsd(balance.totalValueUsd ?? 0);
        setTokenPriceUsd(balance.priceUsd ?? 0);
        setIsNative(balance.isNative ?? false);
      }

      setDataLoaded(true);
      return;
    }

    // 2. Fallback: Try tokenCache for metadata only
    const tokenCache = context.tokenCache;
    if (tokenCache) {
      const meta = tokenCache.getToken(activeNetworkId, contractAddr);
      if (meta) {
        setTokenName(meta.name || "");
        setTokenSymbol(meta.symbol || "");
        if (!passedLogo) setTokenLogo(getTokenLogoUrl(contractAddr, meta.logoSrc, meta.symbol));
        setDecimals(meta.decimals ?? 18);
      }
    }

    // 3. If still no data, fetch fresh from network
    const fetchFresh = async () => {
      try {
        const net = activeNetwork;
        if (!net) return;

        // Fetch balances
        const balances = await net.getTokenBalances(tokenCache, walletAddress);
        const entry = balances.find(
          (b: { contractAddress: string }) => b.contractAddress.toLowerCase() === addr
        );
        if (entry) {
          const rawBal = parseFloat(entry.tokenBalance);
          setTokenBalance(
            rawBal > 0
              ? rawBal < 0.0001 ? '<0.0001' : rawBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
              : '0'
          );
          setIsNative(entry.isNative ?? false);
          setTokenValueUsd(entry.totalValueUsd ?? 0);
          setTokenPriceUsd(entry.priceUsd ?? 0);
        }

        // Fetch metadata if not already loaded
        if (!tokenName && tokenCache) {
          const meta = await net.getTokenMetadata(tokenCache, contractAddr);
          if (meta) {
            setTokenName(meta.name || "");
            setTokenSymbol(meta.symbol || "");
            if (!passedLogo) setTokenLogo(getTokenLogoUrl(contractAddr, meta.logoSrc, meta.symbol));
            setDecimals(meta.decimals ?? 18);
          }
        }

        // Fetch price
        const prices = await net.getTokenPrices([contractAddr]);
        if (prices[addr]) {
          setTokenPriceUsd(prices[addr]);
        }
      } catch (err) {
      } finally {
        setDataLoaded(true);
      }
    };

    fetchFresh();
  }, [context, contractAddr, walletAddress, activeNetworkId, activeNetwork]);

  // Fetch price history from CoinGecko
  const fetchPriceHistory = useCallback(async (range: TimeRange) => {
    setPriceLoading(true);
    const sym = tokenSymbol.toUpperCase();
    const cgId = COINGECKO_IDS[sym];

    if (!cgId) {
      setPriceData([]);
      setPriceLoading(false);
      return;
    }

    try {
      const days = RANGE_DAYS[range];
      const res = await fetch(
        `${getCoinGeckoBase()}/coins/${cgId}/market_chart?vs_currency=usd&days=${days}`
      );
      const json = await res.json();

      if (json.prices && Array.isArray(json.prices)) {
        const points = json.prices.map(([ts, price]: [number, number], i: number) => ({
          x: i,
          y: price,
        }));
        setPriceData(points);

        // Calculate 24h change
        if (json.prices.length >= 2) {
          const first = json.prices[0][1];
          const last = json.prices[json.prices.length - 1][1];
          setPriceChange24h(((last - first) / first) * 100);
        }
      }
    } catch {
      setPriceData([]);
    } finally {
      setPriceLoading(false);
    }
  }, [tokenSymbol]);

  useEffect(() => {
    if (tokenSymbol) {
      fetchPriceHistory(timeRange);
    } else {
      setPriceLoading(false);
    }
  }, [tokenSymbol, timeRange, fetchPriceHistory]);

  const handleCopyAddress = async () => {
    if (!contractAddr) return;
    try {
      await navigator.clipboard.writeText(contractAddr);
      setCopied(true);
      showToast(t("tokenDetail.addressCopied"), "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t("tokenDetail.copyFailed"), "error");
    }
  };

  const fallbackColor = stringToColor(tokenSymbol || tokenName);
  const isPositive = (priceChange24h ?? 0) >= 0;
  const explorerTokenUrl = isNative
    ? `${explorerBase}/address/${walletAddress}`
    : `${explorerBase}/token/${contractAddr}`;

  // Format short address
  const shortAddress = contractAddr
    ? `${contractAddr.slice(0, 6)}...${contractAddr.slice(-4)}`
    : "";

  // Navigate to home and open the bottom menu with the correct tab + token prefilled
  const openMenuWithTab = (tab: number) => {
    navigate("/home");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-arf-menu', {
        detail: { tab, token: contractAddr || "ETH" }
      }));
    }, 150);
  };

  return (
    <Box sx={{
      minHeight: '100%',
      bgcolor: 'background.default',
      pb: 10,
    }}>
      {/* Header */}
      <Box sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'background.default',
        borderBottom: '1px solid',
        borderColor: 'divider',
        px: 1.5,
        py: 1,
      }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton onClick={() => navigate(-1)} size="small" aria-label={t("tokenDetail.back")}>
            <ArrowBack sx={{ fontSize: 20 }} />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
            {tokenSymbol || t("tokenDetail.title")}
          </Typography>
          <Chip
            icon={<Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: networkColor, flexShrink: 0 }} />}
            label={networkName}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.65rem',
              height: 22,
              bgcolor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
              '& .MuiChip-icon': { ml: 1 },
            }}
          />
        </Stack>
      </Box>

      {/* Token Identity */}
      <Box sx={{ textAlign: 'center', pt: 2.5, px: 2 }}>
        <Avatar
          src={!imgError ? tokenLogo : undefined}
          onError={() => setImgError(true)}
          sx={{
            width: 56,
            height: 56,
            mx: 'auto',
            mb: 1.5,
            bgcolor: imgError || !tokenLogo ? fallbackColor : 'transparent',
            color: '#fff',
            fontSize: '1.4rem',
            fontWeight: 700,
            border: '3px solid',
            borderColor: 'divider',
          }}
        >
          {(imgError || !tokenLogo) && (tokenSymbol ? tokenSymbol.substring(0, 2) : '?')}
        </Avatar>

        <Typography variant="h6" fontWeight={800} sx={{ mb: 0.25 }}>
          {tokenName || tokenSymbol}
        </Typography>

        <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ mb: 0.5 }}>
          {isShielded && (
            <Chip
              icon={<Shield sx={{ fontSize: '0.7rem !important', color: '#10b981 !important' }} />}
              label={t("tokenDetail.private")}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.62rem',
                fontWeight: 700,
                bgcolor: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                '& .MuiChip-label': { px: 0.5 },
                '& .MuiChip-icon': { ml: 0.5 },
              }}
            />
          )}
        </Stack>
      </Box>

      {/* Balance & Price */}
      <Box sx={{ textAlign: 'center', px: 2, mb: 1 }}>
        <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: -1 }}>
          ${tokenValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {tokenBalance} {tokenSymbol}
        </Typography>

        {tokenPriceUsd > 0 && (
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              ${tokenPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </Typography>
            {priceChange24h !== null && (
              <Chip
                icon={isPositive
                  ? <TrendingUp sx={{ fontSize: '0.7rem !important', color: '#10b981 !important' }} />
                  : <TrendingDown sx={{ fontSize: '0.7rem !important', color: '#ef4444 !important' }} />
                }
                label={`${isPositive ? '+' : ''}${priceChange24h.toFixed(2)}%`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  bgcolor: isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: isPositive ? '#10b981' : '#ef4444',
                  '& .MuiChip-label': { px: 0.5 },
                  '& .MuiChip-icon': { ml: 0.5 },
                }}
              />
            )}
          </Stack>
        )}
      </Box>

      {/* Quick Actions */}
      <Stack direction="row" spacing={1.5} sx={{ px: 2, mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<SendIcon sx={{ fontSize: 16 }} />}
          fullWidth
          onClick={() => openMenuWithTab(0)}
          sx={{
            borderRadius: 3,
            height: 42,
            fontWeight: 700,
            fontSize: '0.82rem',
            textTransform: 'none',
          }}
        >
          {t("tokenDetail.send")}
        </Button>
        <Button
          variant="outlined"
          startIcon={<CallReceived sx={{ fontSize: 16 }} />}
          fullWidth
          onClick={() => openMenuWithTab(1)}
          sx={{
            borderRadius: 3,
            height: 42,
            fontWeight: 700,
            fontSize: '0.82rem',
            textTransform: 'none',
          }}
        >
          {t("tokenDetail.receive")}
        </Button>
        <Button
          variant="outlined"
          startIcon={<SwapVert sx={{ fontSize: 16 }} />}
          fullWidth
          onClick={() => openMenuWithTab(2)}
          sx={{
            borderRadius: 3,
            height: 42,
            fontWeight: 700,
            fontSize: '0.82rem',
            textTransform: 'none',
          }}
        >
          {t("tokenDetail.swap")}
        </Button>
      </Stack>

      {/* Price Chart */}
      {COINGECKO_IDS[tokenSymbol.toUpperCase()] && (
        <Paper elevation={0} sx={{
          mx: 2,
          mb: 2,
          p: 2,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              {t("tokenDetail.priceHistory")}
            </Typography>
          </Stack>

          {/* Time Range Selector */}
          <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
            {(["1D", "1W", "1M", "3M", "1Y"] as TimeRange[]).map((range) => (
              <Chip
                key={range}
                label={range}
                size="small"
                onClick={() => setTimeRange(range)}
                sx={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  height: 24,
                  cursor: 'pointer',
                  bgcolor: timeRange === range ? alpha(theme.palette.primary.main, 0.15) : 'action.hover',
                  color: timeRange === range ? 'primary.main' : 'text.secondary',
                  border: timeRange === range ? '1px solid' : 'none',
                  borderColor: timeRange === range ? alpha(theme.palette.primary.main, 0.3) : 'transparent',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                }}
              />
            ))}
          </Stack>

          {/* Chart */}
          {priceLoading ? (
            <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
          ) : priceData.length > 1 ? (
            <ArfGraph
              data={priceData}
              height={140}
              stroke={isPositive ? '#10b981' : '#ef4444'}
            />
          ) : (
            <Box sx={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {t("tokenDetail.noChartData")}
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Token Details Card */}
      <Paper elevation={0} sx={{
        mx: 2,
        mb: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {t("tokenDetail.details")}
          </Typography>
        </Box>

        {/* Contract Address */}
        {!isNative && contractAddr && (
          <DetailRow
            label={t("tokenDetail.contractAddress")}
            value={shortAddress}
            action={
              <Stack direction="row" spacing={0.5}>
                <Tooltip title={copied ? t("tokenDetail.copied") : t("tokenDetail.copyAddress")}>
                  <IconButton size="small" onClick={handleCopyAddress} aria-label={t("tokenDetail.copyAddress")}>
                    {copied
                      ? <CheckCircle sx={{ fontSize: 15, color: 'success.main' }} />
                      : <ContentCopy sx={{ fontSize: 14 }} />
                    }
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("tokenDetail.viewOnExplorer")}>
                  <IconButton
                    size="small"
                    onClick={() => window.open(explorerTokenUrl, '_blank')}
                    aria-label={t("tokenDetail.viewOnExplorer")}
                  >
                    <OpenInNew sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            }
          />
        )}

        {/* Network */}
        <DetailRow
          label={t("tokenDetail.network")}
          value={
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: networkColor }} />
              <span>{networkName}</span>
            </Stack>
          }
        />

        {/* Token Standard */}
        <DetailRow
          label={t("tokenDetail.tokenStandard")}
          value={isNative ? t("tokenDetail.native") : "ERC-20"}
        />

        {/* Decimals */}
        <DetailRow
          label={t("tokenDetail.decimals")}
          value={String(decimals)}
          isLast
        />
      </Paper>

      {/* View on Explorer Button */}
      <Box sx={{ px: 2 }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<OpenInNew sx={{ fontSize: 16 }} />}
          onClick={() => window.open(explorerTokenUrl, '_blank')}
          sx={{
            borderRadius: 3,
            height: 44,
            fontWeight: 700,
            fontSize: '0.82rem',
            textTransform: 'none',
            color: 'text.secondary',
            borderColor: 'divider',
          }}
        >
          {t("tokenDetail.viewOnExplorer")}
        </Button>
      </Box>
    </Box>
  );
}

// ─── Detail Row Sub-component ──────────────────────────────────

function DetailRow({
  label,
  value,
  action,
  isLast = false,
}: {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      px: 2,
      py: 1.25,
      ...(!isLast && {
        borderBottom: '1px solid',
        borderColor: 'divider',
      }),
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>
          {value}
        </Typography>
        {action}
      </Stack>
    </Box>
  );
}
