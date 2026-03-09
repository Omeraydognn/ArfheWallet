import React, { useState, useEffect } from 'react';
import { Modal, Box, Typography, TextField, Button, CircularProgress, IconButton } from '@mui/material';
import { Close, Collections } from '@mui/icons-material';
import { WalletContext } from '../AppContext';
import { ActiveAccountContext } from '../ActiveAccountProvider';

interface ImportNftModalProps {
    open: boolean;
    onClose: () => void;
    onImportSuccess: () => void;
}

export default function ImportNftModal({ open, onClose, onImportSuccess }: ImportNftModalProps) {
    const [address, setAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [nftInfo, setNftInfo] = useState<{ name: string; symbol: string; contractAddress: string; imageUrl?: string } | null>(null);
    const [error, setError] = useState('');

    const wallet_context = React.useContext(WalletContext);
    const active_context = React.useContext(ActiveAccountContext);

    useEffect(() => {
        if (!open) {
            setAddress('');
            setNftInfo(null);
            setError('');
        }
    }, [open]);

    const handleAddressChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.trim();
        setAddress(val);
        setNftInfo(null);
        setError('');

        if (val.length === 42 && val.startsWith('0x')) {
            if (!wallet_context || !active_context) return;

            const net = wallet_context.networkProvider.getActiveNetwork();
            setLoading(true);
            try {
                const metadata = await net.getNftMetadata(wallet_context.nftCache, val);
                if (metadata && metadata.name !== "Unknown NFT") {
                    setNftInfo(metadata);
                } else {
                    setError("Could not find valid ERC721 properties on this network.");
                }
            } catch (err) {
                setError("Invalid contract address or network error.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleImport = () => {
        if (nftInfo && wallet_context) {
            const net = wallet_context.networkProvider.getActiveNetwork();
            wallet_context.nftCache.setNFT(net.network_id, { ...nftInfo, logoSrc: nftInfo.imageUrl ?? '' });

            onImportSuccess();
            onClose();
        }
    };

    return (
        <Modal open={open} onClose={onClose} aria-labelledby="import-nft-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{
                bgcolor: 'background.paper',
                borderRadius: 4,
                p: 4,
                width: '90%',
                maxWidth: 400,
                boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
                position: 'relative'
            }}>
                <IconButton sx={{ position: 'absolute', top: 12, right: 12 }} onClick={onClose} aria-label="Close import NFT">
                    <Close />
                </IconButton>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <Box sx={{ p: 1, bgcolor: 'secondary.main', borderRadius: 2, color: 'white', display: 'flex' }}>
                        <Collections />
                    </Box>
                    <Typography id="import-nft-title" variant="h6" fontWeight="700">Import NFT</Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Paste the contract address of the NFT collection you want to track on {wallet_context?.networkProvider.getActiveNetwork().network_name}.
                </Typography>

                <TextField
                    fullWidth
                    label="NFT Contract Address"
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

                {nftInfo && (
                    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, mb: 3 }}>
                        <Typography variant="body2"><strong>Collection Name:</strong> {nftInfo.name}</Typography>
                        <Typography variant="body2"><strong>Symbol:</strong> {nftInfo.symbol}</Typography>
                    </Box>
                )}

                <Button
                    fullWidth
                    variant="contained"
                    color="secondary"
                    disabled={!nftInfo || loading}
                    onClick={handleImport}
                    sx={{ py: 1.5, fontWeight: 'bold' }}
                >
                    Import Custom NFT
                </Button>
            </Box>
        </Modal>
    );
}
