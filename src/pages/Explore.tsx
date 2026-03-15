/**
 * Explore.tsx — In-App dApp Browser & Curated dApp Directory
 * 
 * Premium "App Store" style layout with glassmorphic design.
 * - Featured dApps carousel
 * - Category-based filtering  
 * - Search functionality
 * - WalletConnect v2 integration for safe connections
 * - FHE Security Guard for transaction approval
 */

import * as React from 'react';
import { useState, useEffect, useContext, useMemo } from 'react';
import {
    Container, Box, Typography, TextField, Paper, Chip,
    IconButton, InputAdornment, CircularProgress, Alert,
    alpha, useTheme, Tooltip, Button, Dialog, DialogTitle,
    DialogContent, DialogActions, Stack, Badge
} from '@mui/material';
import {
    Search, OpenInNew, Explore as ExploreIcon, Shield,
    Star, TrendingUp, SwapHoriz, Image, CompareArrows,
    Build, People, AccountBalance, Close, QrCode2,
    Link as LinkIcon, WifiTethering, ContentCopy, Verified
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import { WalletContext } from '../AppContext';
import { ActiveAccountContext } from '../ActiveAccountProvider';
import {
    DAPP_REGISTRY, DAPP_CATEGORIES, DApp, DAppCategory,
    getFeaturedDApps, searchDApps, getDAppsByCategory, getDAppsForChain
} from '../backend/DAppRegistry';
import { openDApp } from '../backend/DAppConnectionService';
import DAppApprovalModal, { ApprovalRequest } from '../components/DAppApprovalModal';
import { WalletConnectRequest } from '../backend/WalletConnectService';
import type { WCSessionInfo, ImageErrorEvent } from '../types/index';

// ─── Category Icon Map ──────────────────────────────────────────────

const CATEGORY_ICONS: Record<DAppCategory, React.ReactNode> = {
    defi: <AccountBalance />,
    dex: <SwapHoriz />,
    fhe: <Shield />,
    nft: <Image />,
    bridge: <CompareArrows />,
    tools: <Build />,
    social: <People />,
};

// ─── Main Component ─────────────────────────────────────────────────

const Explore = () => {
    const theme = useTheme();
    const { t } = useTranslation();
    const walletContext = useContext(WalletContext);
    const activeContext = useContext(ActiveAccountContext);
    const network = walletContext?.networkProvider?.getActiveNetwork();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<DAppCategory | 'all'>('all');
    const [wcDialogOpen, setWcDialogOpen] = useState(false);
    const [wcUri, setWcUri] = useState('');
    const [wcLoading, setWcLoading] = useState(false);
    const [wcError, setWcError] = useState('');
    const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
    const [approvalLoading, setApprovalLoading] = useState(false);
    const [wcSessionCount, setWcSessionCount] = useState(0);

    // WalletConnect session count
    useEffect(() => {
        const wc = walletContext?.walletConnectService;
        if (!wc) return;
        const updateCount = () => {
            setWcSessionCount(wc.getActiveSessions?.()?.length || 0);
        };
        updateCount();
        wc.setOnSessionUpdate?.(updateCount);
    }, [walletContext?.walletConnectService]);

    // Setup WalletConnect request handler for approval modal
    useEffect(() => {
        const wc = walletContext?.walletConnectService;
        if (!wc) return;

        wc.setOnRequest((req: WalletConnectRequest) => {
            setApprovalRequest({
                id: req.id,
                method: req.params?.request?.method || 'unknown',
                params: req.params,
                dApp: req.dApp,
                topic: req.topic,
            });
        });
    }, [walletContext?.walletConnectService]);

    // Filter dApps
    const filteredDApps = useMemo(() => {
        let list = searchQuery
            ? searchDApps(searchQuery)
            : activeCategory === 'all'
                ? [...DAPP_REGISTRY]
                : getDAppsByCategory(activeCategory);

        return list;
    }, [searchQuery, activeCategory]);

    const featuredDApps = useMemo(() => getFeaturedDApps(), []);

    // Handlers
    const handleDAppClick = (dApp: DApp) => {
        openDApp(dApp);
    };

    const handleWcConnect = async () => {
        const wc = walletContext?.walletConnectService;
        if (!wc || !wcUri.trim()) return;

        setWcLoading(true);
        setWcError('');
        try {
            await wc.init();
            await wc.pair(wcUri.trim());
            setWcDialogOpen(false);
            setWcUri('');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'ALREADY_PAIRED') {
                setWcError(t('explore.alreadyPaired'));
            } else if (msg === 'URI_EXPIRED') {
                setWcError(t('explore.uriExpired'));
            } else {
                setWcError(msg || t('explore.connectionFailed'));
            }
        } finally {
            setWcLoading(false);
        }
    };

    const handleApprove = async (req: ApprovalRequest) => {
        const wc = walletContext?.walletConnectService;
        const account = activeContext?.activeAccount;
        if (!wc || !account) return;

        setApprovalLoading(true);
        try {
            const method = req.params?.request?.method || req.method;
            let result: unknown;
            const wallet = account.ethers_wallet;
            if (!wallet) throw new Error('Wallet not available');

            if (method === 'personal_sign') {
                const message = req.params?.request?.params?.[0];
                // Decode hex message to string if needed
                const msgBytes = message?.startsWith('0x')
                    ? new Uint8Array(Buffer.from(message.slice(2), 'hex'))
                    : message;
                result = await wallet.signMessage(msgBytes);
            } else if (method === 'eth_sendTransaction') {
                const txParams = req.params?.request?.params?.[0];
                const rpcUrl = network?.rpc_url;
                if (!rpcUrl) throw new Error('No RPC URL available');
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                const connectedWallet = wallet.connect(provider);
                const txResponse = await connectedWallet.sendTransaction(txParams);
                result = txResponse.hash;
            } else if (method.includes('signTypedData')) {
                // For typed data, use raw signMessage as fallback
                const rawData = req.params?.request?.params?.[1];
                const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
                const { domain, types, message: msg } = parsed;
                // Remove EIP712Domain from types if present
                const cleanTypes = { ...types };
                delete cleanTypes.EIP712Domain;
                result = await wallet.signTypedData(domain, cleanTypes, msg);
            }

            await wc.approveRequest(account, {
                id: req.id,
                topic: req.topic!,
                params: req.params,
                dApp: req.dApp,
            }, result);
        } catch (e) {
        } finally {
            setApprovalLoading(false);
            setApprovalRequest(null);
        }
    };

    const handleReject = async (req: ApprovalRequest) => {
        const wc = walletContext?.walletConnectService;
        if (!wc) return;

        await wc.rejectRequest({
            id: req.id,
            topic: req.topic!,
            params: req.params,
            dApp: req.dApp,
        });
        setApprovalRequest(null);
    };

    return (
        <Box sx={{ pb: 6, minHeight: '100%' }}>
            <Container maxWidth="lg" sx={{ py: 2 }}>

                {/* ── Hero Header ── */}
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                    <Typography
                        variant="h3"
                        fontWeight={900}
                        sx={{
                            mb: 1,
                            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.text.secondary}, ${theme.palette.primary.light})`,
                            backgroundSize: '200% auto',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            animation: 'shimmer 3s linear infinite',
                            '@keyframes shimmer': {
                                '0%': { backgroundPosition: '0% center' },
                                '100%': { backgroundPosition: '200% center' },
                            },
                        }}
                    >
                        {t('explore.title')}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 500, mx: 'auto' }}>
                        {t('explore.subtitle')}
                    </Typography>
                </Box>

                {/* ── Search + WalletConnect Button ── */}
                <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, maxWidth: 700, mx: 'auto' }}>
                    <TextField
                        fullWidth
                        placeholder={t('explore.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search color="action" />
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: 4,
                                bgcolor: alpha(theme.palette.background.paper, 0.8),
                                backdropFilter: 'blur(10px)',
                                '&:hover': { bgcolor: alpha(theme.palette.background.paper, 0.95) },
                            }
                        }}
                    />
                    <Tooltip title={t('explore.walletConnect')}>
                        <Badge badgeContent={wcSessionCount} color="success" max={9}>
                            <IconButton
                                onClick={() => setWcDialogOpen(true)}
                                aria-label={t('explore.walletConnect')}
                                sx={{
                                    width: 56, height: 56,
                                    borderRadius: 4,
                                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    border: '1px solid',
                                    borderColor: alpha(theme.palette.primary.main, 0.2),
                                    '&:hover': {
                                        bgcolor: alpha(theme.palette.primary.main, 0.2),
                                    }
                                }}
                            >
                                <WifiTethering color="primary" />
                            </IconButton>
                        </Badge>
                    </Tooltip>
                </Box>

                {/* ── Category Pills ── */}
                <Box sx={{
                    display: 'flex',
                    gap: 1,
                    mb: 2.5,
                    overflowX: 'auto',
                    pb: 1,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    '&::-webkit-scrollbar': { display: 'none' },
                }}>
                    <Chip
                        label={t('explore.all')}
                        variant={activeCategory === 'all' ? 'filled' : 'outlined'}
                        color={activeCategory === 'all' ? 'primary' : 'default'}
                        onClick={() => { setActiveCategory('all'); setSearchQuery(''); }}
                        sx={{ fontWeight: 700, borderRadius: 3, px: 1 }}
                    />
                    {DAPP_CATEGORIES.map(cat => (
                        <Chip
                            key={cat.id}
                            icon={CATEGORY_ICONS[cat.id] as React.ReactElement}
                            label={t(cat.labelKey)}
                            variant={activeCategory === cat.id ? 'filled' : 'outlined'}
                            color={activeCategory === cat.id ? 'primary' : 'default'}
                            onClick={() => { setActiveCategory(cat.id); setSearchQuery(''); }}
                            sx={{
                                fontWeight: 600,
                                borderRadius: 3,
                                px: 0.5,
                                '& .MuiChip-icon': { fontSize: 18 },
                            }}
                        />
                    ))}
                </Box>

                {/* ── Featured Section ── */}
                {activeCategory === 'all' && !searchQuery && (
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="h6" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Star sx={{ color: '#f59e0b' }} /> {t('explore.featured')}
                        </Typography>
                        <Box sx={{
                            display: 'flex',
                            gap: 2,
                            overflowX: 'auto',
                            pb: 2,
                            '&::-webkit-scrollbar': { height: 4 },
                            '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 2 },
                        }}>
                            {featuredDApps.map(dApp => (
                                <FeaturedCard key={dApp.id} dApp={dApp} onClick={handleDAppClick} />
                            ))}
                        </Box>
                    </Box>
                )}

                {/* ── dApp Grid ── */}
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'repeat(1, 1fr)',
                        sm: 'repeat(2, 1fr)',
                        md: 'repeat(3, 1fr)',
                    },
                    gap: 2,
                }}>
                    {filteredDApps.map(dApp => (
                        <DAppCard key={dApp.id} dApp={dApp} onClick={handleDAppClick} />
                    ))}
                </Box>

                {filteredDApps.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <ExploreIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" fontWeight={700}>
                            {t('explore.noResults')}
                        </Typography>
                        <Typography variant="body2" color="text.disabled">
                            {t('explore.tryDifferent')}
                        </Typography>
                    </Box>
                )}
            </Container>

            {/* ── WalletConnect Dialog ── */}
            <Dialog
                open={wcDialogOpen}
                onClose={() => { setWcDialogOpen(false); setWcError(''); }}
                maxWidth="sm"
                fullWidth
                aria-labelledby="wc-dialog-title"
                PaperProps={{
                    sx: {
                        borderRadius: 4,
                        bgcolor: alpha(theme.palette.background.paper, 0.95),
                        backdropFilter: 'blur(20px)',
                        backgroundImage: 'none',
                    }
                }}
            >
                <DialogTitle id="wc-dialog-title" component="div" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <WifiTethering color="primary" />
                        <Typography fontWeight={700}>{t('explore.walletConnect')}</Typography>
                    </Box>
                    <IconButton onClick={() => { setWcDialogOpen(false); setWcError(''); }} size="small" aria-label="Close WalletConnect dialog">
                        <Close />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {t('explore.wcDescription')}
                    </Typography>

                    {wcError && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setWcError('')}>
                            {wcError}
                        </Alert>
                    )}

                    <TextField
                        fullWidth
                        label={t('explore.wcUriLabel')}
                        placeholder="wc:a281567bb3e4..."
                        value={wcUri}
                        onChange={(e) => setWcUri(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleWcConnect()}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <LinkIcon color="action" />
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': { borderRadius: 3 },
                        }}
                    />

                    <Paper
                        elevation={0}
                        sx={{
                            mt: 2, p: 2, borderRadius: 2,
                            bgcolor: alpha(theme.palette.info.main, 0.05),
                            border: '1px solid',
                            borderColor: alpha(theme.palette.info.main, 0.15),
                        }}
                    >
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                            💡 {t('explore.wcHint')}
                        </Typography>
                    </Paper>

                    {/* Active Sessions */}
                    {wcSessionCount > 0 && (
                        <Box sx={{ mt: 3 }}>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                                {t('explore.activeSessions')} ({wcSessionCount})
                            </Typography>
                            {walletContext?.walletConnectService?.getActiveSessions?.()?.map((session: WCSessionInfo) => (
                                <Box
                                    key={session.topic}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        p: 1.5,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        mb: 1,
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={session.peer?.metadata?.icons?.[0] || ''}
                                        alt=""
                                        onError={(e: ImageErrorEvent) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        sx={{ width: 28, height: 28, borderRadius: 1 }}
                                    />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography fontSize={13} fontWeight={600} noWrap>
                                            {session.peer?.metadata?.name || 'Unknown'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {session.peer?.metadata?.url || ''}
                                        </Typography>
                                    </Box>
                                    <Button
                                        size="small"
                                        color="error"
                                        onClick={() => walletContext?.walletConnectService?.disconnect(session.topic)}
                                        sx={{ fontSize: 11, minWidth: 'auto' }}
                                    >
                                        {t('explore.disconnect')}
                                    </Button>
                                </Box>
                            ))}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 1 }}>
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleWcConnect}
                        disabled={wcLoading || !wcUri.trim()}
                        sx={{ borderRadius: 3, height: 48, fontWeight: 700 }}
                    >
                        {wcLoading ? <CircularProgress size={24} color="inherit" /> : t('explore.connect')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── DApp Approval Modal (FHE Security Guard) ── */}
            <DAppApprovalModal
                open={!!approvalRequest}
                request={approvalRequest}
                onApprove={handleApprove}
                onReject={handleReject}
                loading={approvalLoading}
            />
        </Box>
    );
};

// ─── Featured Card ──────────────────────────────────────────────────

function FeaturedCard({ dApp, onClick }: { dApp: DApp; onClick: (d: DApp) => void }) {
    const theme = useTheme();
    const { t } = useTranslation();
    const catInfo = DAPP_CATEGORIES.find(c => c.id === dApp.category);

    return (
        <Paper
            elevation={0}
            onClick={() => onClick(dApp)}
            sx={{
                minWidth: 260,
                maxWidth: 300,
                p: 3,
                borderRadius: 4,
                cursor: 'pointer',
                bgcolor: alpha(theme.palette.background.paper, 0.8),
                backdropFilter: 'blur(20px)',
                border: '1px solid',
                borderColor: alpha(catInfo?.color || theme.palette.primary.main, 0.2),
                background: `linear-gradient(135deg, ${alpha(catInfo?.color || '#2563eb', 0.05)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 12px 24px -8px ${alpha(catInfo?.color || '#2563eb', 0.25)}`,
                    borderColor: alpha(catInfo?.color || theme.palette.primary.main, 0.4),
                },
                flexShrink: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box
                    component="img"
                    src={dApp.icon}
                    alt={dApp.name}
                    onError={(e: ImageErrorEvent) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/48?text=' + dApp.name[0]; }}
                    sx={{
                        width: 48, height: 48,
                        borderRadius: 3,
                        boxShadow: `0 4px 12px ${alpha(catInfo?.color || '#000', 0.2)}`,
                    }}
                />
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography fontWeight={800} fontSize={16}>
                            {dApp.name}
                        </Typography>
                        <Verified sx={{ fontSize: 14, color: 'primary.main' }} />
                    </Box>
                    <Chip
                        label={t(catInfo?.labelKey || 'explore.catTools')}
                        size="small"
                        sx={{
                            height: 20, fontSize: 10, fontWeight: 700,
                            bgcolor: alpha(catInfo?.color || '#666', 0.1),
                            color: catInfo?.color,
                        }}
                    />
                </Box>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                {dApp.description}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2 }}>
                <Chip
                    icon={<OpenInNew sx={{ fontSize: '14px !important' }} />}
                    label={t('explore.open')}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 600, borderRadius: 2, fontSize: 11 }}
                />
            </Box>
        </Paper>
    );
}

// ─── Standard dApp Card ─────────────────────────────────────────────

function DAppCard({ dApp, onClick }: { dApp: DApp; onClick: (d: DApp) => void }) {
    const theme = useTheme();
    const { t } = useTranslation();
    const catInfo = DAPP_CATEGORIES.find(c => c.id === dApp.category);

    return (
        <Paper
            elevation={0}
            onClick={() => onClick(dApp)}
            sx={{
                p: 2.5,
                borderRadius: 3,
                cursor: 'pointer',
                bgcolor: alpha(theme.palette.background.paper, 0.7),
                backdropFilter: 'blur(12px)',
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.5),
                transition: 'all 0.2s ease',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 20px -4px ${alpha(theme.palette.common.black, 0.1)}`,
                    borderColor: alpha(catInfo?.color || theme.palette.primary.main, 0.3),
                    bgcolor: alpha(theme.palette.background.paper, 0.9),
                },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                    component="img"
                    src={dApp.icon}
                    alt={dApp.name}
                    onError={(e: ImageErrorEvent) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40?text=' + dApp.name[0]; }}
                    sx={{
                        width: 44, height: 44,
                        borderRadius: 2.5,
                        flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography fontWeight={700} fontSize={14} noWrap>
                            {dApp.name}
                        </Typography>
                        {dApp.featured && <Star sx={{ fontSize: 13, color: '#f59e0b' }} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {dApp.description}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        <Chip
                            label={t(catInfo?.labelKey || dApp.category)}
                            size="small"
                            sx={{
                                height: 18, fontSize: 9, fontWeight: 700,
                                bgcolor: alpha(catInfo?.color || '#666', 0.1),
                                color: catInfo?.color,
                            }}
                        />
                        {dApp.chains.length > 0 && dApp.chains.length <= 3 && (
                            <Chip
                                label={dApp.chains.map(c => getChainLabel(c)).join(', ')}
                                size="small"
                                variant="outlined"
                                sx={{ height: 18, fontSize: 9, fontWeight: 600 }}
                            />
                        )}
                    </Box>
                </Box>
                <OpenInNew sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
            </Box>
        </Paper>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────

function getChainLabel(chainId: number): string {
    switch (chainId) {
        case 1: return 'ETH';
        case 11155111: return 'Sepolia';
        case 42161: return 'ARB';
        case 421614: return 'ARB Sep';
        case 8453: return 'Base';
        case 84532: return 'Base Sep';
        case 8008135: return 'Fhenix';
        default: return `#${chainId}`;
    }
}

export default Explore;
