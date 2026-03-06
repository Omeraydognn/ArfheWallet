import React, { useEffect, useState } from "react";
import { Box, IconButton, Typography, useTheme, Paper, Stack, Avatar } from "@mui/material";
import { ArrowBack, Visibility, VisibilityOff, Shield, TrendingUp } from "@mui/icons-material";
import { useNavigate } from "react-router";
import { WalletContext } from "../AppContext";
import { ActiveAccountContext } from "../ActiveAccountProvider";
import PortfolioChart from "../components/PortfolioChart";
import AssetAllocationChart from "../components/AssetAllocationChart";
import { NetworkId, TokenBalance } from "../backend/NetworkTypes";

interface DetailedAsset {
    contractAddress: string;
    symbol: string;
    name: string;
    balance: number;
    price: number;
    valueUsd: number;
    isShielded: boolean;
    color: string;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function Portfolio() {
    const navigate = useNavigate();
    const theme = useTheme();
    const wallet_context = React.useContext(WalletContext);
    const active_context = React.useContext(ActiveAccountContext);

    const [isPrivacyMode, setIsPrivacyMode] = useState(false);
    const [totalBalanceUsd, setTotalBalanceUsd] = useState(0.00);
    const [shieldedRatio, setShieldedRatio] = useState(0);
    const [assets, setAssets] = useState<DetailedAsset[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const loadCacheData = () => {
            if (!wallet_context || !active_context) return;

            const net = wallet_context.networkProvider.getActiveNetwork();
            const account = active_context.activeAccount;
            if (!net || !account) return;

            const address = account.GetAddress();
            if (!address) return;

            const dataCache = wallet_context.dataCacheService;
            if (!dataCache) return;

            const cached = dataCache.get(address, net.network_id);
            if (!cached) {
                // Cache is missing or stale. Safe to redirect to home to let it handle complex multi-fetch
                navigate('/home', { replace: true });
                return;
            }

            // Sync rendering with the verified cached data from Home.tsx
            const IGNORED_CONTRACTS = [
                "0xbde0a2e375b67c802d4651fecf3b678b1886d15b", "0x3e0722a877e52fe755e8bf02372342c63930fd57", "0x6ab305c679002c0938c2be3f824fcb8b81be5b70",
                "0x5c3f1fe2c451ccc73443865fec914a595c3d1a7c", "0x730bb4ee9ea1cdb0b45c1db01ca67a616d2d3c88", "0x23bad885b76c95ec9e2b47663022d552d780200f",
                "0x503e16b7920420277ce1548444dbb30e97f87d40", "0x3696a9a8ecd0dbd7111dd15f7837d7f38d83a0c0", "0x7890673c207a728ef7d9378c7206030749351dad",
                "0x4b3dd819cfbf1364cabd5c8f9c5c05917d09168c", "0x421583e66b21de780b4f94fcecce858c07f3d2d9", "0x0125c55244724c1bf1d16b91e046fe7e8a5719e2",
                "0x8d0419e8a259366516fc4fbabebdc013cad8770f", "0x2210264a3775d5fbc51b1b73667f5590230ac2bd"
            ];

            let shieldedUsd = 0;
            let totalUsd = 0;
            const detailedAssets: DetailedAsset[] = [];

            Object.values(cached.balances).forEach((b: any, index: number) => {
                const bal = parseFloat(b.tokenBalance);

                if (IGNORED_CONTRACTS.includes(b.contractAddress.toLowerCase())) return;

                const meta = wallet_context.tokenCache.getToken(net.network_id, b.contractAddress.toLowerCase()) ||
                    wallet_context.tokenCache.getToken(net.network_id, b.contractAddress);

                const symbol = b.symbol || meta?.symbol || (b.isNative ? "ETH" : "Unknown");
                const name = b.name || meta?.name || symbol;

                const price = b.priceUsd || 0;
                const valueUsd = b.totalValueUsd || (bal * price);

                totalUsd += valueUsd;
                if (b.isShielded) shieldedUsd += valueUsd;

                detailedAssets.push({
                    contractAddress: b.contractAddress,
                    symbol,
                    name,
                    balance: bal,
                    price,
                    valueUsd,
                    isShielded: !!b.isShielded,
                    color: COLORS[index % COLORS.length]
                });
            });

            // Sort exactly matching Home logic
            detailedAssets.sort((a, b) => b.valueUsd - a.valueUsd);
            detailedAssets.forEach((d, i) => d.color = COLORS[i % COLORS.length]);

            if (isMounted) {
                setAssets(detailedAssets);
                // Force total USD display exactly equal to cache to eliminate floating point diffs
                setTotalBalanceUsd(cached.totalUsd);
                setShieldedRatio(cached.totalUsd > 0 ? (shieldedUsd / cached.totalUsd) * 100 : 0);
                setLoading(false);
            }
        };

        loadCacheData();
        return () => { isMounted = false; };
    }, [wallet_context, active_context, navigate]);

