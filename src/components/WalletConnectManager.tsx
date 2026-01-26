import React, { useContext, useEffect, useState } from "react";
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
    Divider
} from "@mui/material";
import { WalletContext } from "../AppContext";
import { formatEther } from "ethers";

// Icons
import LinkIcon from '@mui/icons-material/Link';
import SecurityIcon from '@mui/icons-material/Security';

export default function WalletConnectManager() {
    const context = useContext(WalletContext);
    const service = context?.walletConnectService;
    const account = context?.accountManager?.GetActive();

    // State for Transaction Requests
    const [request, setRequest] = useState<any | null>(null);
    // State for Session Proposals (Connections)
    const [proposal, setProposal] = useState<any | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!service) return;

        // Initialize Service on Mount (Idempotent)
        service.init();

        // 1. Subscribe to Connection Proposals
        service.setOnProposal((prop: any) => {
            console.log("[WC Manager] Received Proposal:", prop);
            setProposal(prop);
        });

        // 2. Subscribe to Requests (Sign/Tx)
        service.setOnRequest((req: any) => {
            console.log("[WC Manager] Received Request:", req);
            setRequest(req);
        });

        service.setOnSessionDelete(() => {
            setRequest(null);
            setProposal(null);
        });

        return () => {
            // Cleanup if needed
        };
    }, [service]);

    // --- HANDLERS: Session Approval (Connection) ---

    const handleApproveSession = async () => {
        if (!service || !proposal) return;
        setLoading(true);
        setError("");
        try {
            await service.approveSession(proposal);
            setProposal(null); // Close Modal
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Connection Failed");
        } finally {
            setLoading(false);
        }
    };

    const handleRejectSession = async () => {
        if (!service || !proposal) return;
        await service.rejectSession(proposal);
        setProposal(null);
    };

    // --- HANDLERS: Request Approval (Transaction) ---

    const handleApproveRequest = async () => {
        if (!service || !account || !request) return;
        setLoading(true);
        setError("");

        try {
            let result;
            const rpcReq = request.params.request;
            const wallet = account.ethers_wallet; // Signer

            if (!wallet) throw new Error("Wallet locked or not found");

            if (rpcReq.method === "personal_sign") {
                const hexMsg = rpcReq.params[0];
                result = await wallet.signMessage(hexMsg);
            }
            else if (rpcReq.method === "eth_sendTransaction") {
                const txParams = rpcReq.params[0];
                const tx = await wallet.sendTransaction(txParams);
                result = tx.hash;
            }
            else if (rpcReq.method === "eth_signTypedData" || rpcReq.method === "eth_signTypedData_v4") {
                const data = JSON.parse(rpcReq.params[1]);
                result = await wallet.signTypedData(data.domain, data.types, data.value);
            }
            else {
                throw new Error("Unsupported Method: " + rpcReq.method);
            }

            await service.approveRequest(account, request, result);
            setRequest(null);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Approval Failed");
        } finally {
            setLoading(false);
        }
    };

    const handleRejectRequest = async () => {
        if (!service || !request) return;
        await service.rejectRequest(request);
        setRequest(null);
    };

    // --- RENDER 1: CONNECTION PROPOSAL ---
    if (proposal) {
        const { dApp } = proposal;
        return (
            <Dialog open={true} maxWidth="xs" fullWidth>
                <DialogTitle component="div" sx={{ textAlign: 'center', pt: 3 }}>
                    <Avatar
                        src={dApp.icon}
                        sx={{ width: 64, height: 64, margin: '0 auto', mb: 2, bgcolor: 'primary.main' }}
                    >
                        {dApp.name[0]}
                    </Avatar>
                    <Typography variant="h5" fontWeight={700}>Connect to {dApp.name}?</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {dApp.url}
                    </Typography>
                </DialogTitle>

                <DialogContent>
                    <Box sx={{ bgcolor: 'rgba(0,0,0,0.03)', p: 2, borderRadius: 2, mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                            PERMISSIONS REQUESTED
                        </Typography>
                        <Stack direction="row" gap={1} flexWrap="wrap">
                            <Chip icon={<LinkIcon fontSize="small" />} label="View Account Balance" size="small" />
                            <Chip icon={<SecurityIcon fontSize="small" />} label="Request Transactions" size="small" />
                        </Stack>
                    </Box>
                    <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
                        Make sure you trust this site. You will still be asked to approve every transaction.
                    </Alert>
                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                </DialogContent>

                <DialogActions sx={{ p: 3, pt: 0, flexDirection: 'column', gap: 1 }}>
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        onClick={handleApproveSession}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : "Connect"}
                    </Button>
                    <Button
                        fullWidth
                        onClick={handleRejectSession}
                        color="inherit"
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    // --- RENDER 2: TRANSACTION REQUEST ---
    if (request) {
        const { dApp, params } = request;
        const { request: rpcReq, chainId } = params;
        const isChainSupported = chainId === "eip155:1" || chainId === "eip155:11155111";

        const isTransaction = rpcReq.method === "eth_sendTransaction";
        const txValue = isTransaction && rpcReq.params[0].value ? formatEther(rpcReq.params[0].value) : "0";
        const txTo = isTransaction && rpcReq.params[0].to;

        return (
            <Dialog open={true} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar src={dApp.icon} alt={dApp.name} />
                    <Box>
                        <Typography variant="h6">{dApp.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{dApp.url}</Typography>
                    </Box>
                </DialogTitle>

                <DialogContent dividers>
                    {!isChainSupported && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            Warning: Request from unsupported chain ({chainId}).
                        </Alert>
                    )}

                    <Typography variant="subtitle2" gutterBottom textTransform="uppercase" color="text.secondary">
                        Request Type
                    </Typography>
                    <Typography variant="body1" fontWeight={600} gutterBottom sx={{ fontFamily: 'monospace', bgcolor: '#f0f0f0', p: 1, borderRadius: 1 }}>
                        {rpcReq.method}
                    </Typography>

                    {isTransaction && (
                        <Box sx={{ bgcolor: 'rgba(0,0,0,0.03)', p: 2, borderRadius: 2, my: 2 }}>
                            <Stack direction="row" justifyContent="space-between" mb={1}>
                                <Typography variant="body2" color="text.secondary">Amount</Typography>
                                <Typography variant="body2" fontWeight={700}>{txValue} ETH</Typography>
                            </Stack>
                            <Divider sx={{ my: 1 }} />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="body2" color="text.secondary">To</Typography>
                                <Typography variant="body2" fontFamily="monospace">{txTo?.slice(0, 6)}...{txTo?.slice(-4)}</Typography>
                            </Stack>
                        </Box>
                    )}

                    <Box sx={{ mt: 2 }}>
                        <Typography variant="caption" color="text.secondary">Raw Data:</Typography>
                        <pre style={{ overflow: 'auto', maxHeight: 100, fontSize: 10, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                            {JSON.stringify(rpcReq.params, null, 2)}
                        </pre>
                    </Box>

                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                </DialogContent>

                <DialogActions sx={{ p: 2, gap: 2 }}>
                    <Button
                        onClick={handleRejectRequest}
                        variant="outlined"
                        color="error"
                        fullWidth
                        disabled={loading}
                    >
                        Reject
                    </Button>
                    <Button
                        onClick={handleApproveRequest}
                        variant="contained"
                        color="primary"
                        fullWidth
                        disabled={loading || !isChainSupported}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : "Approve & Sign"}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    // Nothing to show
    return null;
}
