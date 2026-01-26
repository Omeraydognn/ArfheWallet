import * as React from 'react';
import { useState, useEffect, useContext } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Box,
  InputAdornment,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Stack
} from '@mui/material';
import {
  Bolt,
  Public,
  ArrowForward,
  ArrowBack,
  Refresh,
  Close,
  ContentCopy
} from '@mui/icons-material';
import { WalletContext } from "../AppContext.js";
import { ActiveAccountContext } from "../ActiveAccountProvider.js";
import { TrackedTransaction } from "../backend/ExplorerService.js";
import { formatEther, formatUnits } from 'ethers';

// Helper to handle Ethers v5 BigNumber conversion to BigInt for v6
const safeToBigInt = (val: any): bigint | undefined => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(Math.floor(val)); // Handle number, but careful with decimals
  if (typeof val === 'string') {
    if (val.startsWith('0x')) return BigInt(val);
    // If it's a decimal string like "0.5", we can't just BigInt it. 
    // But formatEther expects Wei (integer). 
    // If we have a string, assume it's integer string if it looks like one.
    if (/^\d+$/.test(val)) return BigInt(val);
    return undefined;
  }
  // Handle Ethers v5 BigNumber object { hex: '0x...', type: 'BigNumber' }
  if (val.hex) return BigInt(val.hex);
  return undefined;
};

