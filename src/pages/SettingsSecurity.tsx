
import * as React from 'react';
import { useState, useContext } from 'react';
import {
    Box,
    Typography,
    Container,
    Paper,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert,
    IconButton,
    InputAdornment,
    Stack,
    Chip
} from '@mui/material'; // Vanillla MUI, no Joy/Material-next
import {
    Security,
    VpnKey,
    Visibility,
    VisibilityOff,
    ContentCopy,
    Warning,
    ArrowBack
} from '@mui/icons-material';
import { useNavigate } from 'react-router';
import { WalletContext } from '../AppContext';

export default function SettingsSecurity() {
    const navigate = useNavigate();
    const context = useContext(WalletContext);
    const accountManager = context?.accountManager;
    const storageManager = context?.storageManager;

    const [selectedAccountIndex, setSelectedAccountIndex] = useState<number | null>(null);
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");

    const [secretsDialogOpen, setSecretsDialogOpen] = useState(false);
    const [revealedAccount, setRevealedAccount] = useState<any>(null);

    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [showMnemonic, setShowMnemonic] = useState(false);

    // 1. Handle Account Selection
    const handleAccountClick = (index: number) => {
        setSelectedAccountIndex(index);
        setPassword("");
        setPasswordError("");
        setPasswordDialogOpen(true);
    };

    // 2. Verify Password
    const handleVerifyPassword = () => {
        if (!storageManager) return;
        const storedPass = storageManager.getLocal("passwd");

        if (!storedPass) {
            // If no password set, maybe allow? Or force set? 
            // User request implies password exists. let's assume it matches if empty for dev, 
            // but strictly:
            setPasswordError("No password set for this wallet.");
            return;
        }

        if (password === storedPass) {
            setPasswordDialogOpen(false);
            revealSecrets(selectedAccountIndex!);
        } else {
            setPasswordError("Incorrect password.");
        }
    };

    // 3. Reveal Secrets
    const revealSecrets = (index: number) => {
        if (!accountManager) return;
        const account = accountManager.accounts[index];
        if (!account) return;

        setRevealedAccount({
            name: account.name,
            address: account.address,
            privateKey: account.private_key,
            mnemonic: account.mnemonic?.phrase
        });
        setShowPrivateKey(false);
        setShowMnemonic(false);
        setSecretsDialogOpen(true);
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add snackbar here
    };

    return (
        <Box sx={{ pb: 10 }}>
            <Container maxWidth="md" sx={{ py: 4 }}>

                {/* Header */}
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                    <IconButton onClick={() => navigate('/settings')}>
                        <ArrowBack />
                    </IconButton>
                    <Typography variant="h4" fontWeight={800}>
                        Security Keys
                    </Typography>
                </Stack>

                <Alert severity="warning" sx={{ mb: 4, borderRadius: 3 }}>
                    Reviewing your private keys is dangerous. Never share these keys with anyone.
                    Anyone with these keys can steal your assets.
                </Alert>

                <Typography variant="h6" fontWeight={700} gutterBottom sx={{ px: 1 }}>
                    Your Accounts
                </Typography>

                <Paper elevation={0} sx={{ borderRadius: 4, overflow: 'hidden', mb: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                    <List>
                        {accountManager?.accounts.map((acc, index) => (
                            <ListItem
                                key={index}
                                disablePadding
                                divider={index !== accountManager.accounts.length - 1}
                            >
                                <ListItemButton onClick={() => handleAccountClick(index)} sx={{ py: 2 }}>
                                    <ListItemIcon>
                                        <VpnKey color="primary" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={<Typography fontWeight={600}>{acc.name}</Typography>}
                                        secondary={(acc.address || "0x").slice(0, 10) + "..." + (acc.address || "0x").slice(-8)}
                                    />
                                    <Button variant="outlined" size="small" color="inherit">
                                        Reveal
                                    </Button>
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            </Container>


            {/* Password Dialog */}
            <Dialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>Enter Password</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Please enter your wallet password to decrypt these secrets.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        type="password"
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        error={!!passwordError}
                        helperText={passwordError}
                        onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                        sx={{
                            '& .MuiOutlinedInput-root': { borderRadius: 3 }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 0 }}>
                    <Button onClick={() => setPasswordDialogOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={handleVerifyPassword} variant="contained" color="primary">Verify</Button>
                </DialogActions>
            </Dialog>


            {/* Secrets Reveal Dialog */}
            <Dialog open={secretsDialogOpen} onClose={() => setSecretsDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
                    <Warning /> Sensitive Information
                </DialogTitle>
                <DialogContent>
                    <Alert severity="error" sx={{ mb: 3 }}>
                        You are viewing the private keys for <b>{revealedAccount?.name}</b>.
                        Ensure no one is looking at your screen.
                    </Alert>

                    {/* Private Key Section */}
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>Private Key</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 3, bgcolor: 'action.hover', position: 'relative', overflow: 'hidden' }}>
                        <Typography
                            variant="body2"
                            fontFamily="monospace"
                            sx={{
                                filter: showPrivateKey ? 'none' : 'blur(8px)',
                                transition: 'filter 0.2s',
                                wordBreak: 'break-all'
                            }}
                        >
                            {revealedAccount?.privateKey}
                        </Typography>

                        {!showPrivateKey && (
                            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                                <Button
                                    variant="contained"
                                    size="small"
                                    color="error"
                                    onClick={() => setShowPrivateKey(true)}
                                    startIcon={<Visibility />}
                                >
                                    Click to Reveal
                                </Button>
                            </Box>
                        )}
                        {showPrivateKey && (
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                                <IconButton size="small" onClick={() => handleCopy(revealedAccount?.privateKey)}>
                                    <ContentCopy fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => setShowPrivateKey(false)}>
                                    <VisibilityOff fontSize="small" />
                                </IconButton>
                            </Box>
                        )}
                    </Paper>

                    {/* Mnemonic Section (if exists) */}
                    {revealedAccount?.mnemonic && (
                        <>
                            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Secret Recovery Phrase (Mnemonic)</Typography>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'action.hover', position: 'relative', overflow: 'hidden' }}>
                                {/* Filter blur container */}
                                <Box sx={{
                                    filter: showMnemonic ? 'none' : 'blur(5px)',
                                    transition: 'filter 0.2s'
                                }}>
                                    <GridMnemonic phrase={revealedAccount.mnemonic} />
                                </Box>

                                {!showMnemonic && (
                                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            color="error"
                                            onClick={() => setShowMnemonic(true)}
                                            startIcon={<Visibility />}
                                        >
                                            Click to Reveal
                                        </Button>
                                    </Box>
                                )}
                                {showMnemonic && (
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                                        <IconButton size="small" onClick={() => handleCopy(revealedAccount?.mnemonic)}>
                                            <ContentCopy fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => setShowMnemonic(false)}>
                                            <VisibilityOff fontSize="small" />
                                        </IconButton>
                                    </Box>
                                )}
                            </Paper>
                        </>
                    )}

                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setSecretsDialogOpen(false)} variant="contained" color="primary" fullWidth size="large">
                        Done
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// Helper to display Grid Mnemonic
function GridMnemonic({ phrase }: { phrase: string }) {
    const words = phrase.split(" ");
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
            {words.map((word, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 20 }}>{i + 1}.</Typography>
                    <Typography variant="body2" fontWeight={600} fontFamily="monospace">{word}</Typography>
                </Box>
            ))}
        </Box>
    )
}
