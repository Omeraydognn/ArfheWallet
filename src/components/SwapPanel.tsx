/**
 * SwapPanel.tsx — Premium Glassmorphic Token Swap UI
 *
 * Features:
 *  • "You Pay" / "You Receive" cards with token selectors
 *  • Visual ↕ token switcher with rotate animation
 *  • Settings gear → Slippage Tolerance drawer (0.5%, 1%, 3%, custom)
 *  • Price Impact warning states (yellow / red)
 *  • Quote auto-refresh every 15 seconds
 *  • Consistent with ArfheWallet "Cyber-Glass" premium theme
 */

import React, { useState, useEffect, useContext, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Stack,
  Paper,
  TextField,
  CircularProgress,
  Fade,
  Collapse,
  Chip,
  Tooltip,
  alpha,
  useTheme,
  Select,
  MenuItem,
  InputAdornment,
} from "@mui/material";
import {
  SwapVert,
  Settings,
  Info,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  ExpandMore,
  OpenInNew,
  TrendingFlat,
  LocalGasStation,
} from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import { NetworkId } from "../backend/NetworkTypes.js";
import SwapService, { SwapToken, SwapQuote } from "../backend/SwapService.js";

import type { Theme } from "@mui/material/styles";

// ─── Glassmorphic Card Styles ──────────────────────────────────
const glassCardSx = (theme: Theme) => ({
  p: 1.5,
  borderRadius: 3,
  border: "1px solid",
  borderColor: alpha(theme.palette.divider, 0.12),
  bgcolor: alpha(theme.palette.background.paper, 0.6),
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  "&:hover": {
    borderColor: alpha(theme.palette.primary.main, 0.3),
    boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.08)}`,
  },
});

const tokenBadgeSx = (color: string) => ({
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.8rem",
  fontWeight: 800,
  color: "#fff",
  background: `linear-gradient(135deg, ${color}, ${color}99)`,
  boxShadow: `0 2px 8px ${color}40`,
  flexShrink: 0,
});

// ─── Helper: Explorer URL ──────────────────────────────────────
function getExplorerTxUrl(networkId: NetworkId | undefined, txHash: string): string {
  switch (networkId) {
    case NetworkId.Ethereum_Mainnet:
      return `https://etherscan.io/tx/${txHash}`;
    case NetworkId.Ethereum_Sepolia:
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case NetworkId.Arbitrum_One:
      return `https://arbiscan.io/tx/${txHash}`;
    case NetworkId.Arbitrum_Sepolia:
      return `https://sepolia.arbiscan.io/tx/${txHash}`;
    case NetworkId.Base_Mainnet:
      return `https://basescan.org/tx/${txHash}`;
    default:
      return `https://etherscan.io/tx/${txHash}`;
  }
}

// ─── Slippage Options ──────────────────────────────────────────
const SLIPPAGE_PRESETS = [
  { label: "0.5%", value: 50 },
  { label: "1%", value: 100 },
  { label: "3%", value: 300 },
];

