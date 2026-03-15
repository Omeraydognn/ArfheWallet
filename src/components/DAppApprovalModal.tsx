/**
 * DAppApprovalModal.tsx — Transaction & Signature Approval Dialog
 * 
 * Shows when a dApp (via WalletConnect or iframe proxy) requests
 * eth_sendTransaction, personal_sign, or eth_signTypedData.
 * 
 * FHE Security Guard:
 * - Analyzes tx data for FHE-sensitive function selectors (wrap, unseal, etc.)
 * - Shows critical warning for FHE operations
 * - External dApps can NEVER auto-trigger FHE functions
 */

import * as React from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, Chip, Alert, CircularProgress,
    Divider, IconButton, Stack, Paper, alpha, useTheme
} from '@mui/material';
import {
    Close, Warning, Shield, CheckCircle, ErrorOutline,
    ArrowForward, ContentCopy, OpenInNew
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { analyzeFheRisk, FheRiskAnalysis } from '../backend/DAppConnectionService';

// ─── Types ──────────────────────────────────────────────────────────

export interface ApprovalRequest {
    id: number;
    method: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: Record<string, any>;
    dApp: {
        name: string;
        url: string;
        icon: string;
    };
    topic?: string;        // WalletConnect topic
}

interface Props {
    open: boolean;
    request: ApprovalRequest | null;
    onApprove: (request: ApprovalRequest) => void;
    onReject: (request: ApprovalRequest) => void;
    loading?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────

export default function DAppApprovalModal({ open, request, onApprove, onReject, loading }: Props) {
    const theme = useTheme();
    const { t } = useTranslation();
    const [fheRisk, setFheRisk] = React.useState<FheRiskAnalysis | null>(null);

    React.useEffect(() => {
        if (!request) {
            setFheRisk(null);
            return;
        }

        // Analyze FHE risk for transaction requests
        if (request.method === 'eth_sendTransaction' && request.params?.request?.params?.[0]) {
            const txParams = request.params.request.params[0];
            const analysis = analyzeFheRisk(txParams.data, txParams.to);
            setFheRisk(analysis);
        } else {
            setFheRisk({ isFheSensitive: false, riskLevel: 'safe', reason: 'Signature request' });
        }
    }, [request]);

    if (!request) return null;

    const isTx = request.method === 'eth_sendTransaction' || request.method === 'eth_signTransaction';
    const isSign = request.method === 'personal_sign' || request.method.includes('signTypedData');

    const txParams = isTx ? (request.params?.request?.params?.[0] || request.params?.params?.[0] || {}) : {};
    const signData = isSign ? (request.params?.request?.params?.[0] || request.params?.params?.[0] || '') : '';

    const getRiskColor = () => {
        if (!fheRisk) return 'info';
        switch (fheRisk.riskLevel) {
            case 'critical': return 'error';
            case 'warning': return 'warning';
            default: return 'success';
        }
    };

    const getRiskIcon = () => {
        if (!fheRisk) return <Shield />;
        switch (fheRisk.riskLevel) {
            case 'critical': return <ErrorOutline />;
            case 'warning': return <Warning />;
            default: return <CheckCircle />;
        }
    };

    return (
        <Dialog
            open={open}
            onClose={() => onReject(request)}
            maxWidth="sm"
            fullWidth
            aria-labelledby="dapp-approval-title"
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    bgcolor: alpha(theme.palette.background.paper, 0.95),
                    backdropFilter: 'blur(20px)',
                    backgroundImage: 'none',
                    boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25)',
                    border: '1px solid',
                    borderColor: fheRisk?.riskLevel === 'critical'
                        ? 'error.main'
                        : alpha(theme.palette.divider, 0.2),
                }
            }}
        >
            {/* Header */}
            <DialogTitle
                id="dapp-approval-title"
                component="div"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    pb: 2,
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                        component="img"
                        src={request.dApp.icon}
                        alt={request.dApp.name}
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40'; }}
                        sx={{ width: 40, height: 40, borderRadius: 2 }}
                    />
                    <Box>
                        <Typography fontWeight={700} fontSize={16}>
                            {request.dApp.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {request.dApp.url}
                        </Typography>
                    </Box>
                </Box>
                <IconButton onClick={() => onReject(request)} size="small" aria-label="Reject and close">
                    <Close />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 3 }}>
                {/* Request Type Badge */}
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                    <Chip
                        label={isTx ? t('explore.transactionRequest') : t('explore.signatureRequest')}
                        color={isTx ? 'primary' : 'secondary'}
                        variant="outlined"
                        sx={{ fontWeight: 700, fontSize: 14, py: 2.5 }}
                    />
                </Box>

                {/* FHE Security Alert */}
                {fheRisk && fheRisk.riskLevel !== 'safe' && (
                    <Alert
                        severity={fheRisk.riskLevel === 'critical' ? 'error' : 'warning'}
                        icon={getRiskIcon()}
                        sx={{
                            mb: 3,
                            borderRadius: 3,
                            '& .MuiAlert-message': { width: '100%' }
                        }}
                    >
                        <Typography fontWeight={700} fontSize={14}>
                            {fheRisk.riskLevel === 'critical'
                                ? `🛡️ ${t('explore.fheCritical')}`
                                : `⚠️ ${t('explore.fheWarning')}`
                            }
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                            {fheRisk.reason}
                        </Typography>
                    </Alert>
                )}

                {/* Transaction Details */}
                {isTx && (
                    <Stack spacing={2}>
                        {txParams.to && (
                            <DetailRow
                                label={t('explore.to')}
                                value={txParams.to}
                                mono
                            />
                        )}
                        {txParams.value && (
                            <DetailRow
                                label={t('explore.value')}
                                value={`${parseInt(txParams.value, 16) / 1e18} ETH`}
                            />
                        )}
                        {txParams.data && txParams.data !== '0x' && (
                            <DetailRow
                                label={t('explore.data')}
                                value={txParams.data.length > 66
                                    ? `${txParams.data.slice(0, 66)}...`
                                    : txParams.data}
                                mono
                            />
                        )}
                        {txParams.gas && (
                            <DetailRow
                                label={t('explore.gasLimit')}
                                value={parseInt(txParams.gas, 16).toLocaleString()}
                            />
                        )}
                    </Stack>
                )}

                {/* Sign Request Details */}
                {isSign && (
                    <Paper
                        elevation={0}
                        sx={{
                            p: 2,
                            borderRadius: 3,
                            bgcolor: alpha(theme.palette.action.hover, 0.5),
                            border: '1px solid',
                            borderColor: 'divider',
                            maxHeight: 200,
                            overflow: 'auto',
                        }}
                    >
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            {t('explore.messageToSign')}
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{ mt: 1, fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 12 }}
                        >
                            {typeof signData === 'string'
                                ? (signData.startsWith('0x')
                                    ? Buffer.from(signData.slice(2), 'hex').toString('utf-8')
                                    : signData)
                                : JSON.stringify(signData, null, 2)
                            }
                        </Typography>
                    </Paper>
                )}
            </DialogContent>

            {/* Actions */}
            <DialogActions sx={{ p: 3, pt: 2, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                <Button
                    variant="outlined"
                    color="inherit"
                    onClick={() => onReject(request)}
                    disabled={loading}
                    fullWidth
                    sx={{ borderRadius: 3, height: 48, fontWeight: 700 }}
                >
                    {t('explore.reject')}
                </Button>
                <Button
                    variant="contained"
                    color={fheRisk?.riskLevel === 'critical' ? 'error' : 'primary'}
                    onClick={() => onApprove(request)}
                    disabled={loading}
                    fullWidth
                    sx={{ borderRadius: 3, height: 48, fontWeight: 700 }}
                >
                    {loading
                        ? <CircularProgress size={24} color="inherit" />
                        : fheRisk?.riskLevel === 'critical'
                            ? t('explore.approveAnyway')
                            : t('explore.approve')
                    }
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {label}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography
                    variant="body2"
                    sx={{
                        wordBreak: 'break-all',
                        fontFamily: mono ? 'monospace' : 'inherit',
                        fontSize: mono ? 12 : 14,
                    }}
                >
                    {value}
                </Typography>
                {mono && (
                    <IconButton
                        size="small"
                        onClick={() => navigator.clipboard.writeText(value)}
                        aria-label={`Copy ${label}`}
                        sx={{ flexShrink: 0 }}
                    >
                        <ContentCopy sx={{ fontSize: 14 }} />
                    </IconButton>
                )}
            </Box>
        </Box>
    );
}
