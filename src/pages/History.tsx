import React, { useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  Box,
  Container,
  Typography,
  Paper,
  Stack,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Skeleton,
  alpha,
  useTheme,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Lock,
  LockOpen,
  ArrowOutward,
  ArrowDownward,
  Shield,
  SwapVert,
  OpenInNew,
  FilterList,
  Close,
  ContentCopy,
  ReceiptLong,
  Speed,
  Cancel,
  HourglassTop,
  FileDownload,
} from "@mui/icons-material";
import { WalletContext } from "../AppContext";
import { TransactionHistory, PendingTransaction, isFheNetwork } from "../backend/NetworkTypes";
import { useToast } from "../components/ToastProvider";
import { downloadCsv } from "../backend/TransactionExportService";
import { useTranslation } from "react-i18next";
import { toUtf8String, formatEther } from "ethers";

/** Try to decode a UTF-8 memo from raw tx input hex.
 *  - Pure data (ETH transfer): entire input is the memo.
 *  - ERC20 transfer(address,uint256): first 68 bytes (4 selector + 32 addr + 32 amount) are ABI, rest is memo.
 */
function decodeMemo(inputHex: string | undefined): string | null {
  if (!inputHex || inputHex === "0x" || inputHex.length <= 2) return null;
  try {
    const raw = inputHex.startsWith("0x") ? inputHex.slice(2) : inputHex;
    // transfer(address,uint256) selector = a9059cbb, ABI data = 4+32+32 = 68 bytes = 136 hex chars
    const TRANSFER_SELECTOR = "a9059cbb";
    let memoHex: string;
    if (raw.startsWith(TRANSFER_SELECTOR) && raw.length > 136) {
      memoHex = raw.slice(136); // bytes after ABI
    } else if (!raw.startsWith(TRANSFER_SELECTOR)) {
      memoHex = raw; // pure data, e.g. ETH send with memo
    } else {
      return null; // transfer() with no extra data
    }
    if (!memoHex || memoHex.length === 0) return null;
    const decoded = toUtf8String("0x" + memoHex);
    // Only return if it contains printable chars (filter binary garbage)
    if (/[\x20-\x7E]/.test(decoded) && decoded.trim().length > 0) return decoded.trim();
    return null;
  } catch {
    return null;
  }
}

type FilterType = "all" | "confidential" | "public";

