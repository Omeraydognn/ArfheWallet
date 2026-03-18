import React, { useContext, useEffect, useState, useCallback } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Avatar,
    Stack,
    CircularProgress,
    Alert,
    Chip,
    Divider,
    Checkbox,
    FormControlLabel,
    Tooltip,
    IconButton,
    Collapse,
    Paper,
    LinearProgress
} from "@mui/material";
import { WalletContext } from "../AppContext";
import { formatEther, JsonRpcProvider } from "ethers";
import type { WalletConnectRequest, WalletConnectProposal } from "../backend/WalletConnectService";
import type { Network } from "../backend/Network";
import type Account from "../backend/Account";

// Icons
import LinkIcon from '@mui/icons-material/Link';
import SecurityIcon from '@mui/icons-material/Security';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import GppBadIcon from '@mui/icons-material/GppBad';
import GppGoodIcon from '@mui/icons-material/GppGood';
import SendIcon from '@mui/icons-material/Send';
import DrawIcon from '@mui/icons-material/Draw';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LanguageIcon from '@mui/icons-material/Language';

// --- Helpers ---

const CHAIN_NAMES: Record<string, { name: string; color: string }> = {
    "eip155:1": { name: "Ethereum", color: "#627EEA" },
    "eip155:11155111": { name: "Sepolia", color: "#9B59B6" },
    "eip155:137": { name: "Polygon", color: "#8247E5" },
    "eip155:80001": { name: "Mumbai", color: "#8247E5" },
    "eip155:42161": { name: "Arbitrum", color: "#28A0F0" },
    "eip155:421614": { name: "Arb Sepolia", color: "#28A0F0" },
    "eip155:10": { name: "Optimism", color: "#FF0420" },
    "eip155:11155420": { name: "OP Sepolia", color: "#FF0420" },
    "eip155:8453": { name: "Base", color: "#0052FF" },
    "eip155:84532": { name: "Base Sepolia", color: "#0052FF" },
    "eip155:56": { name: "BNB Chain", color: "#F0B90B" },
    "eip155:97": { name: "BNB Testnet", color: "#F0B90B" },
    "eip155:43114": { name: "Avalanche", color: "#E84142" },
    "eip155:43113": { name: "Fuji", color: "#E84142" },
    "eip155:250": { name: "Fantom", color: "#1969FF" },
    "eip155:100": { name: "Gnosis", color: "#04795B" },
    "eip155:1101": { name: "Polygon zkEVM", color: "#8247E5" },
    "eip155:324": { name: "zkSync Era", color: "#4E529A" },
    "eip155:59144": { name: "Linea", color: "#121212" },
    "eip155:534352": { name: "Scroll", color: "#FFDBB0" },
    "eip155:81457": { name: "Blast", color: "#FCFC03" },
    "eip155:42220": { name: "Celo", color: "#35D07F" },
    "eip155:1284": { name: "Moonbeam", color: "#53CBC9" },
    "eip155:1285": { name: "Moonriver", color: "#F2A007" },
    "eip155:25": { name: "Cronos", color: "#002D74" },
    "eip155:1666600000": { name: "Harmony", color: "#00AEE9" },
    "eip155:1313161554": { name: "Aurora", color: "#78D64B" },
    "eip155:7777777": { name: "Zora", color: "#A855F7" },
    "eip155:480": { name: "World Chain", color: "#1A1A1A" },
    "eip155:130": { name: "Unichain", color: "#FF007A" },
    "eip155:1868": { name: "Soneium", color: "#3B82F6" },
    "eip155:143": { name: "Unichain Sepolia", color: "#FF007A" },
    "eip155:8008135": { name: "Fhenix", color: "#6366F1" },
};

const METHOD_INFO: Record<string, { label: string; icon: React.ReactNode; risk: "safe" | "warning" | "danger" }> = {
    "eth_sendTransaction": { label: "Send Transaction", icon: <SendIcon fontSize="small" />, risk: "warning" },
    "eth_signTransaction": { label: "Sign Transaction", icon: <DrawIcon fontSize="small" />, risk: "warning" },
    "eth_sign": { label: "Sign Arbitrary Data", icon: <GppBadIcon fontSize="small" />, risk: "danger" },
    "personal_sign": { label: "Sign Message", icon: <DrawIcon fontSize="small" />, risk: "warning" },
    "eth_signTypedData": { label: "Sign Typed Data", icon: <DrawIcon fontSize="small" />, risk: "warning" },
    "eth_signTypedData_v4": { label: "Sign Typed Data v4", icon: <DrawIcon fontSize="small" />, risk: "warning" },
};