// ─── Main Component ────────────────────────────────────────────
export default function SwapPanel() {
  const theme = useTheme();
  const { t } = useTranslation();
  const context = useContext(WalletContext);
  const network = context?.networkProvider?.getActiveNetwork();
  const activeAccount = context?.accountManager?.GetActive();
  const networkId = network?.network_id;

  const swapService = SwapService.getInstance();

  // ── Token State ──
  const tokens = networkId ? swapService.getTokens(networkId) : [];
  const [tokenIn, setTokenIn] = useState<SwapToken | null>(null);
  const [tokenOut, setTokenOut] = useState<SwapToken | null>(null);
  const [amountIn, setAmountIn] = useState("");
  const [balanceIn, setBalanceIn] = useState("0");
  const [balanceOut, setBalanceOut] = useState("0");

  // ── Quote State ──
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const quoteTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Swap State ──
  const [swapStatus, setSwapStatus] = useState<"idle" | "approving" | "swapping" | "success" | "error">("idle");
  const [swapTxHash, setSwapTxHash] = useState("");
  const [swapError, setSwapError] = useState("");

  // ── Settings ──
  const [showSettings, setShowSettings] = useState(false);
  const [slippageBps, setSlippageBps] = useState(50); // 0.5% default
  const [customSlippage, setCustomSlippage] = useState("");

  // ── Token Switcher Animation ──
  const [switchRotation, setSwitchRotation] = useState(0);

  // Check network support
  const isSupported = networkId ? swapService.isNetworkSupported(networkId) : false;

  // ── Initialize default tokens ──
  useEffect(() => {
    if (tokens.length >= 2) {
      if (!tokenIn) setTokenIn(tokens[0]); // ETH
      if (!tokenOut) setTokenOut(tokens[2] ?? tokens[1]); // USDC or WETH
    }
  }, [tokens.length, networkId]);

  // ── Fetch balances when tokens change ──
  useEffect(() => {
    if (!network || !activeAccount || !networkId) return;
    const isSolana = network.type === "SOLANA";
    const address = isSolana ? activeAccount.GetSolanaAddress() : activeAccount.GetAddress();
    if (!address) return;

    const fetchBalances = async () => {
      try {
        if (tokenIn) {
          const bal = await swapService.getTokenBalance(network, tokenIn, address);
          setBalanceIn(parseFloat(bal).toFixed(6));
        }
        if (tokenOut) {
          const bal = await swapService.getTokenBalance(network, tokenOut, address);
          setBalanceOut(parseFloat(bal).toFixed(6));
        }
      } catch (e) {
      }
    };

    fetchBalances();
  }, [tokenIn, tokenOut, network, activeAccount, networkId, swapStatus]);

  // ── Auto-fetch quote with debounce + 15s refresh ──
  const fetchQuote = useCallback(async () => {
    if (!network || !tokenIn || !tokenOut || !amountIn || parseFloat(amountIn) <= 0) {
      setQuote(null);
      setQuoteError("");
      return;
    }

    setQuoteLoading(true);
    setQuoteError("");

    try {
      const q = await swapService.getQuote(network, tokenIn, tokenOut, amountIn, slippageBps);
      setQuote(q);
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : t("swap.noQuotes"));
    } finally {
      setQuoteLoading(false);
    }
  }, [network, tokenIn, tokenOut, amountIn, slippageBps]);

  useEffect(() => {
    // Clear existing timer
    if (quoteTimerRef.current) clearInterval(quoteTimerRef.current);

    // Debounce initial fetch
    const debounce = setTimeout(() => {
      fetchQuote();
      // Auto-refresh every 15s
      quoteTimerRef.current = setInterval(fetchQuote, 15000);
    }, 600);

    return () => {
      clearTimeout(debounce);
      if (quoteTimerRef.current) clearInterval(quoteTimerRef.current);
    };
  }, [fetchQuote]);

  // ── Handle Token Switch ──
  const handleSwitchTokens = () => {
    setSwitchRotation((prev) => prev + 180);
    const tmpIn = tokenIn;
    const tmpOut = tokenOut;
    const tmpBalIn = balanceIn;
    const tmpBalOut = balanceOut;

    setTokenIn(tmpOut);
    setTokenOut(tmpIn);
    setBalanceIn(tmpBalOut);
    setBalanceOut(tmpBalIn);
    setAmountIn(""); // Reset amount
    setQuote(null);
  };

  // ── Handle Max ──
  const handleMax = () => {
    if (tokenIn?.isNative) {
      // Leave some ETH for gas
      const maxEth = Math.max(0, parseFloat(balanceIn) - 0.005);
      setAmountIn(maxEth > 0 ? maxEth.toFixed(6) : "0");
    } else {
      setAmountIn(balanceIn);
    }
  };

  // ── Execute Swap ──
  const handleSwap = async () => {
    if (!network || !activeAccount || !tokenIn || !tokenOut || !quote) return;

    setSwapStatus("approving");
    setSwapError("");
    setSwapTxHash("");

    try {
      // Step 1: Approve if needed
      if (!tokenIn.isNative && tokenIn.address !== "NATIVE") {
        setSwapStatus("approving");
        await swapService.checkAndApproveAllowance(network, activeAccount, tokenIn, quote.amountInRaw);
      }

      // Step 2: Execute swap
      setSwapStatus("swapping");
      const txHash = await swapService.executeSwap(
        network,
        activeAccount,
        tokenIn,
        tokenOut,
        quote,
        slippageBps
      );

      setSwapTxHash(txHash);

      // Wait for confirmation
      await network.waitForTransaction(txHash);
      setSwapStatus("success");

      // Reset after 4 seconds
      setTimeout(() => {
        setSwapStatus("idle");
        setAmountIn("");
        setQuote(null);
        setSwapTxHash("");
      }, 4000);
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : t("common.error"));
      setSwapStatus("error");
    }
  };

  // ── Slippage handler ──
  const handleCustomSlippage = (val: string) => {
    setCustomSlippage(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num <= 50) {
      setSlippageBps(Math.round(num * 100));
    }
  };

  // ── Price Impact Level ──
  const priceImpactLevel = quote
    ? quote.priceImpact > 15
      ? "high"
      : quote.priceImpact > 5
        ? "medium"
        : "low"
    : "low";

  // ── Insufficient balance ──
  const insufficientBalance = amountIn && parseFloat(amountIn) > parseFloat(balanceIn);
  const isSwapDisabled =
    !quote ||
    quoteLoading ||
    swapStatus !== "idle" ||
    insufficientBalance ||
    !amountIn ||
    parseFloat(amountIn) <= 0;

  // ── Not Supported State ──
  if (!isSupported) {
    return (
      <Box sx={{ textAlign: "center", py: 3 }}>
        <Typography variant="h6" color="text.secondary" fontWeight={700}>
          🔗 {t("swap.notAvailable")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, opacity: 0.7 }}>
          {t("swap.notAvailableDesc")}
        </Typography>
      </Box>
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────────
  return (
    <Box sx={{ position: "relative" }}>
      {/* ── Header: Title + Settings Gear ── */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography
          variant="subtitle1"
          fontWeight={800}
          sx={{
            background: "linear-gradient(135deg, #2563eb, #1e40af)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}
        >
          {t("swap.swapTokens")}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setShowSettings(!showSettings)}
          aria-label="Swap settings"
          sx={{
            color: showSettings ? "primary.main" : "text.secondary",
            transition: "all 0.3s",
            transform: showSettings ? "rotate(60deg)" : "rotate(0deg)",
            "&:hover": { color: "primary.main" },
          }}
        >
          <Settings sx={{ fontSize: 20 }} />
        </IconButton>
      </Stack>

      {/* ── Settings Drawer ── */}
      <Collapse in={showSettings}>
        <Paper
          elevation={0}
          sx={{
            ...glassCardSx(theme),
            mb: 1.5,
            p: 1.5,
          }}
        >
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem", mb: 1.5, display: "block" }}
          >
            {t("swap.slippage")}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {SLIPPAGE_PRESETS.map((preset) => (
              <Chip
                key={preset.value}
                label={preset.label}
                size="small"
                onClick={() => {
                  setSlippageBps(preset.value);
                  setCustomSlippage("");
                }}
                sx={{
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  bgcolor: slippageBps === preset.value && !customSlippage
                    ? alpha(theme.palette.primary.main, 0.2)
                    : "action.hover",
                  color: slippageBps === preset.value && !customSlippage
                    ? "primary.main"
                    : "text.secondary",
                  border: "1px solid",
                  borderColor: slippageBps === preset.value && !customSlippage
                    ? alpha(theme.palette.primary.main, 0.4)
                    : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                  },
                }}
              />
            ))}
            <TextField
              size="small"
              placeholder={t("swap.custom")}
              value={customSlippage}
              onChange={(e) => handleCustomSlippage(e.target.value)}
              InputProps={{
                endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">%</Typography></InputAdornment>,
                style: { fontSize: "0.78rem", fontWeight: 600 },
              }}
              sx={{
                width: 90,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  height: 32,
                },
              }}
            />
          </Stack>
          {slippageBps > 500 && (
            <Typography variant="caption" color="warning.main" fontWeight={600} sx={{ mt: 1, display: "block" }}>
              ⚠️ {t("swap.highSlippageWarning")}
            </Typography>
          )}
        </Paper>
      </Collapse>

      {/* ── YOU PAY Card ── */}
      <Paper elevation={0} sx={glassCardSx(theme)}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem" }}
          >
            {t("swap.youPay")}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
              {t("swap.balance")}: {balanceIn}
            </Typography>
            <Chip
              label="MAX"
              size="small"
              onClick={handleMax}
              sx={{
                height: 20,
                fontSize: "0.6rem",
                fontWeight: 800,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: "primary.main",
                cursor: "pointer",
                "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.2) },
              }}
            />
          </Stack>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1.5}>
          {/* Token Selector */}
          <Select
            value={tokenIn?.symbol ?? ""}
            onChange={(e) => {
              const t = tokens.find((tk) => tk.symbol === e.target.value);
              if (t) setTokenIn(t);
            }}
            size="small"
            renderValue={(val) => {
              const t = tokens.find((tk) => tk.symbol === val);
              return (
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  {t && <Box sx={tokenBadgeSx(t.logoColor)}>{t.symbol.charAt(0)}</Box>}
                  <Typography fontWeight={700} fontSize="0.9rem">{val}</Typography>
                </Stack>
              );
            }}
            sx={{
              minWidth: 130,
              borderRadius: 3,
              bgcolor: "action.hover",
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.06) },
            }}
          >
            {tokens.filter((t) => t.symbol !== tokenOut?.symbol).map((t) => (
              <MenuItem key={t.symbol} value={t.symbol}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={tokenBadgeSx(t.logoColor)}>{t.symbol.charAt(0)}</Box>
                  <Box>
                    <Typography fontWeight={700} fontSize="0.85rem">{t.symbol}</Typography>
                    <Typography variant="caption" color="text.secondary" fontSize="0.65rem">{t.name}</Typography>
                  </Box>
                </Stack>
              </MenuItem>
            ))}
          </Select>

          {/* Amount Input */}
          <TextField
            fullWidth
            placeholder="0.0"
            value={amountIn}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || /^\d*\.?\d*$/.test(val)) {
                setAmountIn(val);
              }
            }}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              style: {
                fontSize: "1.3rem",
                fontWeight: 700,
                textAlign: "right",
                color: insufficientBalance ? theme.palette.error.main : undefined,
              },
              inputProps: { style: { textAlign: "right" } },
            }}
          />
        </Stack>

        {insufficientBalance && (
          <Typography variant="caption" color="error.main" fontWeight={600} sx={{ mt: 0.5, display: "block", textAlign: "right" }}>
            {t("swap.insufficientBalance")}
          </Typography>
        )}
      </Paper>

      {/* ── SWITCH BUTTON ── */}
      <Box sx={{ display: "flex", justifyContent: "center", my: -1.5, position: "relative", zIndex: 2 }}>
        <IconButton
          onClick={handleSwitchTokens}
          aria-label="Switch swap direction"
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            border: `3px solid ${theme.palette.background.default}`,
            color: "primary.main",
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: `rotate(${switchRotation}deg)`,
            boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.2)}`,
            "&:hover": {
              bgcolor: alpha(theme.palette.primary.main, 0.25),
              transform: `rotate(${switchRotation}deg) scale(1.1)`,
              boxShadow: `0 6px 24px ${alpha(theme.palette.primary.main, 0.35)}`,
            },
          }}
        >
          <SwapVert sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* ── YOU RECEIVE Card ── */}
      <Paper elevation={0} sx={{ ...glassCardSx(theme), mt: -0.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem" }}
          >
            {t("swap.youReceive")}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
            {t("swap.balance")}: {balanceOut}
          </Typography>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1.5}>
          {/* Token Selector */}
          <Select
            value={tokenOut?.symbol ?? ""}
            onChange={(e) => {
              const t = tokens.find((tk) => tk.symbol === e.target.value);
              if (t) setTokenOut(t);
            }}
            size="small"
            renderValue={(val) => {
              const t = tokens.find((tk) => tk.symbol === val);
              return (
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  {t && <Box sx={tokenBadgeSx(t.logoColor)}>{t.symbol.charAt(0)}</Box>}
                  <Typography fontWeight={700} fontSize="0.9rem">{val}</Typography>
                </Stack>
              );
            }}
            sx={{
              minWidth: 130,
              borderRadius: 3,
              bgcolor: "action.hover",
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.06) },
            }}
          >
            {tokens.filter((t) => t.symbol !== tokenIn?.symbol).map((t) => (
              <MenuItem key={t.symbol} value={t.symbol}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={tokenBadgeSx(t.logoColor)}>{t.symbol.charAt(0)}</Box>
                  <Box>
                    <Typography fontWeight={700} fontSize="0.85rem">{t.symbol}</Typography>
                    <Typography variant="caption" color="text.secondary" fontSize="0.65rem">{t.name}</Typography>
                  </Box>
                </Stack>
              </MenuItem>
            ))}
          </Select>

          {/* Quoted Amount Display */}
          <Box sx={{ flex: 1, textAlign: "right" }}>
            {quoteLoading ? (
              <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1}>
                <CircularProgress size={16} sx={{ color: "primary.main" }} />
                <Typography variant="caption" color="text.secondary">{t("swap.fetchingQuote")}</Typography>
              </Stack>
            ) : quote ? (
              <Typography
                sx={{
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: "text.primary",
                  letterSpacing: "-0.02em",
                }}
              >
                {parseFloat(quote.amountOut).toFixed(tokenOut?.decimals === 6 ? 2 : 6)}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: "1.3rem", fontWeight: 700, color: "text.disabled" }}>
                0.0
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>

      {/* ── Quote Details ── */}
      {quote && (
        <Fade in>
          <Paper elevation={0} sx={{ ...glassCardSx(theme), mt: 1.5, p: 1.5 }}>
            <Stack spacing={1}>
              {/* Rate */}
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <TrendingFlat sx={{ fontSize: 14, color: "text.secondary" }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("swap.rate")}</Typography>
                </Stack>
                <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.78rem" }}>
                  {quote.executionPrice}
                </Typography>
              </Stack>

              {/* Price Impact */}
              {quote.priceImpact > 0 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Info sx={{ fontSize: 14, color: priceImpactLevel === "high" ? "error.main" : priceImpactLevel === "medium" ? "warning.main" : "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("swap.priceImpact")}</Typography>
                  </Stack>
                  <Chip
                    label={`${quote.priceImpact.toFixed(2)}%`}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      bgcolor: priceImpactLevel === "high"
                        ? alpha(theme.palette.error.main, 0.15)
                        : priceImpactLevel === "medium"
                          ? "rgba(245, 158, 11, 0.15)"
                          : alpha(theme.palette.success.main, 0.1),
                      color: priceImpactLevel === "high"
                        ? "error.main"
                        : priceImpactLevel === "medium"
                          ? "#f59e0b"
                          : "success.main",
                    }}
                  />
                </Stack>
              )}

              {/* Min Received */}
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("swap.minimumReceived")}</Typography>
                <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.75rem" }}>
                  {parseFloat(quote.minimumReceived).toFixed(tokenOut?.decimals === 6 ? 2 : 6)} {tokenOut?.symbol}
                </Typography>
              </Stack>

              {/* Fee Tier */}
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <LocalGasStation sx={{ fontSize: 14, color: "text.secondary" }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {quote.isWrapUnwrap ? t("swap.poolType") : t("swap.poolFee")}
                  </Typography>
                </Stack>
                <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.75rem" }}>
                  {quote.isWrapUnwrap ? t("swap.directWrapUnwrap") : `${(quote.fee / 10000).toFixed(2)}%`}
                </Typography>
              </Stack>

              {/* Slippage */}
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("swap.slippage")}</Typography>
                <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.75rem" }}>
                  {(slippageBps / 100).toFixed(1)}%
                </Typography>
              </Stack>

              {/* Price Source */}
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("swap.priceSource")}</Typography>
                <Chip
                  label={quote.isTestnet ? t("swap.coingeckoMarket") : t("swap.onChainPool")}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    bgcolor: alpha(theme.palette.info.main, 0.1),
                    color: "info.main",
                  }}
                />
              </Stack>

              {/* Testnet Deviation Warning */}
              {quote.isTestnet && quote.testnetDeviation !== undefined && quote.testnetDeviation > 5 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("swap.poolDeviation")}</Typography>
                  <Chip
                    label={`${quote.testnetDeviation.toFixed(1)}%`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      bgcolor: "rgba(245, 158, 11, 0.12)",
                      color: "#f59e0b",
                    }}
                  />
                </Stack>
              )}
            </Stack>

            {/* Testnet Info Banner */}
            {quote.isTestnet && (
              <Paper
                elevation={0}
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 2.5,
                  bgcolor: alpha(theme.palette.info.main, 0.06),
                  border: "1px solid",
                  borderColor: alpha(theme.palette.info.main, 0.15),
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Info sx={{ fontSize: 16, color: "info.main" }} />
                <Typography variant="caption" fontWeight={600} sx={{ fontSize: "0.7rem", color: "info.main" }}>
                  {t("swap.testnetInfo")}
                </Typography>
              </Paper>
            )}

            {/* Price Impact Warning Banner */}
            {priceImpactLevel !== "low" && (
              <Paper
                elevation={0}
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 2.5,
                  bgcolor: priceImpactLevel === "high"
                    ? alpha(theme.palette.error.main, 0.1)
                    : "rgba(245, 158, 11, 0.08)",
                  border: "1px solid",
                  borderColor: priceImpactLevel === "high"
                    ? alpha(theme.palette.error.main, 0.3)
                    : "rgba(245, 158, 11, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Warning
                  sx={{
                    fontSize: 18,
                    color: priceImpactLevel === "high" ? "error.main" : "#f59e0b",
                  }}
                />
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{
                    fontSize: "0.75rem",
                    color: priceImpactLevel === "high" ? "error.main" : "#f59e0b",
                  }}
                >
                  {priceImpactLevel === "high"
                    ? `⚠️ ${t("swap.highPriceImpact")}`
                    : t("swap.moderatePriceImpact")}
                </Typography>
              </Paper>
            )}
          </Paper>
        </Fade>
      )}

      {/* ── Quote Error ── */}
      {quoteError && !quoteLoading && (
        <Fade in>
          <Paper
            elevation={0}
            sx={{
              mt: 1.5,
              p: 1.5,
              borderRadius: 2.5,
              bgcolor: alpha(theme.palette.error.main, 0.08),
              border: "1px solid",
              borderColor: alpha(theme.palette.error.main, 0.2),
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <ErrorIcon sx={{ fontSize: 16, color: "error.main" }} />
            <Typography variant="caption" fontWeight={700} color="error.main" sx={{ fontSize: "0.75rem" }}>
              {quoteError}
            </Typography>
          </Paper>
        </Fade>
      )}

      {/* ── SWAP BUTTON ── */}
      <Box sx={{ mt: 1.5 }}>
        {swapStatus === "success" ? (
          <Fade in>
            <Box>
              <Button
                fullWidth
                variant="contained"
                disabled
                sx={{
                  borderRadius: 3,
                  height: 44,
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "#fff !important",
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                }}
                startIcon={<CheckCircle />}
              >
                {t("swap.swapSuccessful")}
              </Button>
              {swapTxHash && (
                <Button
                  fullWidth
                  size="small"
                  endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                  onClick={() => window.open(getExplorerTxUrl(networkId, swapTxHash), "_blank")}
                  sx={{
                    mt: 1,
                    color: "primary.main",
                    fontWeight: 600,
                    fontSize: "0.78rem",
                    textTransform: "none",
                  }}
                >
                  {t("swap.viewOnExplorer")}
                </Button>
              )}
            </Box>
          </Fade>
        ) : swapStatus === "error" ? (
          <Fade in>
            <Box>
              <Button
                fullWidth
                variant="contained"
                onClick={() => { setSwapStatus("idle"); setSwapError(""); }}
                sx={{
                  borderRadius: 3,
                  height: 44,
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  boxShadow: "0 4px 14px rgba(239, 68, 68, 0.25)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                  },
                }}
                startIcon={<ErrorIcon />}
              >
                {t("swap.retrySwap")}
              </Button>
              {swapError && (
                <Typography variant="caption" color="error.main" sx={{ mt: 1, display: "block", textAlign: "center", fontSize: "0.7rem" }}>
                  {swapError.length > 80 ? swapError.substring(0, 80) + "..." : swapError}
                </Typography>
              )}
            </Box>
          </Fade>
        ) : (
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleSwap}
            disabled={isSwapDisabled as boolean}
            sx={{
              borderRadius: 3,
              height: 44,
              fontWeight: 700,
              fontSize: "0.95rem",
              letterSpacing: "0.02em",
              background: insufficientBalance
                ? undefined
                : "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
              boxShadow: insufficientBalance
                ? "none"
                : "0 4px 14px rgba(37, 99, 235, 0.3)",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "linear-gradient(135deg, #172554 0%, #1e3a8a 100%)",
                boxShadow: "0 6px 20px rgba(37, 99, 235, 0.4)",
                transform: "translateY(-1px)",
              },
              "&.Mui-disabled": {
                background: theme.palette.mode === "dark"
                  ? "linear-gradient(135deg, #0b1120 0%, #172554 100%)"
                  : "linear-gradient(135deg, #bfdbfe 0%, #dbeafe 100%)",
                color: theme.palette.mode === "dark" ? "#1e3a8a" : "#3b82f6",
                boxShadow: "none",
              },
            }}
            endIcon={
              swapStatus === "approving" || swapStatus === "swapping" ? (
                <CircularProgress size={18} color="inherit" />
              ) : null
            }
          >
            {swapStatus === "approving"
              ? t("swap.approving")
              : swapStatus === "swapping"
                ? t("swap.swapping")
                : insufficientBalance
                  ? t("swap.insufficientBalance")
                  : !amountIn || parseFloat(amountIn) <= 0
                    ? t("swap.enterAmount")
                    : !quote
                      ? t("swap.fetchingQuotes")
                      : priceImpactLevel === "high"
                        ? t("swap.swapAnyway")
                        : t("swap.swap")}
          </Button>
        )}
      </Box>
    </Box>
  );
}
