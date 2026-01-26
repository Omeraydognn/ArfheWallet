import * as React from 'react';
import { createContext, useMemo, useState, useEffect } from 'react';
import { PaletteMode } from '@mui/material';

type ColorModeContextType = {
    mode: PaletteMode;
    toggleColorMode: () => void;
};

export const ColorModeContext = createContext<ColorModeContextType>({
    mode: 'light',
    toggleColorMode: () => { },
});

export const ColorModeProvider = ({ children }: { children: React.ReactNode }) => {
    const [mode, setMode] = useState<PaletteMode>(() => {
        // 1. Try local storage
        const saved = localStorage.getItem('arfhe_theme_mode');
        if (saved === 'dark' || saved === 'light') return saved;

        // 2. Default to light as per user request (or system preference if desired)
        // "The application will remain the same" -> defaulting to light.
        return 'light';
    });

    const colorMode = useMemo(
        () => ({
            mode,
            toggleColorMode: () => {
                setMode((prevMode) => {
                    const newMode = prevMode === 'light' ? 'dark' : 'light';
                    localStorage.setItem('arfhe_theme_mode', newMode);
                    return newMode;
                });
            },
        }),
        [mode],
    );

    return (
        <ColorModeContext.Provider value={colorMode}>
            {children}
        </ColorModeContext.Provider>
    );
};
