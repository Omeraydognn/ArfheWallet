import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Snackbar, Alert, Typography, Button, Stack } from '@mui/material';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** Options for advanced toast display */
export interface ToastOptions {
    /** Auto-dismiss duration in ms. null = persistent (requires manual close). Default: auto by type */
    duration?: number | null;
    /** Action button label (e.g. "Retry") */
    actionLabel?: string;
    /** Callback when action button is clicked */
    onAction?: () => void;
    /** Dedupe key — if set, prevents duplicate toasts with same key */
    dedupeKey?: string;
}

interface ToastContextProps {
    showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
    /** Dismiss the currently visible toast */
    dismissToast: () => void;
}

interface QueuedToast {
    id: number;
    message: string;
    type: ToastType;
    options: ToastOptions;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

/** Default auto-dismiss durations by severity */
const DEFAULT_DURATIONS: Record<ToastType, number> = {
    success: 3000,
    info: 4000,
    warning: 5000,
    error: 6000,
};

let toastIdCounter = 0;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [current, setCurrent] = useState<QueuedToast | null>(null);
    const [open, setOpen] = useState(false);
    const queueRef = useRef<QueuedToast[]>([]);
    const activeDedupeKeys = useRef<Set<string>>(new Set());

    const processQueue = useCallback(() => {
        if (queueRef.current.length > 0) {
            const next = queueRef.current.shift()!;
            setCurrent(next);
            setOpen(true);
        }
    }, []);

    const showToast = useCallback((msg: string, t: ToastType = 'info', options: ToastOptions = {}) => {
        // Dedupe check
        if (options.dedupeKey) {
            if (activeDedupeKeys.current.has(options.dedupeKey)) return;
            activeDedupeKeys.current.add(options.dedupeKey);
            // Auto-clear dedupe key after display cycle
            setTimeout(() => activeDedupeKeys.current.delete(options.dedupeKey!), 8000);
        }

        const toast: QueuedToast = {
            id: ++toastIdCounter,
            message: msg,
            type: t,
            options,
        };

        if (!open) {
            setCurrent(toast);
            setOpen(true);
        } else {
            // Queue it — shown after current closes
            queueRef.current.push(toast);
        }
    }, [open]);

    const dismissToast = useCallback(() => {
        setOpen(false);
    }, []);

    const handleClose = useCallback((_event?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') return;
        setOpen(false);
    }, []);

    const handleExited = useCallback(() => {
        // Clear dedupe key for exited toast
        if (current?.options.dedupeKey) {
            activeDedupeKeys.current.delete(current.options.dedupeKey);
        }
        setCurrent(null);
        processQueue();
    }, [current, processQueue]);

    const handleAction = useCallback(() => {
        current?.options.onAction?.();
        setOpen(false);
    }, [current]);

    // Determine auto-hide duration
    const autoHideDuration = current
        ? (current.options.duration === null
            ? null // persistent
            : current.options.duration ?? DEFAULT_DURATIONS[current.type])
        : 4000;

    return (
        <ToastContext.Provider value={{ showToast, dismissToast }}>
            {children}
            <Snackbar
                open={open}
                autoHideDuration={autoHideDuration}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                TransitionProps={{ onExited: handleExited }}
                sx={{ mb: { xs: 8, sm: 2 } }}
            >
                <Alert
                    onClose={handleClose}
                    severity={current?.type ?? 'info'}
                    variant="filled"
                    sx={{
                        width: '100%',
                        borderRadius: 3,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        alignItems: 'center',
                    }}
                    action={
                        current?.options.actionLabel ? (
                            <Button
                                color="inherit"
                                size="small"
                                onClick={handleAction}
                                sx={{
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    minWidth: 'auto',
                                    ml: 1,
                                }}
                            >
                                {current.options.actionLabel}
                            </Button>
                        ) : undefined
                    }
                >
                    <Typography variant="body2" fontWeight={600}>
                        {current?.message ?? ''}
                    </Typography>
                </Alert>
            </Snackbar>
        </ToastContext.Provider>
    );
};
