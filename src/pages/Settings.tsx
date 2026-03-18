import * as React from 'react';
import { useContext, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Typography, Container, Paper, List, ListItem, ListItemButton, ListItemText, ListItemIcon, Switch, Chip, IconButton, alpha, useTheme, Stack, Divider, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, CircularProgress } from '@mui/material';
import { Notifications, DarkMode, Language, Security, Lock, AddCircleOutline, Delete, Wifi, Check, Close, Fingerprint, PrivacyTip, Gavel, Info, OpenInNew } from '@mui/icons-material';
import { ColorModeContext } from '../ThemeContext';
import { WalletContext } from '../AppContext';
import AddNetworkModal from '../components/AddNetworkModal';
import { CustomNetworkConfig } from '../backend/NetworkTypes';
import { useToast } from '../components/ToastProvider';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, changeLanguage } from '../i18n';
import { BiometricService } from '../backend/BiometricService';

export default function Settings() {
    const navigate = useNavigate();
    const { mode, toggleColorMode } = useContext(ColorModeContext);
    const walletContext = useContext(WalletContext);
    const { showToast } = useToast();
    const theme = useTheme();
    const { t, i18n } = useTranslation();

    const [addNetworkOpen, setAddNetworkOpen] = useState(false);
    const [langDialogOpen, setLangDialogOpen] = useState(false);
    const [biometricSupported, setBiometricSupported] = useState(false);
    const [biometricEnabled, setBiometricEnabled] = useState(BiometricService.isEnabled());
    const [biometricPasswordDialogOpen, setBiometricPasswordDialogOpen] = useState(false);
    const [biometricPassword, setBiometricPassword] = useState("");
    const [biometricLoading, setBiometricLoading] = useState(false);
    const customNetworks = walletContext?.networkProvider?.getCustomNetworks() ?? [];

    const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

    // Check biometric support on mount
    React.useEffect(() => {
        (async () => {
            const supported = await BiometricService.isBiometricAvailable();
            setBiometricSupported(supported);
        })();
    }, []);

    const handleBiometricToggle = async () => {
        if (biometricEnabled) {
            // Disable biometric
            BiometricService.clearBiometric();
            setBiometricEnabled(false);
            showToast(t('security.biometricDisabled'), "info");
        } else {
            // Enable biometric — need password to register
            setBiometricPasswordDialogOpen(true);
        }
    };

    const handleBiometricRegister = async () => {
        if (!biometricPassword) return;
        setBiometricLoading(true);
        try {
            const ok = await BiometricService.registerBiometric(biometricPassword);
            if (ok) {
                setBiometricEnabled(true);
                showToast(t('security.biometricRegistered'), "success");
                setBiometricPasswordDialogOpen(false);
                setBiometricPassword("");
            } else {
                showToast(t('security.biometricNotSupported'), "error");
            }
        } catch (err) {
            showToast((err instanceof Error ? err.message : String(err)) || t('security.biometricNotSupported'), "error");
        } finally {
            setBiometricLoading(false);
        }
    };

    const handleAddNetwork = (config: CustomNetworkConfig) => {
        try {
            walletContext?.networkProvider?.addCustomNetwork(config);
            showToast(`${config.networkName} ${t('settings.networkAdded')}`, "success");
        } catch (err) {
            showToast((err instanceof Error ? err.message : String(err)) || t('settings.failedAddNetwork'), "error");
        }
    };

    const handleRemoveNetwork = (chainId: number, name: string) => {
        walletContext?.networkProvider?.removeCustomNetwork(chainId);
        showToast(`${name} ${t('settings.networkRemoved')}`, "info");
    };

    return (
        <Box sx={{ pb: 4 }}>
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Typography variant="h4" fontWeight={800} gutterBottom>
                    {t('settings.title')}
                </Typography>

                <Paper elevation={0} sx={{ borderRadius: 4, overflow: 'hidden', mb: 2, border: '1px solid rgba(0,0,0,0.05)' }}>
                    <List>
                        <ListItem>
                            <ListItemIcon><DarkMode /></ListItemIcon>
                            <ListItemText primary={t('settings.darkMode')} secondary={t('settings.toggleTheme')} />
                            <Switch checked={mode === 'dark'} onChange={toggleColorMode} />
                        </ListItem>
                        <ListItemButton>
                            <ListItemIcon><Notifications /></ListItemIcon>
                            <ListItemText primary={t('settings.notifications')} secondary={t('settings.manageAlerts')} />
                        </ListItemButton>
                        <ListItemButton onClick={() => setLangDialogOpen(true)}>
                            <ListItemIcon><Language /></ListItemIcon>
                            <ListItemText primary={t('settings.language')} secondary={`${currentLang.flag} ${currentLang.label}`} />
                        </ListItemButton>
                        <ListItemButton onClick={() => navigate('/settings/security')}>
                            <ListItemIcon><Security /></ListItemIcon>
                            <ListItemText primary={t('settings.security')} secondary={t('settings.keysPermissions')} />
                        </ListItemButton>
                        {biometricSupported && (
                            <ListItem>
                                <ListItemIcon><Fingerprint /></ListItemIcon>
                                <ListItemText primary={t('security.biometric')} secondary={t('security.enableBiometric')} />
                                <Switch checked={biometricEnabled} onChange={handleBiometricToggle} />
                            </ListItem>
                        )}
                        <ListItemButton onClick={() => {
                            walletContext?.storageManager?.lock();
                            navigate('/auth');
                        }}>
                            <ListItemIcon><Lock /></ListItemIcon>
                            <ListItemText primary={t('settings.lockWallet')} secondary={t('settings.secureLogout')} />
                        </ListItemButton>
                    </List>
                </Paper>

                {/* Custom Networks Section */}
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5, mt: 2.5 }}>
                    {t('settings.customNetworks')}
                </Typography>

                <Paper
                    elevation={0}
                    sx={{
                        borderRadius: 4,
                        overflow: 'hidden',
                        mb: 1.5,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.primary.main, 0.1),
                    }}
                >
                    {/* Add Network Button */}
                    <ListItemButton
                        onClick={() => setAddNetworkOpen(true)}
                        sx={{
                            py: 1.5,
                            gap: 1.5,
                            borderBottom: customNetworks.length > 0 ? `1px solid ${alpha(theme.palette.divider, 0.5)}` : 'none',
                        }}
                    >
                        <AddCircleOutline sx={{ color: 'primary.main', fontSize: 22 }} />
                        <ListItemText
                            primary={t('settings.addCustomNetwork')}
                            secondary={t('settings.connectEvmChain')}
                            primaryTypographyProps={{ fontWeight: 600, color: 'primary.main' }}
                            secondaryTypographyProps={{ fontSize: 12 }}
                        />
                    </ListItemButton>

                    {/* Custom Network List */}
                    {customNetworks.map((net, index) => (
                        <Box
                            key={net.chainId}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                px: 2,
                                py: 1.5,
                                borderBottom: index < customNetworks.length - 1 ? `1px solid ${alpha(theme.palette.divider, 0.3)}` : 'none',
                            }}
                        >
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: net.iconColor || '#404040', mr: 1.5, flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography fontWeight={600} fontSize={14} noWrap>
                                    {net.networkName}
                                </Typography>
                                <Stack direction="row" spacing={0.5} alignItems="center" mt={0.3}>
                                    <Chip label={`Chain ${net.chainId}`} size="small" variant="outlined" sx={{ height: 18, fontSize: 10, fontWeight: 600 }} />
                                    <Chip label={net.currencySymbol} size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10, fontWeight: 600 }} />
                                    <Wifi sx={{ fontSize: 12, color: 'success.main', ml: 0.5 }} />
                                </Stack>
                            </Box>
                            <IconButton
                                size="small"
                                aria-label={`Remove ${net.networkName} network`}
                                onClick={() => handleRemoveNetwork(net.chainId, net.networkName)}
                                sx={{ color: 'error.main', ml: 1 }}
                            >
                                <Delete sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Box>
                    ))}

                    {customNetworks.length === 0 && (
                        <Box sx={{ px: 3, py: 1.5, textAlign: 'center' }}>
                            <Typography variant="caption" color="text.disabled">
                                {t('settings.noCustomNetworks')}
                            </Typography>
                        </Box>
                    )}
                </Paper>

                {/* Legal Section */}
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5, mt: 2.5 }}>
                    {t('settings.legal')}
                </Typography>

                <Paper
                    elevation={0}
                    sx={{
                        borderRadius: 4,
                        overflow: 'hidden',
                        mb: 1.5,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.5),
                    }}
                >
                    <List disablePadding>
                        <ListItemButton
                            onClick={() => window.open('https://github.com/arfdaodev/ArfheWallet/blob/rewrite-omer/PRIVACY_POLICY.md', '_blank', 'noopener,noreferrer')}
                        >
                            <ListItemIcon><PrivacyTip /></ListItemIcon>
                            <ListItemText
                                primary={t('settings.privacyPolicy')}
                                secondary={t('settings.privacyPolicyDesc')}
                            />
                            <OpenInNew sx={{ fontSize: 18, color: 'text.disabled' }} />
                        </ListItemButton>
                        <Divider variant="inset" component="li" />
                        <ListItemButton
                            onClick={() => window.open('https://github.com/arfdaodev/ArfheWallet/blob/rewrite-omer/TERMS_OF_SERVICE.md', '_blank', 'noopener,noreferrer')}
                        >
                            <ListItemIcon><Gavel /></ListItemIcon>
                            <ListItemText
                                primary={t('settings.termsOfService')}
                                secondary={t('settings.termsOfServiceDesc')}
                            />
                            <OpenInNew sx={{ fontSize: 18, color: 'text.disabled' }} />
                        </ListItemButton>
                    </List>
                </Paper>

                {/* Version info */}
                <Box sx={{ textAlign: 'center', mt: 2.5, mb: 1.5 }}>
                    <Typography variant="caption" color="text.disabled">
                        Arfhe Wallet {t('settings.version')} 1.0.0
                    </Typography>
                </Box>
            </Container>

            {/* Add Network Modal */}
            <AddNetworkModal
                open={addNetworkOpen}
                onClose={() => setAddNetworkOpen(false)}
                onAdd={handleAddNetwork}
            />

            {/* Language Selector Dialog */}
            <Dialog open={langDialogOpen} onClose={() => setLangDialogOpen(false)} maxWidth="xs" fullWidth aria-labelledby="lang-dialog-title" PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle id="lang-dialog-title" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography fontWeight={700}>{t('settings.selectLanguage')}</Typography>
                    <IconButton onClick={() => setLangDialogOpen(false)} size="small" aria-label="Close language selector"><Close /></IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    <List>
                        {LANGUAGES.map(lang => (
                            <ListItemButton
                                key={lang.code}
                                selected={i18n.language === lang.code}
                                onClick={() => {
                                    changeLanguage(lang.code);
                                    setLangDialogOpen(false);
                                }}
                                sx={{ py: 1.5 }}
                            >
                                <Typography sx={{ mr: 1.5, fontSize: '1.3rem' }}>{lang.flag}</Typography>
                                <ListItemText
                                    primary={lang.label}
                                    primaryTypographyProps={{ fontWeight: i18n.language === lang.code ? 700 : 400 }}
                                />
                                {i18n.language === lang.code && <Check color="primary" />}
                            </ListItemButton>
                        ))}
                    </List>
                </DialogContent>
            </Dialog>

            {/* Biometric Password Dialog */}
            <Dialog
                open={biometricPasswordDialogOpen}
                onClose={() => { setBiometricPasswordDialogOpen(false); setBiometricPassword(""); }}
                maxWidth="xs"
                fullWidth
                aria-labelledby="biometric-dialog-title"
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle id="biometric-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Fingerprint color="primary" />
                    <Typography fontWeight={700}>{t('security.biometric')}</Typography>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
                        {t('security.biometricEnablePrompt')}
                    </Typography>
                    <TextField
                        label={t('auth.password')}
                        type="password"
                        fullWidth
                        value={biometricPassword}
                        onChange={(e) => setBiometricPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleBiometricRegister()}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button
                        onClick={() => { setBiometricPasswordDialogOpen(false); setBiometricPassword(""); }}
                        color="inherit"
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleBiometricRegister}
                        disabled={biometricLoading || !biometricPassword}
                        sx={{ borderRadius: 2, minWidth: 100 }}
                    >
                        {biometricLoading ? <CircularProgress size={20} color="inherit" /> : t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
