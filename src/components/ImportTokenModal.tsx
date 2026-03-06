import React, { useState, useEffect } from 'react';
import { Modal, Box, Typography, TextField, Button, CircularProgress, IconButton } from '@mui/material';
import { Close, Token } from '@mui/icons-material';
import { WalletContext } from '../AppContext';
import { ActiveAccountContext } from '../ActiveAccountProvider';

interface ImportTokenModalProps {
    open: boolean;
    onClose: () => void;
    onImportSuccess: () => void;
}

export default function ImportTokenModal({ open, onClose, onImportSuccess }: ImportTokenModalProps) {
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [tokenInfo, setTokenInfo] = useState<any>(null);
    const [error, setError] = useState('');

    const wallet_context = React.useContext(WalletContext);
    const active_context = React.useContext(ActiveAccountContext);

    useEffect(() => {
        if (!open) {
            setAddress('');
            setTokenInfo(null);
            setError('');
        }
    }, [open]);

    const handleAddressChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.trim();
        setAddress(val);
        setTokenInfo(null);
        setError('');

        if (val.length === 42 && val.startsWith('0x')) {
            if (!wallet_context || !active_context) return;

            const net = wallet_context.networkProvider.getActiveNetwork();
            setLoading(true);
            try {
                const metadata = await net.getTokenMetadata(wallet_context.tokenCache, val);
                if (metadata && metadata.name !== "Unknown Token") {
                    setTokenInfo(metadata);
                } else {
                    setError("Could not find valid ERC20 metadata on this network.");
                }
            } catch (err) {
                setError("Invalid contract address or network error.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleImport = () => {
        if (tokenInfo && wallet_context) {
            const net = wallet_context.networkProvider.getActiveNetwork();
            wallet_context.tokenCache.setToken(net.network_id, tokenInfo);

            // Force UI refresh by triggering data cache update externally if needed
            onImportSuccess();
            onClose();
        }
    };

    return (
        <Modal open={open} onClose={onClose} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{
                bgcolor: 'background.paper',
                borderRadius: 4,
                p: 4,
                width: '90%',
                maxWidth: 400,
                boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
                position: 'relative'
            }}>
                <IconButton sx={{ position: 'absolute', top: 12, right: 12 }} onClick={onClose}>
                    <Close />
                </IconButton>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <Box sx={{ p: 1, bgcolor: 'primary.main', borderRadius: 2, color: 'white', display: 'flex' }}>
                        <Token />
                    </Box>
                    <Typography variant="h6" fontWeight="700">Import Token</Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Paste the contract address of the custom ERC20 token you want to track on {wallet_context?.networkProvider.getActiveNetwork().network_name}.
                </Typography>

                <TextField
                    fullWidth
                    label="Token Contract Address"
                    variant="outlined"
                    value={address}
                    onChange={handleAddressChange}
                    error={!!error}
                    helperText={error || "Must be a valid 42-character 0x address"}
                    sx={{ mb: 3 }}
                />

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}

                {tokenInfo && (
                    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, mb: 3 }}>
                        <Typography variant="body2"><strong>Name:</strong> {tokenInfo.name}</Typography>
                        <Typography variant="body2"><strong>Symbol:</strong> {tokenInfo.symbol}</Typography>
                        <Typography variant="body2"><strong>Decimals:</strong> {tokenInfo.decimals}</Typography>
                    </Box>
                )}

                <Button
                    fullWidth
                    variant="contained"
                    disabled={!tokenInfo || loading}
                    onClick={handleImport}
                    sx={{ py: 1.5, fontWeight: 'bold' }}
                >
                    Import Custom Token
                </Button>
            </Box>
        </Modal>
    );
}
