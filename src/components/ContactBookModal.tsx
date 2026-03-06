import React, { useState, useEffect, useContext } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, List, ListItem, ListItemAvatar, ListItemText,
    Avatar, IconButton, Typography, Box, TextField, Stack,
    Paper
} from '@mui/material';
import { Close, Add, Delete, Person } from '@mui/icons-material';
import { WalletContext } from '../AppContext';
import { Contact } from '../backend/ContactManager';
import { isAddress } from 'ethers';
import { useToast } from './ToastProvider';

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
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAddress, setNewAddress] = useState('');

    useEffect(() => {
        if (open && context?.contactManager) {
            setContacts(context.contactManager.getContacts());
            setIsAdding(false);
            setNewName('');
            setNewAddress('');
        }
    }, [open, context]);

    const handleAdd = () => {
        if (!context?.contactManager) return;
        if (!newName.trim()) {
            showToast("Please enter a name", "error");
            return;
        }
        if (!isAddress(newAddress)) {
            showToast("Please enter a valid Ethereum address", "error");
            return;
        }
        try {
            context.contactManager.addContact(newName.trim(), newAddress.trim());
            setContacts(context.contactManager.getContacts());
            setIsAdding(false);
            setNewName('');
            setNewAddress('');
            showToast("Contact added successfully", "success");
        } catch (e: any) {
            showToast(e.message || "Failed to add contact", "error");
        }
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!context?.contactManager) return;
        context.contactManager.removeContact(id);
        setContacts(context.contactManager.getContacts());
        showToast("Contact deleted", "info");
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box component="span" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>Contact Book</Box>
                <IconButton onClick={onClose}><Close /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 0 }}>
                {isAdding ? (
                    <Box sx={{ p: 3 }}>
                        <Typography variant="subtitle2" gutterBottom>Add New Contact</Typography>
                        <Stack spacing={2}>
                            <TextField
                                label="Name"
                                variant="outlined"
                                fullWidth
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. Alice"
                            />
                            <TextField
                                label="ETH Address"
                                variant="outlined"
                                fullWidth
                                value={newAddress}
                                onChange={e => setNewAddress(e.target.value)}
                                placeholder="0x..."
                            />
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button onClick={() => setIsAdding(false)}>Cancel</Button>
                                <Button variant="contained" onClick={handleAdd}>Save Contact</Button>
                            </Stack>
                        </Stack>
                    </Box>
                ) : (
                    <List sx={{ p: 0 }}>
                        {contacts.length === 0 ? (
                            <Box sx={{ p: 4, textAlign: 'center' }}>
                                <Person sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.5, mb: 1 }} />
                                <Typography color="text.secondary">No contacts saved yet.</Typography>
                            </Box>
                        ) : (
                            contacts.map(c => (
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
                                    <IconButton color="error" edge="end" onClick={(e) => handleDelete(c.id, e)} size="small">
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </ListItem>
                            ))
                        )}
                    </List>
                )}
            </DialogContent>

            {!isAdding && (
                <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Button startIcon={<Add />} onClick={() => setIsAdding(true)} fullWidth variant="outlined" sx={{ borderRadius: 2 }}>
                        Add New Contact
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
}
