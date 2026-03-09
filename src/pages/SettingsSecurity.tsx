
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
    Chip,
    Select,
    MenuItem,
    FormControl
} from '@mui/material'; // Vanillla MUI, no Joy/Material-next
import {
    Security,
    VpnKey,
    Visibility,
    VisibilityOff,
    ContentCopy,
    Warning,
    ArrowBack,
    Timer
} from '@mui/icons-material';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { WalletContext } from '../AppContext';
import { useToast } from '../components/ToastProvider';

export default function SettingsSecurity() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const context = useContext(WalletContext);
    const accountManager = context?.accountManager;
    const storageManager = context?.storageManager;
    const { showToast } = useToast();

    const [selectedAccountIndex, setSelectedAccountIndex] = useState<number | null>(null);
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");

    const [secretsDialogOpen, setSecretsDialogOpen] = useState(false);
    const [revealedAccount, setRevealedAccount] = useState<{
        name?: string;
        address?: string;
        privateKey?: string;
        mnemonic?: string;
    } | null>(null);

    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [showMnemonic, setShowMnemonic] = useState(false);

    // Auto Lock State
    const [autoLockTimer, setAutoLockTimer] = useState<number>(() => {
        const saved = storageManager?.getLocal<number>("autoLockTimeout");
        return typeof saved === 'number' ? saved : 5 * 60 * 1000;
    });

    // 1. Handle Account Selection
    const handleAccountClick = (index: number) => {
        setSelectedAccountIndex(index);
        setPassword("");
        setPasswordError("");
        setPasswordDialogOpen(true);
    };

    // 2. Verify Password (async — uses PBKDF2 hash verification)
    const handleVerifyPassword = async () => {
        if (!storageManager) return;

        if (!storageManager.hasPassword()) {
            setPasswordError(t("security.noPasswordSet"));
            return;
        }

        // initEncryption verifies password against stored PBKDF2 hash
        const ok = await storageManager.initEncryption(password);
        if (ok) {
            setPasswordDialogOpen(false);
            revealSecrets(selectedAccountIndex!);
        } else {
            setPasswordError(t("security.incorrectPassword"));
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
        showToast(t("security.secretCopied"), "success");
    };

    const handleAutoLockChange = (val: number) => {
        setAutoLockTimer(val);
        storageManager?.setLocal("autoLockTimeout", val);
        window.dispatchEvent(new Event("autolock_updated"));
        showToast(t("security.autoLockUpdated"), "success");
    };

    return (
        <Box sx={{ pb: 10 }}>
            <Container maxWidth="md" sx={{ py: 4 }}>

                {/* Header */}
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                    <IconButton onClick={() => navigate('/settings')} aria-label="Go back to settings">
                        <ArrowBack />
                    </IconButton>
                    <Typography variant="h4" fontWeight={800}>
                        {t('security.securityKeys')}
                    </Typography>
                </Stack>

                <Alert severity="warning" sx={{ mb: 4, borderRadius: 3 }}>
                    {t('security.dangerWarning')}
                </Alert>

                <Typography variant="h6" fontWeight={700} gutterBottom sx={{ px: 1 }}>
                    {t('security.yourAccounts')}
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
                                        {t('security.reveal')}
                                    </Button>
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Paper>

                <Typography variant="h6" fontWeight={700} gutterBottom sx={{ px: 1, mt: 5 }}>
                    {t('security.securityPreferences')}
                </Typography>

                <Paper elevation={0} sx={{ borderRadius: 4, overflow: 'hidden', mb: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ p: 1, bgcolor: 'primary.light', borderRadius: 2, display: 'flex' }}>
                                <Timer sx={{ color: 'primary.main' }} />
                            </Box>
                            <Box>
                                <Typography variant="body1" fontWeight={700}>{t('security.autoLock')}</Typography>
                                <Typography variant="body2" color="text.secondary">{t('security.autoLockDesc')}</Typography>
                            </Box>
                        </Box>

                        <FormControl variant="outlined" size="small" sx={{ minWidth: 140 }}>
                            <Select
                                value={autoLockTimer}
                                onChange={(e) => handleAutoLockChange(Number(e.target.value))}
                                sx={{ borderRadius: 3, fontWeight: 600 }}
                            >
                                <MenuItem value={1 * 60 * 1000}>{t('security.duration1min')}</MenuItem>
                                <MenuItem value={5 * 60 * 1000}>{t('security.duration5min')}</MenuItem>
                                <MenuItem value={15 * 60 * 1000}>{t('security.duration15min')}</MenuItem>
                                <MenuItem value={30 * 60 * 1000}>{t('security.duration30min')}</MenuItem>
                                <MenuItem value={60 * 60 * 1000}>{t('security.duration1hour')}</MenuItem>
                                <MenuItem value={0}>{t('security.durationNever')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </Paper>

            </Container>

            {/* Password Dialog */}
            <Dialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} maxWidth="xs" fullWidth aria-labelledby="password-dialog-title">
                <DialogTitle id="password-dialog-title" fontWeight={700}>{t('security.enterPassword')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('security.enterPasswordDesc')}
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        type="password"
                        label={t('auth.password')}
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
                    <Button onClick={() => setPasswordDialogOpen(false)} color="inherit">{t('common.cancel')}</Button>
                    <Button onClick={handleVerifyPassword} variant="contained" color="primary">{t('security.verify')}</Button>
                </DialogActions>
            </Dialog>


            {/* Secrets Reveal Dialog */}
            <Dialog open={secretsDialogOpen} onClose={() => setSecretsDialogOpen(false)} maxWidth="sm" fullWidth aria-labelledby="secrets-dialog-title">
                <DialogTitle id="secrets-dialog-title" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
                    <Warning /> {t('security.sensitiveInfo')}
                </DialogTitle>
                <DialogContent>
                    <Alert severity="error" sx={{ mb: 3 }}>
                        {t('security.viewingKeysFor', { name: revealedAccount?.name })}
                    </Alert>

                    {/* Private Key Section */}
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('security.privateKey')}</Typography>
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
                                    {t('security.clickToReveal')}
                                </Button>
                            </Box>
                        )}
                        {showPrivateKey && (
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                                <IconButton size="small" onClick={() => handleCopy(revealedAccount?.privateKey ?? '')} aria-label="Copy private key">
                                    <ContentCopy fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => setShowPrivateKey(false)} aria-label="Hide private key">
                                    <VisibilityOff fontSize="small" />
                                </IconButton>
                            </Box>
                        )}
                    </Paper>

                    {/* Mnemonic Section (if exists) */}
                    {revealedAccount?.mnemonic && (
                        <>
                            <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('security.secretRecoveryPhrase')}</Typography>
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
                                            {t('security.clickToReveal')}
                                        </Button>
                                    </Box>
                                )}
                                {showMnemonic && (
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                                        <IconButton size="small" onClick={() => handleCopy(String(revealedAccount?.mnemonic ?? ''))} aria-label="Copy recovery phrase">
                                            <ContentCopy fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => setShowMnemonic(false)} aria-label="Hide recovery phrase">
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
                        {t('common.done')}
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
