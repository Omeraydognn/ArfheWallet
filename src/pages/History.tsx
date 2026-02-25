import React, { useContext, useEffect, useState } from "react";
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
  CircularProgress
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
} from "@mui/icons-material";
import { WalletContext } from "../AppContext";
import { TransactionHistory } from "../backend/NetworkTypes";

type FilterType = "all" | "confidential" | "public";

export default function History() {
  const walletContext = useContext(WalletContext);
  const tokenCache = walletContext?.tokenCache;
  const activeAccount = walletContext?.accountManager?.GetActive();
  const network = walletContext?.networkProvider?.getActiveNetwork();

  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [nextBlock, setNextBlock] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const theme = useTheme();

  useEffect(() => {
    if (!walletContext || !network || !activeAccount) {
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        setLoading(true);
        const address = activeAccount.GetAddress();
        if (!address) return;
        const res = await network.getHistory(address, tokenCache);
        setTransactions(res.history);
        setNextBlock(res.nextBlock);
      } catch (err) {
        console.error("Failed to fetch transaction history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [network, tokenCache, activeAccount, walletContext]);

  const handleLoadMore = async () => {
    if (!walletContext || !network || !activeAccount || !nextBlock) return;
    const address = activeAccount.GetAddress();
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
      console.error("Failed to load more transactions:", err);
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

  const userAddress = activeAccount?.GetAddress()?.toLowerCase() || "";

  // Method label → color mapping
  const getMethodChipColor = (label: string): "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error" => {
    switch (label) {
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

  const filters: { key: FilterType; label: string; icon: React.ReactElement }[] = [
    { key: "all", label: "All", icon: <FilterList sx={{ fontSize: 16 }} /> },
    { key: "confidential", label: "Confidential", icon: <Lock sx={{ fontSize: 16 }} /> },
    { key: "public", label: "Public", icon: <LockOpen sx={{ fontSize: 16 }} /> },
  ];

  return (
    <Box sx={{ pb: 12 }}>
      <Container maxWidth="md" sx={{ py: 3 }}>
        {/* Header */}
        <Typography
          variant="h5"
          fontWeight={800}
          textAlign="center"
          gutterBottom
          color="text.primary"
          sx={{ mb: 3 }}
        >
          Transaction History
        </Typography>

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

        {/* Transaction List */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            overflow: "hidden",
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
            <Box sx={{ p: 5, textAlign: "center" }}>
              <Typography variant="body1" color="text.secondary" fontWeight={500}>
                {activeFilter === "confidential"
                  ? "No confidential transactions found"
                  : activeFilter === "public"
                    ? "No public transactions found"
                    : "No transactions found"}
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
              const isSent = tx.from.toLowerCase() === userAddress;
              const token = tokenCache?.getToken(network.network_id, tx.contractAddress);

              // Resolve symbol: check token cache, then check if it's a known FHE contract
              let symbol = token?.symbol || (tx.isNative ? "ETH" : "");
              if (!symbol && tx.isShielded) {
                const wrappedEth = ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
                const wrappedUsdc = ((import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
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
                    borderBottom:
                      index < filteredTransactions.length - 1 ? "1px solid" : "none",
                    borderColor: "divider",
                  }}
                >
                  <ListItemButton
                    onClick={() => window.open(tx.explorerUrl, "_blank")}
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
                            : isSent
                              ? alpha(theme.palette.text.primary, 0.06)
                              : alpha(theme.palette.success.main, 0.1),
                          color: tx.isShielded
                            ? "secondary.main"
                            : isSent
                              ? "text.secondary"
                              : "success.main",
                        }}
                      >
                        {tx.isShielded ? (
                          <Shield sx={{ fontSize: 20 }} />
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
                                : isSent
                                  ? "text.primary"
                                  : "success.main"
                            }
                          >
                            {isSent ? "Sent" : "Received"}{" "}
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
                            color={tx.status === "Success" ? "success" : "error"}
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
    </Box>
  );
}