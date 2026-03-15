import React, { useState, useEffect, useContext } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, List, ListItem, ListItemAvatar, ListItemText,
    Avatar, IconButton, Typography, Box, TextField, Stack,
    Chip, Divider
} from '@mui/material';
import { Close, Add, Delete, Person, History, AccountBalance } from '@mui/icons-material';
import { WalletContext } from '../AppContext';
import { Contact, RecentAddress } from '../backend/ContactManager';
import { isAddress } from 'ethers';
import { useToast } from './ToastProvider';
import { useTranslation } from 'react-i18next';

export function ContactBookModal({
    open,
    onClose,
    onSelect
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (address: string) => void;
}) {
    const context = useContext(WalletContext);
    const { showToast } = useToast();
    const { t } = useTranslation();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [recentAddresses, setRecentAddresses] = useState<RecentAddress[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');

    useEffect(() => {
        if (open && context?.contactManager) {
            setContacts(context.contactManager.getContacts());
            const chainId = context.networkProvider?.getActiveNetwork()?.network_id as number | undefined;
            setRecentAddresses(context.contactManager.getRecentAddresses(chainId));
            setIsAdding(false);
            setNewName('');
            setNewAddress('');
        }
    }, [open, context]);

    const handleAdd = () => {
        if (!context?.contactManager) return;
        if (!newName.trim()) {
            showToast(t('contacts.enterName'), "error");
            return;
        }
        if (!isAddress(newAddress)) {
            showToast(t('contacts.enterValidAddress'), "error");
            return;
        }
        try {
            context.contactManager.addContact(newName.trim(), newAddress.trim());
            setContacts(context.contactManager.getContacts());
            setIsAdding(false);
            setNewName('');
            setNewAddress('');
            showToast(t('contacts.contactAdded'), "success");
        } catch (e) {
            showToast(e instanceof Error ? e.message : t('common.error'), "error");
        }
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!context?.contactManager) return;
        context.contactManager.removeContact(id);
        setContacts(context.contactManager.getContacts());
        showToast(t('contacts.contactDeleted'), "info");
    };

    const formatTimeAgo = (ts: number): string => {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return t('contacts.justNow');
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return `${Math.floor(days / 7)}w ago`;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="contact-book-title" PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle id="contact-book-title" sx={{ borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box component="span" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>{t('contacts.title')}</Box>
                <IconButton onClick={onClose} aria-label="Close contact book"><Close /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 0, maxHeight: 420, overflow: 'auto' }}>
                {isAdding ? (
                    <Box sx={{ p: 3 }}>
                        <Typography variant="subtitle2" gutterBottom>{t('contacts.addNew')}</Typography>
                        <Stack spacing={2}>
                            <TextField
                                label={t('contacts.name')}
                                variant="outlined"
                                fullWidth
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder={t('contacts.namePlaceholder')}
                            />
                            <TextField
                                label={t('contacts.ethAddress')}
                                variant="outlined"
                                fullWidth
                                value={newAddress}
                                onChange={e => setNewAddress(e.target.value)}
                                placeholder={t('contacts.addressPlaceholder')}
                            />
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button onClick={() => setIsAdding(false)}>{t('common.cancel')}</Button>
                                <Button variant="contained" onClick={handleAdd}>{t('contacts.saveContact')}</Button>
                            </Stack>
                        </Stack>
                    </Box>
                ) : (
                    <>
                        {/* ─── Recent Addresses ─── */}
                        {recentAddresses.length > 0 && (
                            <Box>
                                <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <History sx={{ fontSize: 16, color: 'text.secondary' }} />
                                    <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                                        {t('contacts.recent')}
                                    </Typography>
                                </Box>
                                <List sx={{ p: 0 }} dense>
                                    {recentAddresses.map((r, i) => (
                                        <ListItem
                                            key={`recent-${r.address}-${i}`}
                                            sx={{
                                                cursor: 'pointer',
                                                '&:hover': { bgcolor: 'action.hover' },
                                                py: 0.75,
                                                borderBottom: i < recentAddresses.length - 1 ? '1px solid' : 'none',
                                                borderColor: 'divider',
                                            }}
                                            onClick={() => {
                                                onSelect(r.address);
                                                onClose();
                                            }}
                                        >
                                            <ListItemAvatar sx={{ minWidth: 36 }}>
                                                <Avatar sx={{ width: 28, height: 28, bgcolor: r.label && !r.label.startsWith('0x') ? 'secondary.light' : 'grey.300', fontSize: 14 }}>
                                                    {r.label && !r.label.startsWith('0x') ? <AccountBalance sx={{ fontSize: 16 }} /> : <History sx={{ fontSize: 16 }} />}
                                                </Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        <Typography variant="body2" fontWeight={600} noWrap>
                                                            {r.label || `${r.address.slice(0, 6)}...${r.address.slice(-4)}`}
                                                        </Typography>
                                                    </Stack>
                                                }
                                                secondary={
                                                    <Stack direction="row" alignItems="center" spacing={1}>
                                                        <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                                                            {r.address.slice(0, 8)}...{r.address.slice(-6)}
                                                        </Typography>
                                                        <Chip label={formatTimeAgo(r.lastUsed)} size="small" variant="outlined"
                                                            sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
                                                    </Stack>
                                                }
                                            />
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        )}

                        {/* ─── Divider between recent and contacts ─── */}
                        {recentAddresses.length > 0 && contacts.length > 0 && (
                            <Divider sx={{ mx: 2 }} />
                        )}

                        {/* ─── Saved Contacts ─── */}
                        {contacts.length > 0 && (
                            <Box>
                                <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                                    <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                                        {t('contacts.contacts')}
                                    </Typography>
                                </Box>
                                <List sx={{ p: 0 }}>
                                    {contacts.map(c => (
                                        <ListItem
                                            key={c.id}
                                            sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderBottom: '1px solid', borderColor: 'divider' }}
                                            onClick={() => {
                                                onSelect(c.address);
                                                onClose();
                                            }}
                                        >
                                            <ListItemAvatar>
                                                <Avatar sx={{ bgcolor: 'primary.light' }}><Person /></Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={<Typography fontWeight={600}>{c.name}</Typography>}
                                                secondary={<Typography variant="caption" fontFamily="monospace">{c.address.slice(0, 10)}...{c.address.slice(-8)}</Typography>}
                                            />
                                            <IconButton color="error" edge="end" onClick={(e) => handleDelete(c.id, e)} size="small" aria-label={`Delete contact ${c.name}`}>
                                                <Delete fontSize="small" />
                                            </IconButton>
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        )}

                        {/* ─── Empty state ─── */}
                        {contacts.length === 0 && recentAddresses.length === 0 && (
                            <Box sx={{ p: 4, textAlign: 'center' }}>
                                <Person sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.5, mb: 1 }} />
                                <Typography color="text.secondary">{t('contacts.noContacts')}</Typography>
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>

            {!isAdding && (
                <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Button startIcon={<Add />} onClick={() => setIsAdding(true)} fullWidth variant="outlined" sx={{ borderRadius: 2 }}>
                        {t('contacts.addNew')}
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
}
