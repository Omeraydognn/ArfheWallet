/**
 * ThemeContext — Color mode state management for ArfheWallet.
 *
 * Persists theme preference to localStorage (long-term) AND
 * chrome.storage.session via usePersistedState (survives popup close/open).
 *
 * Usage:
 *   const { mode, toggleColorMode, setMode } = useColorMode();
 */

import * as React from 'react';
import { createContext, useMemo, useContext, useCallback } from 'react';
import { type PaletteMode } from '@mui/material';
import { usePersistedState } from './hooks/usePersistedState';

export type ColorModeContextType = {
    /** Current palette mode */
    mode: PaletteMode;
    /** Toggle between light ↔ dark */
    toggleColorMode: () => void;
    /** Set mode explicitly */
    setMode: (mode: PaletteMode) => void;
};

export const ColorModeContext = createContext<ColorModeContextType>({
    mode: 'light',
    toggleColorMode: () => { },
    setMode: () => { },
});

/** Read initial mode from localStorage (sync, no flicker) */
function getInitialMode(): PaletteMode {
    try {
        const saved = localStorage.getItem('arfhe_theme_mode');
        if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* SSR / restricted storage */ }
    return 'light';
}

export const ColorModeProvider = ({ children }: { children: React.ReactNode }) => {
    // usePersistedState keeps the value in chrome.storage.session so
    // popup close/open restores the last mode instantly.
    const [mode, setModeRaw] = usePersistedState<PaletteMode>('theme_mode', getInitialMode());

    const setMode = useCallback((newMode: PaletteMode) => {
        setModeRaw(newMode);
        try { localStorage.setItem('arfhe_theme_mode', newMode); } catch { /* */ }
    }, [setModeRaw]);

    const toggleColorMode = useCallback(() => {
        setMode(mode === 'light' ? 'dark' : 'light');
    }, [mode, setMode]);

    const value = useMemo<ColorModeContextType>(
        () => ({ mode, toggleColorMode, setMode }),
        [mode, toggleColorMode, setMode],
    );

    return (
        <ColorModeContext.Provider value={value}>
            {children}
        </ColorModeContext.Provider>
    );
};

/** Convenience hook for consuming color mode context */
export function useColorMode(): ColorModeContextType {
    const ctx = useContext(ColorModeContext);
    return ctx;
}
