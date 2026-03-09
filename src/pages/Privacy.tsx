import React, { useState, useContext, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Stack,
  Chip,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Lock,
  LockOpen,
  Security,
  Shield,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import { WalletContext } from '../AppContext.js';
import { isFheNetwork, NetworkId } from '../backend/NetworkTypes.js';

type PrivacyLevel = 'open' | 'semi-open' | 'full';

// Demo Contracts (Same as ArfBottomMenu)
const CONTRACTS = {
  "USDC": {
    public: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    shielded: "0x8267F1C913454B3E0C6C523B737E90B81D330222"
  },
  "ETH": {
    public: "ETH",
    shielded: "0x1267F2C913454B3E0C6C523B737E90B81D330333"
  }
};

const FHEPrivacyPanel = () => {
  const theme = useTheme();
  const context = useContext(WalletContext);
  const network = context?.networkProvider?.getActiveNetwork();
  const activeAccount = context?.accountManager?.GetActive();
  const activeNetworkId = network?.network_id ?? NetworkId.Unknown;
  const showFhe = isFheNetwork(activeNetworkId);

  // On mainnet, show a dedicated "FHE not available on mainnet" message
  if (!showFhe) {
    return (
      <Box sx={{ pb: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: { xs: 12, md: 16 }, minHeight: '80vh' }}>
        <Paper elevation={24} sx={{
          p: { xs: 4, md: 6 },
          borderRadius: 6,
          textAlign: 'center',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,244,248,0.98) 100%)',
          border: '1px solid',
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          boxShadow: theme.palette.mode === 'dark' ? '0 25px 50px -12px rgba(0,0,0,0.5)' : '0 25px 50px -12px rgba(0,0,0,0.1)',
          maxWidth: 500,
          mx: 2
        }}>
          <Box sx={{
            width: 80, height: 80, borderRadius: '50%', mx: 'auto', mb: 3,
            background: 'rgba(37, 99, 235, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Shield sx={{ fontSize: 40, color: '#2563eb' }} />
          </Box>
          <Typography variant="h4" fontWeight={900} sx={{
            background: 'linear-gradient(to right, #2563eb, #60a5fa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 2,
            letterSpacing: '-0.02em'
          }}>
            Coming Soon
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontSize: '1.1rem', lineHeight: 1.6, mb: 2 }}>
            FHE Privacy features are currently available only on testnet networks. Switch to a testnet (Sepolia, Arbitrum Sepolia, or Base Sepolia) to explore privacy features.
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.85rem' }}>
            Mainnet FHE support will be enabled once smart contracts are deployed.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const [privacySetting, setPrivacySetting] = useState<PrivacyLevel>('full');

  // Balances State
  const [balances, setBalances] = useState({ eETH: "Encrypted", eUSDC: "Encrypted" });
  const [decrypted, setDecrypted] = useState({ eETH: false, eUSDC: false });
  const [loadingBalance, setLoadingBalance] = useState(""); // Key of token loading

  // Password / Dialog State
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingDecryptToken, setPendingDecryptToken] = useState<string | null>(null);

  // History State (Mock)
  const [history, setHistory] = useState([
    { id: 1, action: 'Confidential Transfer (eETH)', encrypted: true, hash: '0x3a...12c' },
    { id: 2, action: 'Shield Assets (ETH -> eETH)', encrypted: false, hash: '0x8b...44a' },
  ]);

  const handleSetPrivacy = (setting: PrivacyLevel) => {
    setPrivacySetting(setting);
  };

  const requestDecrypt = (tokenKey: string) => {
    setPendingDecryptToken(tokenKey);
    setPasswordOpen(true);
  };

  const handlePasswordSubmit = async () => {
    if (!pendingDecryptToken) return;
    setPasswordOpen(false);
    setPasswordInput("");

    // Start Decryption Logic
    const tokenKey = pendingDecryptToken;
    setLoadingBalance(tokenKey);

    try {
      if (!network || !activeAccount) throw new Error("Wallet not connected");

      const contractAddr = tokenKey === "eETH" ? CONTRACTS.ETH.shielded : CONTRACTS.USDC.shielded;
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
      {/* Blurred Overlay */}
      <Box sx={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 10,
        backdropFilter: 'blur(12px)',
        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        pt: { xs: 12, md: 16 } // Positioned near top to prevent scrolling down
      }}>
        <Paper elevation={24} sx={{
          p: { xs: 4, md: 6 },
          borderRadius: 6,
          textAlign: 'center',
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,24df4,248,0.98) 100%)',
          border: '1px solid',
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          boxShadow: theme.palette.mode === 'dark' ? '0 25px 50px -12px rgba(0,0,0,0.5)' : '0 25px 50px -12px rgba(0,0,0,0.1)',
          maxWidth: 500,
          mx: 2
        }}>
          <Box sx={{
            width: 80, height: 80, borderRadius: '50%', mx: 'auto', mb: 3,
            background: 'rgba(16, 185, 129, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Lock sx={{ fontSize: 40, color: '#10b981' }} />
          </Box>
          <Typography variant="h3" fontWeight={900} sx={{
            background: 'linear-gradient(to right, #10b981, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 2,
            letterSpacing: '-0.02em'
          }}>
            VERY SOON
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontSize: '1.1rem', lineHeight: 1.6 }}>
            The full FHE Privacy Shield management center is currently under development. You will soon have absolute control over your on-chain visibility.
          </Typography>
        </Paper>
      </Box>

      {/* Existing Content Container */}
      <Box sx={{ pointerEvents: 'none', userSelect: 'none', opacity: 0.6 }}>
        <Container maxWidth="md" sx={{ py: 4 }}>

          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Box sx={{
              width: 80, height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mx: 'auto', mb: 3,
              boxShadow: '0 10px 20px rgba(16, 185, 129, 0.3)'
            }}>
              <Shield sx={{ fontSize: 40, color: '#fff' }} />
            </Box>
            <Typography variant="h4" fontWeight={800} gutterBottom color="text.primary">
              Privacy Shield
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Manage your on-chain visibility and FHE encryption settings
            </Typography>
            <Typography variant="h6" color="#000000ff" >
              VERY COMİNG SOON with CONTRACT V5 support!
            </Typography>
          </Box>

          {/* Shielded Balances */}
          <Paper elevation={0} sx={{ p: 0, borderRadius: 4, mb: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" fontWeight={700}>Shielded Balances</Typography>
              <Typography variant="caption" color="text.secondary">Only you can view these balances (using FHE Decryption).</Typography>
            </Box>
            <List>
              {['eETH', 'eUSDC'].map((token) => (
                <ListItem key={token} divider>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}><Lock /></Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={token}
                    secondary={decrypted[token as keyof typeof decrypted] ? "Decrypted" : "Encrypted on-chain"}
                  />

                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Typography variant="h6" fontFamily="monospace">
                      {loadingBalance === token ? <CircularProgress size={20} /> : balances[token as keyof typeof balances]}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={decrypted[token as keyof typeof decrypted] ? <VisibilityOff /> : <Visibility />}
                      onClick={() => {
                        if (decrypted[token as keyof typeof decrypted]) {
                          // Re-encrypt (Hide)
                          setBalances(prev => ({ ...prev, [token]: "Encrypted" }));
                          setDecrypted(prev => ({ ...prev, [token]: false }));
                        } else {
                          requestDecrypt(token);
                        }
                      }}
                    >
                      {decrypted[token as keyof typeof decrypted] ? "Hide" : "Decrypt"}
                    </Button>
                  </Stack>
                </ListItem>
              ))}
            </List>
          </Paper>

          {/* Privacy Control Panel */}
          <Paper elevation={0} sx={{
            p: 1,
            borderRadius: 4,
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid',
            borderColor: 'divider',
            mb: 4,
          }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <PrivacyOption
                label="Transparent"
                active={privacySetting === 'open'}
                color="error"
                icon={<LockOpen />}
                onClick={() => handleSetPrivacy('open')}
              />
              <PrivacyOption
                label="Obscured"
                active={privacySetting === 'semi-open'}
                color="warning"
                icon={<Security />}
                onClick={() => handleSetPrivacy('semi-open')}
              />
              <PrivacyOption
                label="Fully Encrypted"
                active={privacySetting === 'full'}
                color="success"
                icon={<Lock />}
                onClick={() => handleSetPrivacy('full')}
              />
            </Stack>
          </Paper>

          {/* Info Box */}
          <Paper sx={{
            p: 3,
            mb: 4,
            borderRadius: 3,
            background: 'linear-gradient(to right, rgba(37, 99, 235, 0.05), transparent)',
            borderLeft: '4px solid #2563eb'
          }}>
            <Typography variant="body2" color="text.secondary">
              Current Status:
              <Box component="span" sx={{ color: 'primary.main', fontWeight: 700, ml: 1 }}>
                {privacySetting === 'full' ? 'Network Confidentiality Active' : 'Limited Protection'}
              </Box>
            </Typography>
          </Paper>

          {/* Recent Activity */}
          <Paper elevation={0} sx={{
            p: 0,
            borderRadius: 4,
            overflow: 'hidden',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}>
            <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" fontWeight={700} color="text.primary">Encrypted Activity (Demo)</Typography>
            </Box>
            <List sx={{ p: 0 }}>
              {history.map((item) => (
                <ListItem key={item.id} divider sx={{ borderColor: 'divider' }}>
                  <ListItemAvatar>
                    <Avatar sx={{
                      bgcolor: item.encrypted ? 'rgba(37, 99, 235, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: item.encrypted ? 'primary.main' : 'success.main'
                    }}>
                      {item.encrypted ? <Lock fontSize="small" /> : <LockOpen fontSize="small" />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<Typography fontWeight={600} color="text.primary">{item.action}</Typography>}
                    secondary={
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                        Tx: {item.hash}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>

        </Container>
      </Box>

      {/* Password Dialog */}
      <Dialog open={passwordOpen} onClose={() => setPasswordOpen(false)} aria-labelledby="privacy-password-title">
        <DialogTitle id="privacy-password-title">Enter Wallet Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Please enter your password to decrypt your shielded balance (Simulated).
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="Password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordOpen(false)}>Cancel</Button>
          <Button onClick={handlePasswordSubmit} variant="contained" disabled={!passwordInput}>Decrypt</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Helper Component
const PrivacyOption = ({ label, active, color, icon, onClick }: {
  label: string;
  active: boolean;
  color: string;
  icon: React.ReactNode;
  onClick: () => void;
}) => {
  const getColors = () => {
    switch (color) {
      case 'error': return active ? '#ef4444' : 'transparent';
      case 'warning': return active ? '#f97316' : 'transparent';
      case 'success': return active ? '#10b981' : 'transparent';
      default: return 'transparent';
    }
  };

  return (
    <Button
      fullWidth
      onClick={onClick}
      sx={{
        py: 2,
        borderRadius: 3,
        bgcolor: active ? 'background.paper' : 'transparent',
        boxShadow: active ? 1 : 'none',
        border: `2px solid ${active ? getColors() : 'transparent'}`,
        color: active ? 'text.primary' : 'text.disabled',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        transition: 'all 0.2s',
        '&:hover': {
          bgcolor: active ? 'background.paper' : 'action.hover',
        }
      }}
    >
      <Box sx={{ color: active ? getColors() : 'inherit', transition: 'color 0.2s' }}>
        {icon}
      </Box>
      <Typography variant="body2" fontWeight={600}>{label}</Typography>
    </Button>
  );
}

export default FHEPrivacyPanel;