export default function History() {
  const { t } = useTranslation();
  const walletContext = useContext(WalletContext);
  const tokenCache = walletContext?.tokenCache;
  const activeAccount = walletContext?.accountManager?.GetActive();
  const network = walletContext?.networkProvider?.getActiveNetwork();
  const activeNetworkId = network?.network_id;
  const showFhe = activeNetworkId ? isFheNetwork(activeNetworkId) : false;

  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  // Reset filter when switching to a non-FHE network
  useEffect(() => {
    if (!showFhe && activeFilter !== "all") setActiveFilter("all");
  }, [showFhe]);

  const [nextBlock, setNextBlock] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TransactionHistory | null>(null);
  const [txMemo, setTxMemo] = useState<string | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);

  // Pending transaction state
  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [speedingUp, setSpeedingUp] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const pendingRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { showToast } = useToast();

  const theme = useTheme();

  // Lazy-fetch input data when detail modal opens
  useEffect(() => {
    if (!selectedTx || !network) {
      setTxMemo(null);
      return;
    }
    // Skip EVM memo fetch on Solana
    if (network.type === "SOLANA") {
      setTxMemo(null);
      setMemoLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setMemoLoading(true);
      setTxMemo(null);
      try {
        const txData = await network.call("eth_getTransactionByHash", [selectedTx.hash]) as { input?: string } | null;
        if (!cancelled && txData?.input) {
          setTxMemo(decodeMemo(txData.input));
        }
      } catch (e) {
      } finally {
        if (!cancelled) setMemoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTx, network]);

  // --- Pending transaction auto-refresh (every 5s) ---
  useEffect(() => {
    if (!network) return;

    const refreshPending = async () => {
      try {
        const remaining = await network.refreshPendingTransactions();
        setPendingTxs(remaining);
      } catch {
        // Silent fail
      }
    };

    // Initial load
    setPendingTxs(network.type === "SOLANA" ? [] : network.getPendingTransactions());

    // Auto-refresh every 5 seconds (skip on Solana — no nonce-replacement)
    if (network.type !== "SOLANA") {
      pendingRefreshRef.current = setInterval(refreshPending, 5000);
    }

    return () => {
      if (pendingRefreshRef.current) clearInterval(pendingRefreshRef.current);
    };
  }, [network]);

  // Speed-up handler
  const handleSpeedUp = async (ptx: PendingTransaction) => {
    if (!network || !activeAccount) return;
    setSpeedingUp(ptx.hash);
    try {
      const newHash = await network.speedUpTransaction(activeAccount, ptx.hash, 1.3);
      showToast(t("history.speedUpSuccess", { hash: newHash.slice(0, 10) }), "success");
      setPendingTxs(network.getPendingTransactions());
    } catch (err) {
      showToast((err instanceof Error ? err.message : String(err)) || t("history.speedUpFailed"), "error");
    } finally {
      setSpeedingUp(null);
    }
  };

  // Cancel handler
  const handleCancel = async (ptx: PendingTransaction) => {
    if (!network || !activeAccount) return;
    setCancelling(ptx.hash);
    try {
      await network.cancelTransaction(activeAccount, ptx.hash, 1.5);
      showToast(t("history.cancelSuccess"), "success");
      setPendingTxs(network.getPendingTransactions());
    } catch (err) {
      showToast((err instanceof Error ? err.message : String(err)) || t("history.cancelFailed"), "error");
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    if (!walletContext || !network || !activeAccount) {
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        setLoading(true);
        const isSolana = network?.type === "SOLANA";
        const address = isSolana ? activeAccount.GetSolanaAddress() : activeAccount.GetAddress();
        if (!address) return;
        const res = await network.getHistory(address, tokenCache);
        setTransactions(res.history);
        setNextBlock(res.nextBlock);
      } catch (err) {
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [network, tokenCache, activeAccount, walletContext]);

  const handleLoadMore = async () => {
    if (!walletContext || !network || !activeAccount || !nextBlock) return;
    const isSolana = network?.type === "SOLANA";
    const address = isSolana ? activeAccount.GetSolanaAddress() : activeAccount.GetAddress();
    if (!address) return;
    try {
      setLoadingMore(true);
      const res = await network.getHistory(address, tokenCache, nextBlock);
      setTransactions(prev => {
        const newTxs = res.history.filter(ntx => !prev.some(ptx => ptx.hash === ntx.hash));
        return [...prev, ...newTxs];
      });
      setNextBlock(res.nextBlock);
    } catch (err) {
    } finally {
      setLoadingMore(false);
    }
  };

  // Filter transactions based on active filter
  const filteredTransactions = transactions.filter((tx) => {
    if (activeFilter === "confidential") return tx.isShielded;
    if (activeFilter === "public") return !tx.isShielded;
    return true;
  });

  const isSolana = network?.type === "SOLANA";
  const userAddress = isSolana
    ? (activeAccount?.GetSolanaAddress() || "")
    : (activeAccount?.GetAddress()?.toLowerCase() || "");

  // Method label → color mapping
  const getMethodChipColor = (label: string): "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error" => {
    switch (label) {
      case "Swap": return "info";
      case "Wrap": return "info";
      case "Unwrap": return "warning";
      case "Shield Transfer": return "secondary";
      case "Contract Call": return "default";
      default: return "primary";
    }
  };

  // Method label → icon
  const getMethodIcon = (label: string) => {
    switch (label) {
      case "Swap": return <SwapVert sx={{ fontSize: 14 }} />;
      case "Wrap": return <Lock sx={{ fontSize: 14 }} />;
      case "Unwrap": return <LockOpen sx={{ fontSize: 14 }} />;
      case "Shield Transfer": return <Shield sx={{ fontSize: 14 }} />;
      case "Contract Call": return <SwapVert sx={{ fontSize: 14 }} />;
      default: return null;
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const formatValue = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    if (num === 0) return "0";
    if (num < 0.0001) return "<0.0001";
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  const filters: { key: FilterType; label: string; icon: React.ReactElement }[] = showFhe
    ? [
      { key: "all", label: "All", icon: <FilterList sx={{ fontSize: 16 }} /> },
      { key: "confidential", label: "Confidential", icon: <Lock sx={{ fontSize: 16 }} /> },
      { key: "public", label: "Public", icon: <LockOpen sx={{ fontSize: 16 }} /> },
    ]
    : [
      { key: "all", label: "All", icon: <FilterList sx={{ fontSize: 16 }} /> },
    ];

  return (
    <Box sx={{ pb: 12 }}>
      <Container maxWidth="md" sx={{ py: 3 }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Typography
            variant="h5"
            fontWeight={800}
            color="text.primary"
          >
            {t("history.title")}
          </Typography>

          {/* CSV Export Button */}
          {transactions.length > 0 && (
            <Tooltip title={t("history.exportCsv")}>
              <IconButton
                size="small"
                aria-label={t("history.exportCsv")}
                onClick={() => {
                  const isSolana = network?.type === "SOLANA";
                  const addr = isSolana ? (activeAccount?.GetSolanaAddress() || "") : (activeAccount?.GetAddress() || "");
                  downloadCsv(filteredTransactions, addr, {
                    filename: `arfhe_tx_${activeFilter}_${new Date().toISOString().split("T")[0]}`
                  });
                  showToast(t("history.exportSuccess"), "success");
                }}
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.2) },
                }}
              >
                <FileDownload sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        {/* Filter Chips */}
        <Stack direction="row" spacing={1} sx={{ mb: 3, justifyContent: "center" }}>
          {filters.map((f) => {
            const isActive = activeFilter === f.key;
            const count = f.key === "all"
              ? transactions.length
              : f.key === "confidential"
                ? transactions.filter((t) => t.isShielded).length
                : transactions.filter((t) => !t.isShielded).length;

            return (
              <Chip
                key={f.key}
                label={`${f.label} (${count})`}
                icon={f.icon}
                clickable
                onClick={() => setActiveFilter(f.key)}
                color={isActive ? "primary" : "default"}
                variant={isActive ? "filled" : "outlined"}
                sx={{
                  fontWeight: isActive ? 700 : 500,
                  transition: "all 0.2s ease",
                  ...(isActive && {
                    boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
                  }),
                }}
              />
            );
          })}
        </Stack>

        {/* Pending Transactions Section */}
        {pendingTxs.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              borderRadius: 4,
              bgcolor: alpha(theme.palette.warning.main, 0.04),
              backdropFilter: "blur(20px)",
              border: "1px solid",
              borderColor: alpha(theme.palette.warning.main, 0.2),
              boxShadow: `0 4px 20px ${alpha(theme.palette.warning.main, 0.08)}`,
              overflow: "hidden",
              mb: 3,
              animation: "pendingPulse 2s ease-in-out infinite",
              "@keyframes pendingPulse": {
                "0%": { borderColor: alpha(theme.palette.warning.main, 0.2) },
                "50%": { borderColor: alpha(theme.palette.warning.main, 0.5) },
                "100%": { borderColor: alpha(theme.palette.warning.main, 0.2) },
              },
            }}
          >
            {/* Pending Header */}
            <Box
              sx={{
                px: 2,
                py: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1,
                borderBottom: `1px solid ${alpha(theme.palette.warning.main, 0.15)}`,
                bgcolor: alpha(theme.palette.warning.main, 0.06),
              }}
            >
              <HourglassTop sx={{ fontSize: 18, color: "warning.main", animation: "spin 2s linear infinite", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } }} />
              <Typography variant="subtitle2" fontWeight={700} color="warning.dark">
                Pending Transactions ({pendingTxs.length})
              </Typography>
            </Box>

            {/* Pending Items */}
            <List sx={{ p: 0 }}>
              {pendingTxs.map((ptx, index) => {
                const isSpeedingThis = speedingUp === ptx.hash;
                const isCancellingThis = cancelling === ptx.hash;
                const elapsedSec = Math.floor((Date.now() - ptx.timestamp) / 1000);
                const elapsedStr = elapsedSec < 60
                  ? `${elapsedSec}s ago`
                  : elapsedSec < 3600
                    ? `${Math.floor(elapsedSec / 60)}m ago`
                    : `${Math.floor(elapsedSec / 3600)}h ago`;

                const shortTo = ptx.to ? `${ptx.to.slice(0, 6)}...${ptx.to.slice(-4)}` : "";
                const valueEth = (() => {
                  try {
                    const v = BigInt(ptx.value);
                    if (v === 0n) return "0";
                    return formatEther(v);
                  } catch { return "0"; }
                })();

                return (
                  <ListItem
                    key={ptx.hash}
                    sx={{
                      borderBottom: index < pendingTxs.length - 1 ? "1px solid" : "none",
                      borderColor: alpha(theme.palette.warning.main, 0.1),
                      px: 2,
                      py: 1.5,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 44 }}>
                      <Avatar
                        sx={{
                          width: 36,
                          height: 36,
                          bgcolor: alpha(theme.palette.warning.main, 0.12),
                          color: "warning.main",
                        }}
                      >
                        <CircularProgress size={18} color="warning" thickness={5} />
                      </Avatar>
                    </ListItemIcon>

                    <ListItemText
                      primary={
                        <Typography fontWeight={600} fontSize="0.9rem" color="warning.dark">
                          Pending {parseFloat(valueEth) > 0 ? `${parseFloat(valueEth).toFixed(4)} ETH` : "Transaction"}
                        </Typography>
                      }
                      secondaryTypographyProps={{ component: "div" }}
                      secondary={
                        <Stack direction="row" spacing={0.5} alignItems="center" mt={0.3} flexWrap="wrap">
                          <Chip
                            label="Pending"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                          />
                          <Typography variant="caption" fontFamily="monospace" color="text.secondary" sx={{ fontSize: 11 }}>
                            → {shortTo}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
                            • {elapsedStr}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                            (nonce: {ptx.nonce})
                          </Typography>
                        </Stack>
                      }
                    />

                    {/* Speed Up & Cancel Buttons */}
                    <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
                      <Tooltip title="Daha yüksek gas ile hızlandır" arrow>
                        <span>
                          <IconButton
                            size="small"
                            aria-label="Speed up transaction"
                            onClick={() => handleSpeedUp(ptx)}
                            disabled={isSpeedingThis || isCancellingThis}
                            sx={{
                              bgcolor: alpha(theme.palette.info.main, 0.1),
                              color: "info.main",
                              "&:hover": { bgcolor: alpha(theme.palette.info.main, 0.2) },
                              width: 32,
                              height: 32,
                            }}
                          >
                            {isSpeedingThis ? <CircularProgress size={14} color="info" /> : <Speed sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="İşlemi iptal et (self-transfer)" arrow>
                        <span>
                          <IconButton
                            size="small"
                            aria-label="Cancel transaction"
                            onClick={() => handleCancel(ptx)}
                            disabled={isSpeedingThis || isCancellingThis}
                            sx={{
                              bgcolor: alpha(theme.palette.error.main, 0.1),
                              color: "error.main",
                              "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.2) },
                              width: 32,
                              height: 32,
                            }}
                          >
                            {isCancellingThis ? <CircularProgress size={14} color="error" /> : <Cancel sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </ListItem>
                );
              })}
            </List>
          </Paper>
        )}

        {/* Transaction List */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: "blur(20px)",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: (theme) => theme.palette.mode === 'dark' ? '0 10px 40px -10px rgba(0,0,0,0.5)' : '0 10px 40px -10px rgba(0,0,0,0.05)',
            overflow: "hidden",
            mb: 4
          }}
        >
          {/* Loading State */}
          {loading && (
            <Box sx={{ p: 2 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Stack key={i} direction="row" spacing={2} alignItems="center" sx={{ py: 1.5 }}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="60%" height={24} />
                    <Skeleton variant="text" width="40%" height={18} />
                  </Box>
                </Stack>
              ))}
            </Box>
          )}

          {/* Empty State */}
          {!loading && filteredTransactions.length === 0 && (
            <Box sx={{ p: 8, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <ReceiptLong sx={{ fontSize: 64, color: "text.disabled", mb: 2, opacity: 0.5 }} />
              <Typography variant="h6" color="text.secondary" fontWeight={700}>
                {activeFilter === "confidential"
                  ? "No Confidential Transactions"
                  : activeFilter === "public"
                    ? "No Public Transactions"
                    : "No Transactions Yet"}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
                {activeFilter !== "all"
                  ? "Try switching the filter to see other transactions"
                  : "Your transaction history will appear here"}
              </Typography>
            </Box>
          )}

          {/* Transaction Items */}
          <List sx={{ p: 0 }}>
            {filteredTransactions.map((tx, index) => {
              const isSent = isSolana
                ? (tx.from === userAddress)
                : (tx.from.toLowerCase() === userAddress);
              const token = network ? tokenCache?.getToken(network.network_id, tx.contractAddress) : undefined;

              // Resolve symbol: check token cache, then native token
              let symbol = token?.symbol || (tx.isNative ? (isSolana ? "SOL" : "ETH") : "");
              if (!symbol && tx.isShielded) {
                const wrappedEth = (import.meta.env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
                const wrappedUsdc = (import.meta.env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
                if (tx.contractAddress.toLowerCase() === wrappedEth) symbol = "cETH";
                else if (tx.contractAddress.toLowerCase() === wrappedUsdc) symbol = "cUSDC";
                else symbol = "Shielded";
              }

              const isEncrypted = tx.value === "Encrypted";
              const counterparty = isSent ? tx.to : tx.from;
              const shortAddr = counterparty
                ? `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`
                : "";

              return (
                <ListItem
                  key={`${tx.hash}-${index}`}
                  disablePadding
                  sx={{
                    borderBottom: index < filteredTransactions.length - 1 ? "1px solid" : "none",
                    borderColor: "divider",
                  }}
                >
                  <ListItemButton
                    onClick={() => setSelectedTx(tx)}
                    sx={{
                      py: 1.5,
                      px: 2,
                      "&:hover": { bgcolor: "action.hover" },
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    {/* Direction Icon */}
                    <ListItemIcon sx={{ minWidth: 48 }}>
                      <Avatar
                        sx={{
                          width: 38,
                          height: 38,
                          bgcolor: tx.isShielded
                            ? alpha(theme.palette.secondary.main, 0.12)
                            : tx.methodLabel === "Swap"
                              ? alpha(theme.palette.info.main, 0.12)
                              : tx.methodLabel === "Wrap" || tx.methodLabel === "Unwrap"
                                ? alpha(theme.palette.info.main, 0.1)
                                : isSent
                                  ? alpha(theme.palette.text.primary, 0.06)
                                  : alpha(theme.palette.success.main, 0.1),
                          color: tx.isShielded
                            ? "secondary.main"
                            : tx.methodLabel === "Swap"
                              ? "info.main"
                              : tx.methodLabel === "Wrap" || tx.methodLabel === "Unwrap"
                                ? "info.main"
                                : isSent
                                  ? "text.secondary"
                                  : "success.main",
                        }}
                      >
                        {tx.isShielded ? (
                          <Shield sx={{ fontSize: 20 }} />
                        ) : tx.methodLabel === "Swap" ? (
                          <SwapVert sx={{ fontSize: 20 }} />
                        ) : tx.methodLabel === "Wrap" ? (
                          <Lock sx={{ fontSize: 20 }} />
                        ) : tx.methodLabel === "Unwrap" ? (
                          <LockOpen sx={{ fontSize: 20 }} />
                        ) : isSent ? (
                          <ArrowOutward sx={{ fontSize: 20 }} />
                        ) : (
                          <ArrowDownward sx={{ fontSize: 20 }} />
                        )}
                      </Avatar>
                    </ListItemIcon>

                    {/* Content */}
                    <ListItemText
                      primary={
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography
                            fontWeight={600}
                            fontSize="0.95rem"
                            color={
                              tx.isShielded
                                ? "secondary.main"
                                : tx.methodLabel === "Swap"
                                  ? "info.main"
                                  : tx.methodLabel === "Wrap" || tx.methodLabel === "Unwrap"
                                    ? "info.main"
                                    : isSent
                                      ? "text.primary"
                                      : "success.main"
                            }
                          >
                            {tx.methodLabel === "Swap"
                              ? "Swapped"
                              : tx.methodLabel === "Wrap"
                                ? "Wrapped"
                                : tx.methodLabel === "Unwrap"
                                  ? "Unwrapped"
                                  : isSent ? "Sent" : "Received"}{" "}
                            {isEncrypted ? (
                              <em style={{ fontWeight: 400, fontSize: "0.85rem" }}>Encrypted Amount </em>
                            ) : (
                              tx.value !== "0" && `${formatValue(tx.value)} `
                            )}
                            {symbol}
                          </Typography>
                        </Stack>
                      }
                      secondaryTypographyProps={{ component: "div" }}
                      secondary={
                        <Stack direction="row" spacing={0.75} alignItems="center" mt={0.5} flexWrap="wrap">
                          {/* Method label chip */}
                          <Chip
                            label={tx.methodLabel}
                            icon={getMethodIcon(tx.methodLabel) || undefined}
                            size="small"
                            color={getMethodChipColor(tx.methodLabel)}
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              "& .MuiChip-icon": { fontSize: 12 },
                            }}
                          />

                          {/* Status chip */}
                          <Chip
                            label={tx.status}
                            size="small"
                            color={tx.status === "Success" ? "success" : tx.status === "Pending" ? "warning" : "error"}
                            variant="outlined"
                            sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                          />

                          {/* Confidential badge */}
                          {tx.isShielded && (
                            <Chip
                              label="FHE"
                              icon={<Lock sx={{ fontSize: 10 }} />}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: 10,
                                fontWeight: 700,
                                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                                color: "secondary.main",
                                borderColor: alpha(theme.palette.secondary.main, 0.3),
                                "& .MuiChip-icon": { fontSize: 10, color: "secondary.main" },
                              }}
                              variant="outlined"
                            />
                          )}

                          {/* Address */}
                          <Typography
                            variant="caption"
                            fontFamily="monospace"
                            color="text.secondary"
                            sx={{ fontSize: 11 }}
                          >
                            {isSent ? `→ ${shortAddr}` : `← ${shortAddr}`}
                          </Typography>

                          {/* Time */}
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
                            • {formatDate(tx.timestamp)}
                          </Typography>
                        </Stack>
                      }
                    />

                    {/* External link icon */}
                    <Box sx={{ ml: 1, display: "flex", alignItems: "center" }}>
                      <OpenInNew sx={{ fontSize: 14, color: "text.disabled" }} />
                    </Box>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Paper>

        {/* Summary */}
        {!loading && transactions.length > 0 && (
          <Box sx={{ mt: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {nextBlock && activeFilter === "all" && (
              <Button
                variant="outlined"
                onClick={handleLoadMore}
                disabled={loadingMore}
                sx={{ mb: 2, borderRadius: 2, py: 1, px: 4, textTransform: "none", fontWeight: 600 }}
              >
                {loadingMore ? <CircularProgress size={24} color="inherit" /> : "Daha Fazla Göster (Load More)"}
              </Button>
            )}

            <Typography variant="caption" color="text.disabled" textAlign="center">
              Showing {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}
              {activeFilter !== "all" && ` (${activeFilter})`}
            </Typography>
          </Box>
        )}
      </Container>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <Dialog
          open={Boolean(selectedTx)}
          onClose={() => setSelectedTx(null)}
          fullWidth
          maxWidth="sm"
          aria-labelledby="tx-detail-title"
          PaperProps={{
            sx: {
              borderRadius: 4,
              overflow: "hidden",
              backgroundImage: "none",
              bgcolor: "background.paper",
              boxShadow: (theme) => theme.palette.mode === 'dark' ? "0 24px 48px rgba(0,0,0,0.5)" : "0 24px 48px rgba(0,0,0,0.15)",
            },
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 3,
              pb: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              bgcolor: "primary.main",
              color: "white",
            }}
          >
            <Typography id="tx-detail-title" variant="h6" fontWeight={700}>
              Transaction Details
            </Typography>
            <IconButton size="small" onClick={() => setSelectedTx(null)} sx={{ color: "white" }} aria-label="Close transaction details">
              <Close />
            </IconButton>
          </Box>

          <DialogContent sx={{ p: 4 }}>
            <Stack spacing={3}>
              <Box textAlign="center">
                <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={1}>
                  Status
                </Typography>
                <Box mt={0.5}>
                  <Chip
                    label={selectedTx.status}
                    color={selectedTx.status === "Success" ? "success" : selectedTx.status === "Pending" ? "warning" : "error"}
                    sx={{ fontWeight: 700, borderRadius: 2 }}
                  />
                </Box>
              </Box>

              <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Date & Time</Typography>
                  <Typography variant="body2" fontWeight={600}>{new Date(selectedTx.timestamp).toLocaleString()}</Typography>
                </Stack>
              </Box>

              <Stack spacing={1}>
                {/* Hash */}
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Transaction Hash</Typography>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", mr: 2 }}>
                    {selectedTx.hash}
                  </Typography>
                  <IconButton size="small" aria-label="Copy transaction hash" onClick={() => {
                    navigator.clipboard.writeText(selectedTx.hash);
                    showToast(t("history.hashCopied"), "success");
                  }}>
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Paper>

                {/* From / To */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mt: 2 }}>From / To</Typography>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Stack spacing={1.5}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">From:</Typography>
                      <Box display="flex" alignItems="center">
                        <Typography variant="body2" sx={{ fontFamily: "monospace", mr: 1, ...((isSolana ? selectedTx.from === userAddress : selectedTx.from.toLowerCase() === userAddress) && { fontWeight: 700, color: 'primary.main' }) }}>
                          {selectedTx.from.slice(0, 10)}...{selectedTx.from.slice(-8)}
                        </Typography>
                        <IconButton size="small" aria-label="Copy sender address" onClick={() => {
                          navigator.clipboard.writeText(selectedTx.from);
                          showToast(t("history.addressCopied"), "success");
                        }}>
                          <ContentCopy sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    </Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">To:</Typography>
                      <Box display="flex" alignItems="center">
                        <Typography variant="body2" sx={{ fontFamily: "monospace", mr: 1, ...((isSolana ? selectedTx.to === userAddress : selectedTx.to.toLowerCase() === userAddress) && { fontWeight: 700, color: 'primary.main' }) }}>
                          {selectedTx.to ? `${selectedTx.to.slice(0, 10)}...${selectedTx.to.slice(-8)}` : "Contract Creation"}
                        </Typography>
                        {selectedTx.to && (
                          <IconButton size="small" aria-label="Copy recipient address" onClick={() => {
                            navigator.clipboard.writeText(selectedTx.to);
                            showToast(t("history.addressCopied"), "success");
                          }}>
                            <ContentCopy sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </Box>
                    </Box>
                  </Stack>
                </Paper>
              </Stack>
            </Stack>

            {/* Decoded Memo/Note */}
            {memoLoading ? (
              <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 3, mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Loading note...</Typography>
              </Box>
            ) : txMemo ? (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Transaction Note</Typography>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 0.5, bgcolor: alpha(theme.palette.info.main, 0.04), borderColor: alpha(theme.palette.info.main, 0.2) }}>
                  <Typography variant="body2" sx={{ fontStyle: 'italic', wordBreak: 'break-word' }}>
                    {txMemo}
                  </Typography>
                </Paper>
              </Box>
            ) : null}
          </DialogContent>

          <Box sx={{ p: 3, pt: 0, display: "flex", justifyContent: "center" }}>
            <Button
              variant="outlined"
              color="primary"
              endIcon={<OpenInNew />}
              onClick={() => window.open(selectedTx.explorerUrl, "_blank")}
              sx={{ borderRadius: 3, px: 4, py: 1, fontWeight: 700, textTransform: "none" }}
            >
              View on Block Explorer
            </Button>
          </Box>
        </Dialog>
      )}
    </Box>
  );
}