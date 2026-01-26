import { Close, Lock, LockOpen, ArrowOutward, ArrowDownward } from "@mui/icons-material";
import { Avatar, Box, Card, Chip, Container, Paper, Stack, Typography, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import { useContext, useEffect, useState } from "react";
import { WalletContext } from "../AppContext";
import { TransactionHistory, TokenWithMetadata } from "../backend/NetworkTypes";

function HistoryFilter() {
  return (
    <Stack direction="row" spacing={1} sx={{ mb: 4, justifyContent: 'center' }}>
      <Chip label="All" clickable color="primary" sx={{ fontWeight: 600 }} />
      <Chip label="Encrypted" clickable variant="outlined" icon={<Lock sx={{ fontSize: 16 }} />} />
      <Chip label="Public" clickable variant="outlined" icon={<LockOpen sx={{ fontSize: 16 }} />} />
    </Stack>
  );
}

export default function History() {
  const walletContext = useContext(WalletContext);
  const tokenCache = walletContext?.tokenCache;
  const activeAccount = walletContext?.accountManager?.GetActive();
  const network = walletContext?.networkProvider?.getActiveNetwork();

  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if context is fully ready
    if (!walletContext || !network || !activeAccount) {
      // If no network/account, just showing empty/loading state to prevent crash
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        setLoading(true);
        const history = await network.getHistory(activeAccount.GetAddress(), tokenCache);
        setTransactions(history);
      } catch (err) {
        console.error("Failed to fetch transaction history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [network, tokenCache, activeAccount, walletContext]);

  const getTransactionDescription = (tx: TransactionHistory, token: TokenWithMetadata | undefined) => {
    const isSent = tx.from.toLowerCase() === activeAccount?.GetAddress()?.toLowerCase();
    return {
      isSent,
      label: isSent ? "Sent" : "Received",
      color: isSent ? "text.secondary" : "success.main",
      action: isSent ? `To ${tx.to.slice(0, 6)}...` : `From ${tx.from.slice(0, 6)}...`
    }
  };

  const handleTransactionClick = (hash: string) => {
    window.open(`https://sepolia.etherscan.io/tx/${hash}`, "_blank");
  };

  return (
    <Box sx={{ pb: 12 }}>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={800} textAlign="center" gutterBottom color="text.primary">
          History
        </Typography>

        <HistoryFilter />

        <Paper elevation={0} sx={{
          borderRadius: 4,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden'
        }}>
          {loading && <Box sx={{ p: 4, textAlign: 'center' }}>Loading...</Box>}

          {!loading && transactions.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              No transactions found
            </Box>
          )}

          <List sx={{ p: 0 }}>
            {transactions.map((tx, index) => {
              const token = tokenCache?.getToken(network.network_id, tx.contractAddress);
              const meta = getTransactionDescription(tx, token);

              return (
                <ListItem
                  key={index}
                  disablePadding
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <ListItemButton
                    onClick={() => window.open(tx.explorerUrl, "_blank")}
                    sx={{ py: 2, '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <ListItemIcon>
                      <Avatar sx={{
                        bgcolor: meta.isSent ? 'action.hover' : 'rgba(16, 185, 129, 0.1)',
                        color: meta.isSent ? 'text.secondary' : 'success.main'
                      }}>
                        {meta.isSent ? <ArrowOutward /> : <ArrowDownward />}
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography fontWeight={600} color={meta.isSent ? 'text.primary' : 'success.main'}>
                          {meta.label} {tx.value} {token?.symbol || (tx.isNative ? 'ETH' : '')}
                        </Typography>
                      }
                      secondaryTypographyProps={{ component: "div" }}
                      secondary={
                        <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
                          <Chip
                            label={tx.status}
                            size="small"
                            color={tx.status === "Success" ? "success" : "error"}
                            variant="outlined"
                            sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                          />
                          <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                            {meta.action}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            • {new Date(tx.timestamp).toLocaleDateString()}
                          </Typography>
                        </Stack>
                      }
                    />
                    {/* Link Icon */}
                    <Box>
                      <ArrowOutward sx={{ fontSize: 16, color: 'text.disabled', transform: 'rotate(-45deg)' }} />
                    </Box>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Paper>
      </Container>
    </Box>
  );
}