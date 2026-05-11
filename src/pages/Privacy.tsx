import React, { useState, useContext, useCallback } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Stack,
  useTheme,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Lock,
  LockOpen,
  Security,
  Shield,
  Visibility,
  VisibilityOff,
  ContentCopy,
  CheckCircle,
  ErrorOutline,
  FiberManualRecord,
} from '@mui/icons-material';
import { WalletContext } from '../AppContext.js';
import { isFheNetwork, NetworkId } from '../backend/NetworkTypes.js';
import EncryptSolanaService from '../backend/EncryptSolanaService.js';
import { FheVaultService, type VaultEntry } from '../backend/FheVaultService.js';

type PrivacyLevel = 'open' | 'semi-open' | 'full';

// ── Solana Devnet — FHE Vault ──────────────────────────────────────────────

const SolanaEncryptPanel = () => {
  const theme = useTheme();
  const context = useContext(WalletContext);
  const activeAccount = context?.accountManager?.GetActive();
  const solanaAddress = (activeAccount as any)?.GetSolanaAddress?.() ?? "";
  const solanaKeypair = (activeAccount as any)?.solana_keypair;

  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [amountInput, setAmountInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const refreshVault = useCallback(() => {
    if (solanaAddress) setVaultEntries(FheVaultService.load(solanaAddress));
  }, [solanaAddress]);

  React.useEffect(() => { refreshVault(); }, [refreshVault]);

  const totalShielded = FheVaultService.totalShielded(solanaAddress);
  const activeCount = vaultEntries.filter(e => !e.revealed).length;

  const handleShield = useCallback(async () => {
    if (!amountInput || !solanaKeypair) return;
    setLoading(true);
    setError(null);
    try {
      const value = BigInt(Math.round(parseFloat(amountInput) * 1e9));
      const svc = EncryptSolanaService.getInstance();
      const result = await svc.createEncryptedInput(value, solanaKeypair.publicKey.toBytes());
      FheVaultService.add(solanaAddress, {
        id: result.ciphertextIdHex,
        amount: amountInput,
        revealed: false,
        source: 'shield',
      });
      refreshVault();
      setAmountInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [amountInput, solanaKeypair, solanaAddress, refreshVault]);

  const handleReveal = useCallback(async (entry: VaultEntry) => {
    if (!solanaKeypair) return;
    setRevealingId(entry.id);
    setError(null);
    try {
      const idBytes = new Uint8Array(entry.id.match(/.{2}/g)!.map(h => parseInt(h, 16)));
      const svc = EncryptSolanaService.getInstance();
      const result = await svc.readCiphertext(
        idBytes,
        solanaKeypair.publicKey.toBytes(),
        solanaKeypair.secretKey,
        0n,
      );
      const solAmount = (Number(result.value) / 1e9).toFixed(6).replace(/\.?0+$/, '') || "0";
      FheVaultService.markRevealed(solanaAddress, entry.id, solAmount);
      refreshVault();
    } catch (e) {
      setError(`Reveal failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRevealingId(null);
    }
  }, [solanaKeypair, solanaAddress, refreshVault]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleDelete = (id: string) => {
    FheVaultService.remove(solanaAddress, id);
    refreshVault();
  };

  const isDark = theme.palette.mode === 'dark';
  const cardBg = isDark
    ? 'linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.95) 100%)'
    : 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,244,248,0.95) 100%)';

  return (
    <Box sx={{ pb: 14 }}>
      <Container maxWidth="md" sx={{ py: 3 }}>

        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
            background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(16,185,129,0.35)',
          }}>
            <Lock sx={{ fontSize: 30, color: '#fff' }} />
          </Box>
          <Typography variant="h5" fontWeight={800} sx={{
            background: 'linear-gradient(to right, #10b981, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}>
            FHE Vault
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Powered by Encrypt.xyz · Solana Devnet
          </Typography>
        </Box>

        {/* Vault Balance Card */}
        <Paper elevation={0} sx={{
          p: 3, mb: 3, borderRadius: 4,
          background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.08) 100%)',
          border: '1px solid rgba(16,185,129,0.25)',
        }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Total Shielded
          </Typography>
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.5 }}>
            <Typography variant="h3" fontWeight={800} sx={{ color: '#10b981' }}>
              {totalShielded.toFixed(4)}
            </Typography>
            <Typography variant="h5" fontWeight={600} sx={{ color: '#10b981', opacity: 0.8 }}>SOL</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {activeCount} active ciphertext{activeCount !== 1 ? 's' : ''} · {vaultEntries.length} total entries
          </Typography>
        </Paper>

        {/* Shield Form */}
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 4, background: cardBg, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Shield SOL</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Encrypt a SOL amount via FHE. The ciphertext is stored on the Encrypt executor and tracked in your vault.
          </Typography>

          {!solanaKeypair && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              No Solana keypair found. Switch to a Solana Devnet account.
            </Alert>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
            <TextField
              label="Amount (SOL)"
              size="small"
              type="number"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              disabled={loading || !solanaKeypair}
              inputProps={{ min: 0, step: 0.001 }}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              onClick={handleShield}
              disabled={!amountInput || loading || !solanaKeypair}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Lock />}
              sx={{ whiteSpace: 'nowrap', bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }, fontWeight: 700 }}
            >
              {loading ? 'Encrypting…' : 'Shield'}
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Paper>

        {/* Vault Entries */}
        {vaultEntries.length > 0 ? (
          <Paper elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', overflow: 'hidden', mb: 3 }}>
            <Box sx={{ p: 2.5, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700}>Vault Entries</Typography>
              <Typography variant="caption" color="text.secondary">Ciphertext IDs stored on the Encrypt executor</Typography>
            </Box>
            <List disablePadding>
              {vaultEntries.map((item, idx) => (
                <ListItem
                  key={item.id}
                  divider={idx < vaultEntries.length - 1}
                  sx={{ py: 1.5, px: 2.5, flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}
                >
                  <ListItemAvatar sx={{ minWidth: 40, mt: 0.5 }}>
                    <Avatar sx={{
                      bgcolor: item.revealed ? 'rgba(100,100,100,0.1)' : 'rgba(16,185,129,0.12)',
                      color: item.revealed ? 'text.disabled' : '#10b981',
                      width: 36, height: 36,
                    }}>
                      {item.revealed ? <LockOpen fontSize="small" /> : <Lock fontSize="small" />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                        <Typography variant="body2" fontWeight={700} sx={{ color: item.revealed ? 'text.secondary' : '#10b981' }}>
                          {item.amount} SOL
                        </Typography>
                        {item.source === 'send' && (
                          <Chip label="from send" size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }} />
                        )}
                        {item.revealed && (
                          <Chip label="revealed" size="small" color="default" sx={{ height: 16, fontSize: '0.6rem' }} />
                        )}
                      </Stack>
                    }
                    secondary={
                      <Box>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.3 }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.id}
                          </Typography>
                          <Tooltip title={copied === item.id ? 'Copied!' : 'Copy ID'}>
                            <IconButton size="small" sx={{ p: 0.2 }} onClick={() => handleCopy(item.id)}>
                              {copied === item.id
                                ? <CheckCircle sx={{ fontSize: 12, color: '#10b981' }} />
                                : <ContentCopy sx={{ fontSize: 12 }} />}
                            </IconButton>
                          </Tooltip>
                        </Stack>
                        {item.revealed && item.revealedValue && (
                          <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 600, display: 'block', mt: 0.2 }}>
                            Decrypted: {item.revealedValue} SOL
                          </Typography>
                        )}
                        {item.txHash && (
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontFamily: 'monospace', mt: 0.2 }}>
                            tx: {item.txHash.slice(0, 8)}…{item.txHash.slice(-6)}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.disabled">
                          {new Date(item.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    }
                  />
                  <Stack direction="row" spacing={0.5} sx={{ ml: 'auto', flexShrink: 0, mt: 0.5 }}>
                    {!item.revealed && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={revealingId === item.id ? <CircularProgress size={12} /> : <Visibility />}
                        disabled={revealingId === item.id || !solanaKeypair}
                        onClick={() => handleReveal(item)}
                        sx={{ fontSize: '0.7rem', py: 0.3 }}
                      >
                        Reveal
                      </Button>
                    )}
                    <Tooltip title="Remove from vault">
                      <IconButton size="small" sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }} onClick={() => handleDelete(item.id)}>
                        <ErrorOutline fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </ListItem>
              ))}
            </List>
          </Paper>
        ) : (
          <Paper elevation={0} sx={{ p: 4, borderRadius: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', mb: 3 }}>
            <Lock sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.disabled">
              No encrypted entries yet. Shield SOL above or send a Private Transfer.
            </Typography>
          </Paper>
        )}

        {/* Info Box */}
        <Paper sx={{
          p: 2.5, borderRadius: 3,
          background: isDark ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.04)',
          border: '1px solid rgba(16,185,129,0.2)',
        }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#10b981', mb: 0.5 }}>How it works</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            1. <strong>Shield</strong> — your SOL amount is encrypted via FHE and stored on the Encrypt executor<br />
            2. <strong>Ciphertext ID</strong> — a unique on-chain identifier representing your encrypted amount<br />
            3. <strong>Reveal</strong> — use your keypair to decrypt and prove the hidden value<br />
            4. <strong>Private Send</strong> — enable FHE mode in the Send panel to attach encryption to transactions
          </Typography>
        </Paper>

      </Container>
    </Box>
  );
};

// ── EVM FHE Panel (existing) ───────────────────────────────────────────────

const EthFhePrivacyPanel = () => {
  const theme = useTheme();
  const context = useContext(WalletContext);
  const network = context?.networkProvider?.getActiveNetwork();
  const activeAccount = context?.accountManager?.GetActive();

  type EvmPrivacyLevel = 'open' | 'semi-open' | 'full';
  const [privacySetting, setPrivacySetting] = useState<EvmPrivacyLevel>('full');
  const [balances, setBalances] = useState({ eETH: "Encrypted", eUSDC: "Encrypted" });
  const [decrypted, setDecrypted] = useState({ eETH: false, eUSDC: false });
  const [loadingBalance, setLoadingBalance] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingDecryptToken, setPendingDecryptToken] = useState<string | null>(null);

  const CONTRACTS = {
    "USDC": { shielded: "0x8267F1C913454B3E0C6C523B737E90B81D330222" },
    "ETH": { shielded: "0x1267F2C913454B3E0C6C523B737E90B81D330333" },
  };

  const requestDecrypt = (tokenKey: string) => {
    setPendingDecryptToken(tokenKey);
    setPasswordOpen(true);
  };

  const handlePasswordSubmit = async () => {
    if (!pendingDecryptToken) return;
    setPasswordOpen(false);
    setPasswordInput("");
    const tokenKey = pendingDecryptToken;
    setLoadingBalance(tokenKey);
    try {
      if (!network || !activeAccount) throw new Error("Wallet not connected");
      const contractAddr = CONTRACTS[tokenKey === "eETH" ? "ETH" : "USDC"].shielded;
      const userAddr = activeAccount.GetAddress();
      if (!userAddr) throw new Error("No Address");
      const balance = await network.getShieldedBalance(contractAddr, userAddr, activeAccount);
      setBalances(prev => ({ ...prev, [tokenKey]: balance }));
      setDecrypted(prev => ({ ...prev, [tokenKey]: true }));
    } catch (e) {
      alert("Decryption Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingBalance("");
      setPendingDecryptToken(null);
    }
  };

  return (
    <Box sx={{ pb: 12, position: 'relative', minHeight: '80vh' }}>
      {/* Coming Soon overlay */}
      <Box sx={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
        backdropFilter: 'blur(12px)',
        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: { xs: 12, md: 16 },
      }}>
        <Paper elevation={24} sx={{
          p: { xs: 4, md: 6 }, borderRadius: 6, textAlign: 'center',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,244,248,0.98) 100%)',
          border: '1px solid', borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          maxWidth: 500, mx: 2,
        }}>
          <Box sx={{ width: 80, height: 80, borderRadius: '50%', mx: 'auto', mb: 3,
            background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock sx={{ fontSize: 40, color: '#10b981' }} />
          </Box>
          <Typography variant="h3" fontWeight={900} sx={{
            background: 'linear-gradient(to right, #10b981, #3b82f6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 2,
          }}>
            VERY SOON
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontSize: '1.1rem', lineHeight: 1.6 }}>
            Full FHE Privacy Shield with CONTRACT V5 support is under development.
          </Typography>
        </Paper>
      </Box>

      {/* Background content (blurred) */}
      <Box sx={{ pointerEvents: 'none', userSelect: 'none', opacity: 0.6 }}>
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Box sx={{ width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 3 }}>
              <Shield sx={{ fontSize: 40, color: '#fff' }} />
            </Box>
            <Typography variant="h4" fontWeight={800} gutterBottom>Privacy Shield</Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Manage your on-chain visibility and FHE encryption settings
            </Typography>
          </Box>

          <Paper elevation={0} sx={{ p: 0, borderRadius: 4, mb: 4, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" fontWeight={700}>Shielded Balances</Typography>
            </Box>
            <List>
              {['eETH', 'eUSDC'].map(token => (
                <ListItem key={token} divider>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}><Lock /></Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={token} secondary="Encrypted on-chain" />
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Typography variant="h6" fontFamily="monospace">
                      {loadingBalance === token ? <CircularProgress size={20} /> : balances[token as keyof typeof balances]}
                    </Typography>
                    <Button variant="outlined" size="small"
                      startIcon={decrypted[token as keyof typeof decrypted] ? <VisibilityOff /> : <Visibility />}
                      onClick={() => {
                        if (decrypted[token as keyof typeof decrypted]) {
                          setBalances(prev => ({ ...prev, [token]: "Encrypted" }));
                          setDecrypted(prev => ({ ...prev, [token]: false }));
                        } else {
                          requestDecrypt(token);
                        }
                      }}>
                      {decrypted[token as keyof typeof decrypted] ? "Hide" : "Decrypt"}
                    </Button>
                  </Stack>
                </ListItem>
              ))}
            </List>
          </Paper>

          <Paper elevation={0} sx={{ p: 1, borderRadius: 4, border: '1px solid', borderColor: 'divider', mb: 4 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              {(['open', 'semi-open', 'full'] as const).map(level => (
                <Button key={level} fullWidth onClick={() => setPrivacySetting(level)}
                  sx={{ py: 2, borderRadius: 3,
                    bgcolor: privacySetting === level ? 'background.paper' : 'transparent',
                    border: `2px solid ${privacySetting === level
                      ? (level === 'open' ? '#ef4444' : level === 'semi-open' ? '#f97316' : '#10b981')
                      : 'transparent'}`,
                    flexDirection: 'column', gap: 1 }}>
                  {level === 'open' ? <LockOpen /> : level === 'semi-open' ? <Security /> : <Lock />}
                  <Typography variant="body2" fontWeight={600}>
                    {level === 'open' ? 'Transparent' : level === 'semi-open' ? 'Obscured' : 'Fully Encrypted'}
                  </Typography>
                </Button>
              ))}
            </Stack>
          </Paper>
        </Container>
      </Box>

      <Dialog open={passwordOpen} onClose={() => setPasswordOpen(false)}>
        <DialogTitle>Enter Wallet Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Please enter your password to decrypt your shielded balance.
          </Typography>
          <TextField autoFocus fullWidth type="password" label="Password"
            value={passwordInput} onChange={e => setPasswordInput(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordOpen(false)}>Cancel</Button>
          <Button onClick={handlePasswordSubmit} variant="contained" disabled={!passwordInput}>Decrypt</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ── Main Privacy Panel ─────────────────────────────────────────────────────

const FHEPrivacyPanel = () => {
  const theme = useTheme();
  const context = useContext(WalletContext);
  const network = context?.networkProvider?.getActiveNetwork();
  const activeNetworkId = network?.network_id ?? NetworkId.Unknown;
  const showFhe = isFheNetwork(activeNetworkId);
  const isSolana = network?.type === "SOLANA";
  const isSolanaDevnet = activeNetworkId === NetworkId.Solana_Devnet;

  if (isSolana) {
    if (isSolanaDevnet) {
      return <SolanaEncryptPanel />;
    }
    return (
      <Box sx={{ pb: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: { xs: 12, md: 16 }, minHeight: '80vh' }}>
        <Paper elevation={24} sx={{
          p: { xs: 4, md: 6 }, borderRadius: 6, textAlign: 'center',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,244,248,0.98) 100%)',
          border: '1px solid', borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          maxWidth: 500, mx: 2,
        }}>
          <Box sx={{ width: 80, height: 80, borderRadius: '50%', mx: 'auto', mb: 3,
            background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield sx={{ fontSize: 40, color: '#2563eb' }} />
          </Box>
          <Typography variant="h4" fontWeight={900} sx={{
            background: 'linear-gradient(to right, #2563eb, #60a5fa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 2,
          }}>
            Solana Devnet Only
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontSize: '1.1rem', lineHeight: 1.6 }}>
            Encrypt.xyz FHE is only available on Solana Devnet. Switch to Solana Devnet to use FHE privacy features.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (!showFhe) {
    return (
      <Box sx={{ pb: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: { xs: 12, md: 16 }, minHeight: '80vh' }}>
        <Paper elevation={24} sx={{
          p: { xs: 4, md: 6 }, borderRadius: 6, textAlign: 'center',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,244,248,0.98) 100%)',
          border: '1px solid', borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          maxWidth: 500, mx: 2,
        }}>
          <Box sx={{ width: 80, height: 80, borderRadius: '50%', mx: 'auto', mb: 3,
            background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield sx={{ fontSize: 40, color: '#2563eb' }} />
          </Box>
          <Typography variant="h4" fontWeight={900} sx={{
            background: 'linear-gradient(to right, #2563eb, #60a5fa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 2,
          }}>
            Coming Soon
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontSize: '1.1rem', lineHeight: 1.6, mb: 2 }}>
            FHE Privacy features are available on testnet networks (Sepolia, Arbitrum Sepolia, Base Sepolia) and Solana Devnet.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return <EthFhePrivacyPanel />;
};

export default FHEPrivacyPanel;
