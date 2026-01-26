import * as React from 'react';
import { useContext } from 'react';
import { useNavigate } from 'react-router';
import { Box, Typography, Container, Paper, List, ListItem, ListItemButton, ListItemText, ListItemIcon, Switch } from '@mui/material';
import { Notifications, DarkMode, Language, Security } from '@mui/icons-material';
import { ColorModeContext } from '../ThemeContext';

export default function Settings() {
    const navigate = useNavigate();
    const { mode, toggleColorMode } = useContext(ColorModeContext);

    return (
        <Box sx={{ pb: 10 }}>
            <Container maxWidth="md" sx={{ py: 4 }}>
                <Typography variant="h4" fontWeight={800} gutterBottom>
                    Settings
                </Typography>

                <Paper elevation={0} sx={{ borderRadius: 4, overflow: 'hidden', mb: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
                    <List>
                        <ListItem>
                            <ListItemIcon><DarkMode /></ListItemIcon>
                            <ListItemText primary="Dark Mode" secondary="Toggle app theme" />
                            <Switch checked={mode === 'dark'} onChange={toggleColorMode} />
                        </ListItem>
                        <ListItemButton>
                            <ListItemIcon><Notifications /></ListItemIcon>
                            <ListItemText primary="Notifications" secondary="Manage alerts" />
                        </ListItemButton>
                        <ListItemButton>
                            <ListItemIcon><Language /></ListItemIcon>
                            <ListItemText primary="Language" secondary="English" />
                        </ListItemButton>
                        <ListItemButton onClick={() => navigate('/settings/security')}>
                            <ListItemIcon><Security /></ListItemIcon>
                            <ListItemText primary="Security" secondary="Keys and permissions" />
                        </ListItemButton>
                    </List>
                </Paper>
            </Container>
        </Box>
    );
}