const RISK_COLORS = {
    safe: { bg: "rgba(34, 197, 94, 0.08)", border: "rgba(34, 197, 94, 0.3)", text: "#16a34a" },
    warning: { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.3)", text: "#d97706" },
    danger: { bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.3)", text: "#dc2626" },
};

function getChainName(chainId: string): string {
    return CHAIN_NAMES[chainId]?.name || chainId;
}

function getChainColor(chainId: string): string {
    return CHAIN_NAMES[chainId]?.color || "#888";
}

function truncateAddress(addr: string): string {
    if (!addr || addr.length < 10) return addr || "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function decodeHexMessage(hex: string): string {
    try {
        if (!hex.startsWith("0x")) return hex;
        const bytes = [];
        for (let i = 2; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substring(i, i + 2), 16));
        }
        return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
        return hex;
    }
}

export default function WalletConnectManager() {
    const context = useContext(WalletContext);
    const service = context?.walletConnectService;
    const account = context?.accountManager?.GetActive();
    const network = context?.networkProvider?.getActiveNetwork();

    const [request, setRequest] = useState<WalletConnectRequest | null>(null);
    const [proposal, setProposal] = useState<WalletConnectProposal | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!service) return;

        service.init();

        service.setOnProposal((prop: WalletConnectProposal) => {
            setProposal(prop);
            setError("");
        });

        service.setOnRequest((req: WalletConnectRequest) => {
            setRequest(req);
            setError("");
        });

        service.setOnSessionDelete(() => {
            setRequest(null);
            setProposal(null);
        });

        return () => { };
    }, [service]);

    // --- HANDLERS: Session Approval ---

    const handleApproveSession = async () => {
        if (!service || !proposal) return;
        setLoading(true);
        setError("");
        try {
            await service.approveSession(proposal);
            setProposal(null);
        } catch (e) {
            if (e instanceof Error && e.message === "SESSION_SYNC_FAILED") {
                setError("Session synchronization failed. Please try again.");
            } else {
                setError(e instanceof Error ? e.message : "Connection Failed");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRejectSession = async () => {
        if (!service || !proposal) return;
        setLoading(true);
        try {
            await service.rejectSession(proposal);
        } catch (e) {
        } finally {
            setProposal(null);
            setLoading(false);
        }
    };

    // --- HANDLERS: Request Approval ---

    const handleApproveRequest = async () => {
        if (!service || !account || !request) return;
        setLoading(true);
        setError("");

        try {
            let result;
            const rpcReq = request.params.request;
            const chainId = request.params.chainId; // e.g. "eip155:11155111"
            const bareWallet = account.ethers_wallet;

            if (!bareWallet) throw new Error("Wallet locked or not found");

            // Determine RPC URL: prefer active network, fallback by chainId
            let rpcUrl = network?.rpc_url;
            if (!rpcUrl) {
                // Derive from WC chainId
                const chainNum = chainId?.split(":")?.[1];
                if (chainNum === "1") rpcUrl = "https://ethereum.publicnode.com";
                else if (chainNum === "11155111") rpcUrl = "https://ethereum-sepolia.publicnode.com";
                else throw new Error("No RPC URL available for chain: " + chainId);
            }

            // Connect bare wallet to provider (project pattern: wallet.connect(provider))
            const provider = new JsonRpcProvider(rpcUrl);
            const connectedWallet = bareWallet.connect(provider);

            if (rpcReq.method === "personal_sign") {
                // personal_sign: params[0] = hex message, params[1] = address
                const hexMsg = rpcReq.params[0];
                // Decode hex to bytes for signMessage
                const msgBytes = hexMsg.startsWith("0x")
                    ? new Uint8Array(hexMsg.slice(2).match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)))
                    : hexMsg;
                result = await connectedWallet.signMessage(msgBytes);
            }
            else if (rpcReq.method === "eth_sendTransaction") {
                const txParams = rpcReq.params[0];
                const tx = await connectedWallet.sendTransaction({
                    to: txParams.to,
                    value: txParams.value || "0x0",
                    data: txParams.data || "0x",
                    gasLimit: txParams.gasLimit || txParams.gas,
                });
                result = tx.hash;
            }
            else if (rpcReq.method === "eth_signTypedData" || rpcReq.method === "eth_signTypedData_v4") {
                // params[0] = address, params[1] = JSON typed data
                const raw = rpcReq.params[1];
                const data = typeof raw === "string" ? JSON.parse(raw) : raw;
                // Remove EIP712Domain from types (ethers handles it automatically)
                const types = { ...data.types };
                delete types.EIP712Domain;
                result = await connectedWallet.signTypedData(data.domain, types, data.message || data.value);
            }
            else if (rpcReq.method === "eth_sign") {
                // eth_sign: params[0] = address, params[1] = hex data
                const hexData = rpcReq.params[1];
                const dataBytes = new Uint8Array(hexData.slice(2).match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
                result = await connectedWallet.signMessage(dataBytes);
            }
            else {
                throw new Error("Unsupported Method: " + rpcReq.method);
            }

            await service.approveRequest(account, request, result);
            setRequest(null);
        } catch (e) {
            const msg = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage || e.message) : "Approval Failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleRejectRequest = async () => {
        if (!service || !request) return;
        setLoading(true);
        try {
            await service.rejectRequest(request);
        } catch (e) {
        } finally {
            setRequest(null);
            setLoading(false);
        }
    };

    // =============================================
    // RENDER 1: CONNECTION PROPOSAL (Professional)
    // =============================================
    if (proposal) {
        return (
            <ProposalDialog
                proposal={proposal}
                walletAddress={account?.GetAddress() || ""}
                loading={loading}
                error={error}
                onApprove={handleApproveSession}
                onReject={handleRejectSession}
            />
        );
    }

    // =============================================
    // RENDER 2: TRANSACTION REQUEST (Professional)
    // =============================================
    if (request) {
        return (
            <RequestDialog
                request={request}
                network={network}
                account={account}
                loading={loading}
                error={error}
                onApprove={handleApproveRequest}
                onReject={handleRejectRequest}
            />
        );
    }

    return null;
}

// ====================================================
// PROPOSAL DIALOG — Professional Connection Approval
// ====================================================
function ProposalDialog({
    proposal,
    walletAddress,
    loading,
    error,
    onApprove,
    onReject,
}: {
    proposal: WalletConnectProposal;
    walletAddress: string;
    loading: boolean;
    error: string;
    onApprove: () => void;
    onReject: () => void;
}) {
    const { dApp, requiredChains = [], optionalChains = [], requiredMethods = [], unsupportedChains = [], isValid, phishingResult } = proposal;

    const allChains = [...new Set([...requiredChains, ...optionalChains])];
    const isPhishingDangerous = phishingResult?.riskLevel === "DANGEROUS";
    const isPhishingSuspicious = phishingResult?.riskLevel === "SUSPICIOUS";

    return (
        <Dialog
            open={true}
            maxWidth="xs"
            fullWidth
            aria-label={`Connection request from ${dApp.name}`}
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    bgcolor: 'background.paper',
                    backgroundImage: 'none',
                    overflow: 'hidden',
                }
            }}
        >
            {/* Header */}
            <Box sx={{
                textAlign: 'center',
                pt: 4,
                pb: 2,
                px: 3,
                background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.05) 0%, transparent 100%)',
            }}>
                <Avatar
                    src={dApp.icon}
                    sx={{
                        width: 72,
                        height: 72,
                        margin: '0 auto',
                        mb: 2,
                        bgcolor: 'primary.main',
                        border: '3px solid',
                        borderColor: 'divider',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                    }}
                >
                    {dApp.name?.[0]?.toUpperCase()}
                </Avatar>
                <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: '-0.02em' }}>
                    {dApp.name}
                </Typography>
                <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ mt: 0.5 }}>
                    <LanguageIcon sx={{ fontSize: 14, color: isPhishingDangerous ? '#dc2626' : 'text.secondary' }} />
                    <Typography variant="caption" sx={{
                        fontSize: '0.75rem',
                        color: isPhishingDangerous ? '#dc2626' : isPhishingSuspicious ? '#d97706' : 'text.secondary',
                        fontWeight: isPhishingDangerous ? 700 : 400,
                    }}>
                        {dApp.url}
                    </Typography>
                </Stack>
                {dApp.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: '0.8rem', lineHeight: 1.4 }}>
                        {dApp.description}
                    </Typography>
                )}
            </Box>

            <DialogContent sx={{ px: 3, pt: 1.5, pb: 2 }}>
                {/* ── Phishing Warning Banner ── */}
                {isPhishingDangerous && (
                    <Paper elevation={0} sx={{
                        mb: 2,
                        p: 2,
                        borderRadius: 3,
                        bgcolor: 'rgba(220, 38, 38, 0.12)',
                        border: '2px solid',
                        borderColor: '#dc2626',
                    }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <GppBadIcon sx={{ color: '#dc2626', fontSize: 22 }} />
                            <Typography variant="subtitle2" sx={{ color: '#dc2626', fontWeight: 800, fontSize: '0.85rem' }}>
                                🚨 PHİSHİNG TESPİT EDİLDİ
                            </Typography>
                        </Stack>
                        <Stack spacing={0.5}>
                            {phishingResult?.warnings.map((w: string, i: number) => (
                                <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.5, color: '#dc2626', fontWeight: 500 }}>
                                    {w}
                                </Typography>
                            ))}
                        </Stack>
                        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#dc2626', fontWeight: 700, fontSize: '0.7rem' }}>
                            Bu bağlantıyı ONAYLAMAYIN — Fonlarınız çalınabilir!
                        </Typography>
                    </Paper>
                )}

                {/* ── Suspicious Domain Warning ── */}
                {isPhishingSuspicious && !isPhishingDangerous && (
                    <Alert
                        severity="warning"
                        icon={<WarningAmberIcon sx={{ fontSize: 20 }} />}
                        sx={{ mb: 2, borderRadius: 2 }}
                    >
                        <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.8rem' }}>
                            ⚠️ Şüpheli Domain Tespit Edildi
                        </Typography>
                        {phishingResult?.warnings.map((w: string, i: number) => (
                            <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.5, mt: 0.5 }}>
                                {w}
                            </Typography>
                        ))}
                    </Alert>
                )}

                {/* Unsupported chains warning */}
                {unsupportedChains.length > 0 && (
                    <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                        <Typography variant="body2" fontWeight={600}>Unsupported chains required</Typography>
                        <Typography variant="caption">
                            {unsupportedChains.map(getChainName).join(", ")} — connection may not work fully.
                        </Typography>
                    </Alert>
                )}

                {/* Networks */}
                <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>
                        Networks
                    </Typography>
                    {(() => {
                        const requiredSet = new Set(requiredChains);
                        // Only show chains we know the name of
                        const knownChains = allChains.filter((c: string) => CHAIN_NAMES[c]);
                        const unknownOptionalCount = allChains.filter(
                            (c: string) => !CHAIN_NAMES[c] && !requiredSet.has(c)
                        ).length;
                        return (
                            <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
                                {knownChains.map((chain: string) => {
                                    const isRequired = requiredSet.has(chain);
                                    const supported = !unsupportedChains.includes(chain);
                                    const color = getChainColor(chain);
                                    return (
                                        <Chip
                                            key={chain}
                                            size="small"
                                            label={getChainName(chain)}
                                            icon={supported
                                                ? <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
                                                : <ErrorOutlineIcon sx={{ fontSize: 14 }} />
                                            }
                                            sx={{
                                                fontWeight: isRequired ? 700 : 500,
                                                fontSize: '0.72rem',
                                                opacity: isRequired ? 1 : 0.55,
                                                borderColor: supported ? color : '#ef4444',
                                                color: supported ? color : '#ef4444',
                                                bgcolor: supported ? `${color}12` : 'rgba(239,68,68,0.08)',
                                                border: '1px solid',
                                                '& .MuiChip-icon': { color: 'inherit' }
                                            }}
                                        />
                                    );
                                })}
                                {unknownOptionalCount > 0 && (
                                    <Chip
                                        size="small"
                                        label={`+${unknownOptionalCount} more optional`}
                                        sx={{
                                            fontSize: '0.68rem',
                                            fontWeight: 500,
                                            opacity: 0.4,
                                            border: '1px dashed',
                                            borderColor: 'text.disabled',
                                            color: 'text.disabled',
                                            bgcolor: 'transparent',
                                        }}
                                    />
                                )}
                            </Stack>
                        );
                    })()}
                </Box>

                {/* Permissions */}
                <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>
                        Permissions Requested
                    </Typography>
                    <Stack spacing={0.75}>
                        {requiredMethods.length > 0 ? requiredMethods.map((method: string) => {
                            const info = METHOD_INFO[method] || { label: method, icon: <LinkIcon fontSize="small" />, risk: "safe" as const };
                            const colors = RISK_COLORS[info.risk];
                            return (
                                <Paper
                                    key={method}
                                    elevation={0}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        p: 1,
                                        borderRadius: 2,
                                        bgcolor: colors.bg,
                                        border: '1px solid',
                                        borderColor: colors.border,
                                    }}
                                >
                                    <Box sx={{ color: colors.text, display: 'flex' }}>{info.icon}</Box>
                                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: '0.8rem', color: colors.text }}>
                                        {info.label}
                                    </Typography>
                                    {info.risk === "danger" && (
                                        <Tooltip title="This method can sign arbitrary data. Use with extreme caution." arrow>
                                            <WarningAmberIcon sx={{ fontSize: 18, color: '#dc2626' }} />
                                        </Tooltip>
                                    )}
                                    {info.risk === "warning" && (
                                        <Tooltip title="Requires your explicit approval each time" arrow>
                                            <WarningAmberIcon sx={{ fontSize: 16, color: '#d97706' }} />
                                        </Tooltip>
                                    )}
                                </Paper>
                            );
                        }) : (
                            <Paper elevation={0} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 2, bgcolor: RISK_COLORS.safe.bg, border: '1px solid', borderColor: RISK_COLORS.safe.border }}>
                                <GppGoodIcon sx={{ fontSize: 18, color: RISK_COLORS.safe.text }} />
                                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem', color: RISK_COLORS.safe.text }}>
                                    Standard permissions
                                </Typography>
                            </Paper>
                        )}
                    </Stack>
                </Box>

                {/* Connected Wallet */}
                <Paper elevation={0} sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                }}>
                    <AccountBalanceWalletIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>Your Wallet</Typography>
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                            {truncateAddress(walletAddress)}
                        </Typography>
                    </Box>
                </Paper>

                {/* Security Notice */}
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', textAlign: 'center', mt: 2, fontSize: '0.7rem', lineHeight: 1.4 }}
                >
                    <SecurityIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
                    Each transaction will require your separate approval.
                </Typography>

                {error && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{error}</Alert>}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3, pt: 0, flexDirection: 'column', gap: 1 }}>
                <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={onApprove}
                    disabled={loading || isPhishingDangerous}
                    sx={{
                        borderRadius: 3,
                        py: 1.5,
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        textTransform: 'none',
                        background: isPhishingDangerous
                            ? 'rgba(220, 38, 38, 0.3)'
                            : isPhishingSuspicious
                                ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
                                : 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                        boxShadow: isPhishingDangerous
                            ? 'none'
                            : isPhishingSuspicious
                                ? '0 4px 14px rgba(217, 119, 6, 0.35)'
                                : '0 4px 14px rgba(37, 99, 235, 0.3)',
                        '&:hover': {
                            background: isPhishingDangerous
                                ? 'rgba(220, 38, 38, 0.3)'
                                : isPhishingSuspicious
                                    ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)'
                                    : 'linear-gradient(135deg, #172554 0%, #1e3a8a 100%)',
                        }
                    }}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> :
                        isPhishingDangerous ? "🚫 Blocked — Phishing Detected" :
                            isPhishingSuspicious ? "⚠️ Connect Anyway" :
                                "Connect"}
                </Button>
                <Button
                    fullWidth
                    onClick={onReject}
                    disabled={loading}
                    sx={{
                        borderRadius: 3,
                        py: 1,
                        fontWeight: 600,
                        textTransform: 'none',
                        color: 'text.secondary',
                    }}
                >
                    Reject
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ====================================================
// REQUEST DIALOG — Professional Transaction Approval
// ====================================================
function RequestDialog({
    request,
    network,
    account,
    loading,
    error,
    onApprove,
    onReject,
}: {
    request: WalletConnectRequest;
    network: Network | null | undefined;
    account: Account | null | undefined;
    loading: boolean;
    error: string;
    onApprove: () => void;
    onReject: () => void;
}) {
    const { dApp, params } = request;
    const { request: rpcReq, chainId } = params;

    const isChainSupported = chainId === "eip155:1" || chainId === "eip155:11155111";
    const isTransaction = rpcReq.method === "eth_sendTransaction";
    const isDangerousSign = rpcReq.method === "eth_sign";
    const isPersonalSign = rpcReq.method === "personal_sign";
    const isTypedData = rpcReq.method === "eth_signTypedData" || rpcReq.method === "eth_signTypedData_v4";

    const methodInfo = METHOD_INFO[rpcReq.method] || { label: rpcReq.method, icon: <DrawIcon fontSize="small" />, risk: "warning" as const };

    // Tx values
    const txValue = isTransaction && rpcReq.params[0].value ? formatEther(rpcReq.params[0].value) : "0";
    const txTo = isTransaction ? rpcReq.params[0].to : "";

    // State for danger method protection
    const [riskAccepted, setRiskAccepted] = useState(false);
    const [countdown, setCountdown] = useState(isDangerousSign ? 3 : 0);

    // State for gas simulation
    const [gasEstimate, setGasEstimate] = useState<string | null>(null);
    const [balanceCheck, setBalanceCheck] = useState<{ sufficient: boolean; balance: string; totalCost: string } | null>(null);
    const [simulating, setSimulating] = useState(false);

    // State for raw data collapse
    const [showRawData, setShowRawData] = useState(false);

    // Countdown for dangerous methods
    useEffect(() => {
        if (!isDangerousSign || !riskAccepted) return;
        if (countdown <= 0) return;

        const timer = setInterval(() => {
            setCountdown(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [isDangerousSign, riskAccepted, countdown]);

    // Reset countdown when checkbox changes
    useEffect(() => {
        if (isDangerousSign && riskAccepted) {
            setCountdown(3);
        }
    }, [riskAccepted, isDangerousSign]);

    // Gas simulation for transactions
    useEffect(() => {
        if (!isTransaction || !network || !account) return;

        const simulate = async () => {
            setSimulating(true);
            try {
                const rpcUrl = network.rpc_url;
                if (!rpcUrl) return;

                const provider = new JsonRpcProvider(rpcUrl);
                const txParams = rpcReq.params[0];

                // Estimate gas
                const gas = await provider.estimateGas({
                    from: txParams.from || account.GetAddress(),
                    to: txParams.to,
                    value: txParams.value || "0x0",
                    data: txParams.data || "0x",
                });

                const feeData = await provider.getFeeData();
                const gasPrice = feeData.gasPrice || 0n;
                const gasCost = gas * gasPrice;
                const value = txParams.value ? BigInt(txParams.value) : 0n;
                const totalCost = value + gasCost;

                setGasEstimate(formatEther(gasCost));

                // Check balance
                const balance = await provider.getBalance(account.GetAddress() ?? "0x0");
                setBalanceCheck({
                    sufficient: balance >= totalCost,
                    balance: formatEther(balance),
                    totalCost: formatEther(totalCost),
                });
            } catch (e) {
            } finally {
                setSimulating(false);
            }
        };

        simulate();
    }, [isTransaction, network, account]);

    // Determine if approve should be disabled
    const isApproveDisabled = loading
        || !isChainSupported
        || (isDangerousSign && (!riskAccepted || countdown > 0))
        || (balanceCheck !== null && !balanceCheck.sufficient);

    // Decoded message for personal_sign
    let decodedMessage = "";
    if (isPersonalSign && rpcReq.params?.[0]) {
        decodedMessage = decodeHexMessage(rpcReq.params[0]);
    }

    // Typed data preview
    let typedDataPreview: { domain?: { name?: string }; message?: unknown; value?: unknown;[key: string]: unknown } | null = null;
    if (isTypedData && rpcReq.params?.[1]) {
        try {
            typedDataPreview = JSON.parse(rpcReq.params[1]);
        } catch { /* ignore */ }
    }

    return (
        <Dialog
            open={true}
            maxWidth="sm"
            fullWidth
            aria-label="Transaction approval request"
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    bgcolor: 'background.paper',
                    backgroundImage: 'none',
                    overflow: 'hidden',
                }
            }}
        >
            {/* dApp header */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 3,
                pt: 3,
                pb: 1.5,
            }}>
                <Avatar
                    src={dApp.icon}
                    alt={dApp.name}
                    sx={{
                        width: 48,
                        height: 48,
                        border: '2px solid',
                        borderColor: 'divider',
                    }}
                >
                    {dApp.name?.[0]}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>{dApp.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{dApp.url}</Typography>
                </Box>
                <Chip
                    size="small"
                    label={getChainName(chainId)}
                    sx={{
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        bgcolor: isChainSupported ? `${getChainColor(chainId)}15` : 'rgba(239,68,68,0.1)',
                        color: isChainSupported ? getChainColor(chainId) : '#ef4444',
                        border: '1px solid',
                        borderColor: isChainSupported ? `${getChainColor(chainId)}40` : '#ef444440',
                    }}
                />
            </Box>

            <DialogContent sx={{ px: 3, pt: 1, pb: 2 }}>
                {/* Unsupported chain warning */}
                {!isChainSupported && (
                    <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                        Unsupported chain: {getChainName(chainId)}
                    </Alert>
                )}

                {/* Method type badge */}
                <Paper
                    elevation={0}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        p: 1.5,
                        mb: 2,
                        borderRadius: 2,
                        bgcolor: RISK_COLORS[methodInfo.risk].bg,
                        border: '1px solid',
                        borderColor: RISK_COLORS[methodInfo.risk].border,
                    }}
                >
                    <Box sx={{ color: RISK_COLORS[methodInfo.risk].text, display: 'flex' }}>{methodInfo.icon}</Box>
                    <Typography variant="body1" fontWeight={700} sx={{ flex: 1, color: RISK_COLORS[methodInfo.risk].text }}>
                        {methodInfo.label}
                    </Typography>
                    {methodInfo.risk === "danger" && (
                        <GppBadIcon sx={{ color: '#dc2626' }} />
                    )}
                </Paper>

                {/* DANGER: eth_sign warning */}
                {isDangerousSign && (
                    <Alert
                        severity="error"
                        icon={<GppBadIcon />}
                        sx={{
                            mb: 2,
                            borderRadius: 2,
                            border: '2px solid #dc2626',
                            '& .MuiAlert-message': { width: '100%' }
                        }}
                    >
                        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                            ⚠️ Dangerous Signing Method
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', mb: 1.5, lineHeight: 1.5 }}>
                            This method can sign arbitrary data and may be used to authorize
                            malicious actions. Only proceed if you fully trust this application.
                        </Typography>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={riskAccepted}
                                    onChange={(e) => setRiskAccepted(e.target.checked)}
                                    size="small"
                                    sx={{ color: '#dc2626', '&.Mui-checked': { color: '#dc2626' } }}
                                />
                            }
                            label={
                                <Typography variant="caption" fontWeight={700} color="#dc2626">
                                    I understand the risks
                                </Typography>
                            }
                        />
                    </Alert>
                )}

                {/* Transaction Details */}
                {isTransaction && (
                    <Paper elevation={0} sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2.5, mb: 2 }}>
                        {/* Value */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>Value</Typography>
                            <Typography variant="body1" fontWeight={800} sx={{ fontSize: '1.1rem' }}>
                                {parseFloat(txValue).toFixed(6)} ETH
                            </Typography>
                        </Stack>

                        <Divider sx={{ my: 1 }} />

                        {/* To */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ my: 1.5 }}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>To</Typography>
                            <Tooltip title={txTo} arrow>
                                <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                                    {truncateAddress(txTo)}
                                </Typography>
                            </Tooltip>
                        </Stack>

                        <Divider sx={{ my: 1 }} />

                        {/* Gas */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ my: 1.5 }}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>Est. Gas Fee</Typography>
                            {simulating ? (
                                <CircularProgress size={14} />
                            ) : gasEstimate ? (
                                <Typography variant="body2" fontWeight={600}>
                                    ~{parseFloat(gasEstimate).toFixed(6)} ETH
                                </Typography>
                            ) : (
                                <Typography variant="caption" color="text.secondary">Unable to estimate</Typography>
                            )}
                        </Stack>

                        {/* Net balance change */}
                        {balanceCheck && (
                            <>
                                <Divider sx={{ my: 1 }} />
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
                                    <Typography variant="body2" color="text.secondary" fontWeight={600}>Total Cost</Typography>
                                    <Typography variant="body2" fontWeight={800} color={balanceCheck.sufficient ? 'text.primary' : 'error.main'}>
                                        -{parseFloat(balanceCheck.totalCost).toFixed(6)} ETH
                                    </Typography>
                                </Stack>
                            </>
                        )}
                    </Paper>
                )}

                {/* Insufficient Balance Warning */}
                {balanceCheck && !balanceCheck.sufficient && (
                    <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                        <Typography variant="body2" fontWeight={700}>Insufficient Balance</Typography>
                        <Typography variant="caption">
                            Balance: {parseFloat(balanceCheck.balance).toFixed(6)} ETH — Need: {parseFloat(balanceCheck.totalCost).toFixed(6)} ETH
                        </Typography>
                    </Alert>
                )}

                {/* Personal Sign: Message Preview */}
                {isPersonalSign && decodedMessage && (
                    <Paper elevation={0} sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2, mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', display: 'block', mb: 1 }}>
                            Message
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.8rem',
                                wordBreak: 'break-all',
                                maxHeight: 120,
                                overflow: 'auto',
                                lineHeight: 1.6,
                            }}
                        >
                            {decodedMessage}
                        </Typography>
                    </Paper>
                )}

                {/* Typed Data Preview */}
                {isTypedData && typedDataPreview && (
                    <Paper elevation={0} sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2, mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', display: 'block', mb: 1 }}>
                            Typed Data
                        </Typography>
                        {typedDataPreview.domain && (
                            <Box sx={{ mb: 1 }}>
                                <Typography variant="caption" color="text.secondary">Domain: {typedDataPreview.domain.name || "Unknown"}</Typography>
                            </Box>
                        )}
                        <pre style={{
                            overflow: 'auto',
                            maxHeight: 100,
                            fontSize: 10,
                            margin: 0,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                        }}>
                            {JSON.stringify(typedDataPreview.message || typedDataPreview.value || typedDataPreview, null, 2)}
                        </pre>
                    </Paper>
                )}

                {/* Collapsible Raw Data */}
                <Box>
                    <Button
                        size="small"
                        onClick={() => setShowRawData(!showRawData)}
                        endIcon={showRawData ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={{ fontSize: '0.75rem', color: 'text.secondary', textTransform: 'none', fontWeight: 600 }}
                    >
                        Raw Data
                    </Button>
                    <Collapse in={showRawData}>
                        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f5f5f5', mt: 0.5 }}>
                            <pre style={{
                                overflow: 'auto',
                                maxHeight: 120,
                                fontSize: 10,
                                margin: 0,
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                            }}>
                                {JSON.stringify(rpcReq.params, null, 2)}
                            </pre>
                        </Paper>
                    </Collapse>
                </Box>

                {error && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{error}</Alert>}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1.5 }}>
                <Button
                    onClick={onReject}
                    variant="outlined"
                    color="error"
                    fullWidth
                    disabled={loading}
                    sx={{
                        borderRadius: 3,
                        py: 1.25,
                        fontWeight: 700,
                        textTransform: 'none',
                    }}
                >
                    Reject
                </Button>
                <Tooltip
                    title={
                        !isChainSupported ? "Unsupported chain" :
                            (isDangerousSign && !riskAccepted) ? "Accept risks first" :
                                (isDangerousSign && countdown > 0) ? `Wait ${countdown}s` :
                                    (balanceCheck && !balanceCheck.sufficient) ? "Insufficient balance" :
                                        ""
                    }
                    arrow
                >
                    <span style={{ width: '100%' }}>
                        <Button
                            onClick={onApprove}
                            variant="contained"
                            fullWidth
                            disabled={isApproveDisabled}
                            sx={{
                                borderRadius: 3,
                                py: 1.25,
                                fontWeight: 700,
                                textTransform: 'none',
                                background: isDangerousSign
                                    ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                                    : 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                                boxShadow: isDangerousSign
                                    ? '0 4px 14px rgba(220, 38, 38, 0.35)'
                                    : '0 4px 14px rgba(37, 99, 235, 0.3)',
                                '&:hover': {
                                    background: isDangerousSign
                                        ? 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)'
                                        : 'linear-gradient(135deg, #172554 0%, #1e3a8a 100%)',
                                },
                                '&.Mui-disabled': {
                                    background: '#e0e0e0',
                                    color: '#999',
                                }
                            }}
                        >
                            {loading ? (
                                <CircularProgress size={24} color="inherit" />
                            ) : isDangerousSign && countdown > 0 ? (
                                `Approve (${countdown}s)`
                            ) : (
                                "Approve & Sign"
                            )}
                        </Button>
                    </span>
                </Tooltip>
            </DialogActions>
        </Dialog>
    );
}
