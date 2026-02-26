import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Snackbar, Alert, Typography } from '@mui/material';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastContextProps {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [type, setType] = useState<ToastType>('info');

    const showToast = (msg: string, t: ToastType = 'info') => {
        setMessage(msg);
        setType(t);
        setOpen(true);
    };

    const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') {
            return;
        }
        setOpen(false);
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <Snackbar
                open={open}
                autoHideDuration={4000}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                sx={{ mb: { xs: 8, sm: 2 } }} // Push up slightly above bottom bar on mobile
            >
                <Alert
                    onClose={handleClose}
                    severity={type}
                    variant="filled"
                    sx={{
                        width: '100%',
                        borderRadius: 3,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        alignItems: 'center'
                    }}
                >
                    <Typography variant="body2" fontWeight={600}>
                        {message}
                    </Typography>
                </Alert>
            </Snackbar>
        </ToastContext.Provider>
    );
};