const Explore = () => {
  const wallet_context = useContext(WalletContext);
  const active_context = useContext(ActiveAccountContext);
  const net = wallet_context?.networkProvider?.getActiveNetwork();
  const myAddress = active_context?.activeAccount?.GetAddress();

  // State
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [transactions, setTransactions] = useState<TrackedTransaction[]>([]);
  const [error, setError] = useState("");

  // Search & View State
  const [searchQuery, setSearchQuery] = useState('');
  const [viewAddress, setViewAddress] = useState<string | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);

  // Modal State
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Initialize View Address
  useEffect(() => {
    if (myAddress && !viewAddress) {
      setViewAddress(myAddress);
    }
  }, [myAddress]);

  // Fetch Logic
  const fetchHistory = async (reset = false, targetAddr = viewAddress) => {
    if (!net || !targetAddr) return;

    if (!net.explorerService || !net.explorerService.isReady()) {
      setError("Advanced Explorer features (History, Search) are not available. Please check your API Key configuration.");
      setLoading(false);
      return;
    }

    try {
      if (reset) {
        setLoading(true);
        setError("");
        setTransactions([]);
      } else {
        setLoadingMore(true);
      }

      const result = await net.explorerService.fetchHistory(targetAddr);

      if (reset) {
        setTransactions(result.transactions);
      } else {
        const currentIds = new Set(transactions.map(t => t.uniqueId));
        const newTxs = result.transactions.filter(t => !currentIds.has(t.uniqueId));
        setTransactions(prev => [...prev, ...newTxs]);
      }

    } catch (e: any) {
      console.error("Explore fetch error:", e);
      setError("Failed to fetch transaction history. " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (viewAddress && net) {
      fetchHistory(true, viewAddress);
    }
  }, [net?.network_id, viewAddress]);

  const handleSearch = async () => {
    if (!searchQuery || !net?.explorerService) return;
    setIsSearching(true);
    setError("");

    try {
      const result = await net.explorerService.search(searchQuery);

      if (result.type === 'ADDRESS') {
        setViewAddress(result.data);
        setSearchQuery('');
      } else if (result.type === 'TRANSACTION') {
        setSelectedTx(result.data);
        setDetailsOpen(true);
        setSearchQuery('');
      } else if (result.type === 'BLOCK') {
        setError(`Block Found: #${result.data.number} - Hash: ${result.data.hash}. (Detailed Block View Coming Soon)`);
      } else {
        setError("No results found. Try an Address, Tx Hash, or Block Number.");
      }
    } catch (e: any) {
      setError("Search failed: " + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRefresh = () => {
    fetchHistory(true);
  };

  const handleTxClick = async (tx: TrackedTransaction) => {
    try {
      setSelectedTx(tx);
      setDetailsOpen(true);

      if (net?.explorerService) {
        const raw = await net.explorerService.getTransactionDetails(tx.hash);
        if (raw) {
          setSelectedTx((prev: any) => ({ ...prev, ...raw }));
        }
      }

    } catch (e) {
      console.error("Failed to load tx details", e);
    }
  };

  const getMethodColor = (label: string) => {
    switch (label) {
      case 'Transfer': return 'primary';
      case 'Approve': return 'warning';
      case 'Swap': return 'secondary';
      case 'Reverted': return 'error';
      default: return 'default';
    }
  };

  const getDirectionIcon = (direction: string) => {
    if (direction === 'Sent') return <ArrowForward fontSize="small" color="error" />;
    return <ArrowBack fontSize="small" color="success" />;
  };

  if (loading && transactions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: 2 }}>
        <CircularProgress color="primary" />
        <Typography variant="body2" color="text.secondary">Indexing Blockchain History...</Typography>
      </Box>
    );
  }

  // Calculate safe values for render
  const safeValueDisplay = () => {
    if (!selectedTx) return "0 ETH";
    if (selectedTx.formattedValue) return selectedTx.formattedValue;

    // Fallback if only raw value exists
    const safeBig = safeToBigInt(selectedTx.value); // handles v5 BigNumber
    if (safeBig !== undefined) {
      return formatEther(safeBig) + " ETH";
    }
    return "0 ETH";
  };

  const safeGasPriceDisplay = () => {
    if (!selectedTx || !selectedTx.gasPrice) return "N/A";

    const safeBig = safeToBigInt(selectedTx.gasPrice);
    if (safeBig !== undefined) {
      try {
        return formatUnits(safeBig, "gwei") + " Gwei";
      } catch { return "Error"; }
    }
    return "N/A";
  };

  return (
    <Box sx={{ pb: 12 }}>
      <Container maxWidth="xl" sx={{ py: 4 }}>

        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" fontWeight={800} sx={{
            mb: 2,
            background: 'linear-gradient(45deg, #fff 30%, #a5b4fc 90%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Arfhe Explorer
          </Typography>

          <Box sx={{ maxWidth: 600, mx: 'auto', position: 'relative' }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search by Address, Tx Hash, or Block..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 50,
                  bgcolor: 'background.paper',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  pl: 3
                }
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      variant="contained"
                      onClick={handleSearch}
                      disabled={isSearching}
                      sx={{ borderRadius: 50, mr: -1, minWidth: 100, py: 1 }}
                    >
                      {isSearching ? <CircularProgress size={20} color="inherit" /> : "Search"}
                    </Button>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </Box>

        {error && <Alert severity="warning" sx={{ mb: 4 }} onClose={() => setError("")}>{error}</Alert>}

        {/* Responsive Layout without Grid */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 4 }}>

          {/* Stats / Sidebar */}
          <Box sx={{ width: { xs: '100%', lg: '30%' }, maxWidth: { lg: 350 } }}>
            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Public sx={{ mr: 1, color: 'primary.main' }} /> Network Status
              </Typography>

              <StatRow label="Network" value={net?.network_name || "Unknown"} />
              <StatRow label="Viewing Address" value={viewAddress ? `${viewAddress.slice(0, 10)}...${viewAddress.slice(-6)}` : "None"} />
              <StatRow label="Transactions Found" value={transactions.length} />

              {viewAddress !== myAddress && (
                <Button
                  fullWidth
                  variant="outlined"
                  color="secondary"
                  sx={{ mt: 2 }}
                  onClick={() => setViewAddress(myAddress)}
                >
                  Back to My Wallet
                </Button>
              )}
            </Paper>
          </Box>

          {/* Transactions List */}
          <Box sx={{ flex: 1, width: '100%', overflow: 'hidden' }}>
            <Paper sx={{ p: 0, borderRadius: 4, overflow: 'hidden', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6" fontWeight={700}>
                  {viewAddress === myAddress ? "My Transactions" : "Address History"}
                </Typography>
                <Button startIcon={<Refresh />} size="small" onClick={handleRefresh} disabled={loadingMore}>
                  Refresh
                </Button>
              </Box>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Method</TableCell>
                      <TableCell>Tx Hash</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell>From / To</TableCell>
                      <TableCell align="right">VALUE</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow
                        key={tx.uniqueId || tx.hash}
                        hover
                        onClick={() => handleTxClick(tx)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Chip
                            label={tx.status === 'Reverted' ? 'Reverted' : tx.methodLabel}
                            size="small"
                            color={getMethodColor(tx.status === 'Reverted' ? 'Reverted' : tx.methodLabel) as any}
                            variant={tx.status === 'Reverted' ? 'filled' : 'outlined'}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Bolt sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                            <Typography fontFamily="monospace" fontSize="0.875rem" color="primary">
                              {tx.hash.substring(0, 8)}...
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                          {new Date(tx.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              {getDirectionIcon(tx.direction)}
                            </Box>
                            <Box>
                              <Typography variant="caption" display="block" color="text.secondary">
                                {tx.direction === 'Sent' ? 'To:' : 'From:'}
                              </Typography>
                              <Typography fontFamily="monospace" fontSize="0.75rem" color="text.primary">
                                {tx.direction === 'Sent' ?
                                  (tx.to ? `${tx.to.slice(0, 6)}...` : 'Contract') :
                                  `${tx.from.slice(0, 6)}...`
                                }
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            color={tx.direction === 'Received' ? 'success.main' : 'text.primary'}
                          >
                            {tx.direction === 'Sent' ? '-' : '+'}{tx.formattedValue}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    {transactions.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                          <Typography color="text.secondary">No transactions found for this address.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        </Box>

        <Dialog
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 4 }
          }}
        >
          {/* Fix: set component="div" to avoid h2 > h6 nesting issues */}
          <DialogTitle component="div" sx={{ borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Transaction Details</Typography>
            <IconButton onClick={() => setDetailsOpen(false)}><Close /></IconButton>
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            {selectedTx && (
              <Stack spacing={2}>
                <DetailRow label="Transaction Hash" value={selectedTx.hash} copyable />
                <DetailRow label="Block Number" value={selectedTx.blockNumber?.toString() || selectedTx.blockNum} />
                <DetailRow label="From" value={selectedTx.from} copyable />
                <DetailRow label="To" value={selectedTx.to || "Contract Creation"} copyable />
                <DetailRow
                  label="Value"
                  value={safeValueDisplay()}
                />
                <DetailRow label="Nonce" value={selectedTx.nonce?.toString()} />
                <DetailRow
                  label="Gas Price"
                  value={safeGasPriceDisplay()}
                />
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button
              onClick={() => window.open(`https://etherscan.io/tx/${selectedTx?.hash}`, '_blank')}
              startIcon={<Public />}
            >
              View on Etherscan
            </Button>
            <Button onClick={() => setDetailsOpen(false)} variant="contained">Close</Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

const StatRow = ({ label, value, color = 'text.primary' }: any) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body1" fontWeight={600} color={color}>{value}</Typography>
  </Box>
);

const DetailRow = ({ label, value, copyable, code }: any) => (
  <Box sx={{ width: '100%', mb: 1 }}>
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="body2"
          sx={{
            wordBreak: 'break-all',
            fontFamily: code ? 'monospace' : 'inherit',
            bgcolor: code ? 'action.hover' : 'transparent',
            p: code ? 1 : 0,
            borderRadius: 1
          }}
        >
          {value || "N/A"}
        </Typography>
        {copyable && value && (
          <IconButton size="small" onClick={() => navigator.clipboard.writeText(value)}>
            <ContentCopy fontSize="inherit" />
          </IconButton>
        )}
      </Box>
    </Box>
  </Box>
);

export default Explore;