    // Derived Data
    const formatMoney = (val: number) => isPrivacyMode ? '***' : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const topAsset = assets.length > 0 ? assets[0].symbol : '-';
    const topAssetDom = assets.length > 0 && totalBalanceUsd > 0 ? ((assets[0].valueUsd / totalBalanceUsd) * 100).toFixed(1) : '0.0';

    const chartData = assets.map(a => ({
        name: a.symbol,
        value: a.valueUsd,
        color: a.color
    }));

    return (
        <Box sx={{ pb: 10, px: { xs: 2, md: 4 }, pt: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton onClick={() => navigate(-1)} sx={{ mr: 1, ml: -1 }}>
                        <ArrowBack />
                    </IconButton>
                    <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: '-0.02em' }}>
                        Portfolio Dashboard
                    </Typography>
                </Box>
                <IconButton
                    onClick={() => setIsPrivacyMode(!isPrivacyMode)}
                    sx={{
                        bgcolor: isPrivacyMode ? 'rgba(16, 185, 129, 0.1)' : 'action.hover',
                        color: isPrivacyMode ? 'success.main' : 'text.primary',
                        '&:hover': { bgcolor: isPrivacyMode ? 'rgba(16, 185, 129, 0.2)' : 'action.selected' }
                    }}
                >
                    {isPrivacyMode ? <VisibilityOff /> : <Visibility />}
                </IconButton>
            </Box>

            {/* Stat Cards Row */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 4 }}>
                <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(33.333% - 16px)' } }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 8px 32px rgba(0,0,0,0.02)', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={600} gutterBottom>Net Worth</Typography>
                        <Typography variant="h4" fontWeight="800" sx={{ mt: 1 }}>{formatMoney(totalBalanceUsd)}</Typography>
                    </Paper>
                </Box>
                <Box sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '1 1 calc(33.333% - 16px)' } }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 8px 32px rgba(0,0,0,0.02)', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={600} gutterBottom>Privacy Ratio</Typography>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                            <Shield sx={{ color: 'secondary.main', fontSize: 28 }} />
                            <Typography variant="h5" fontWeight="800">{isPrivacyMode ? '***' : `${shieldedRatio.toFixed(1)}%`}</Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">Held in FHE Assets</Typography>
                    </Paper>
                </Box>
                <Box sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '1 1 calc(33.333% - 16px)' } }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 8px 32px rgba(0,0,0,0.02)', height: '100%' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={600} gutterBottom>Top Asset</Typography>
                        <Typography variant="h5" fontWeight="800" sx={{ mt: 1 }}>{isPrivacyMode ? '***' : topAsset}</Typography>
                        <Typography variant="caption" color="success.main" fontWeight={700}>{isPrivacyMode ? '***' : `${topAssetDom}% Dominance`}</Typography>
                    </Paper>
                </Box>
            </Box>

            {/* Charts Row */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
                <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 calc(66.666% - 24px)' } }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 8px 32px rgba(0,0,0,0.02)', height: '100%' }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Performance History</Typography>
                        <Box sx={{ filter: isPrivacyMode ? 'blur(8px)' : 'none', transition: 'filter 0.3s' }}>
                            <PortfolioChart currentBalanceUsd={totalBalanceUsd} />
                        </Box>
                    </Paper>
                </Box>
                <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 calc(33.333% - 24px)' } }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 8px 32px rgba(0,0,0,0.02)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Asset Allocation</Typography>
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <AssetAllocationChart data={chartData} isPrivacyMode={isPrivacyMode} />
                        </Box>
                    </Paper>
                </Box>
            </Box>

            {/* Detailed Assets List */}
            <Typography variant="h6" fontWeight="800" sx={{ mb: 2, px: 1 }}>Your Assets</Typography>
            <Stack spacing={1.5}>
                {assets.map((asset, i) => (
                    <Paper key={i} elevation={0} sx={{
                        p: 2,
                        borderRadius: 3,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.2s',
                        '&:hover': { transform: 'scale(1.01)', borderColor: asset.color }
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: asset.color, opacity: 0.15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {/* Optional: Real logos if available, else initial */}
                                <Typography variant="h6" sx={{ color: asset.color, fontWeight: 800 }}>{asset.symbol.substring(0, 1)}</Typography>
                            </Box>
                            <Box>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="subtitle2" fontWeight={700}>{asset.symbol}</Typography>
                                    {asset.isShielded && <Shield sx={{ fontSize: 14, color: 'secondary.main' }} />}
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    {isPrivacyMode ? '***' : `${asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset.symbol}`}
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="subtitle2" fontWeight={700}>
                                {formatMoney(asset.valueUsd)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {isPrivacyMode ? '***' : `@ $${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </Typography>
                        </Box>
                    </Paper>
                ))}
                {assets.length === 0 && !loading && (
                    <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>No assets found in your portfolio.</Typography>
                )}
            </Stack>
        </Box>
    );
}
