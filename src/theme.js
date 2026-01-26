import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'light', // Switched to Light
        primary: {
            main: '#4f46e5', // Indigo 600 - Sharp on white
            light: '#818cf8',
            dark: '#3730a3',
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#10b981', // Emerald 500
            light: '#34d399',
            dark: '#059669',
            contrastText: '#ffffff',
        },
        background: {
            default: '#f3f4f6', // Cool gray 100 - very light gray, not pure white to give depth
            paper: '#ffffff',   // Pure white for cards
        },
        text: {
            primary: '#111827', // Gray 900
            secondary: '#4b5563', // Gray 600
        },
        action: {
            hover: 'rgba(0, 0, 0, 0.04)',
            selected: 'rgba(79, 70, 229, 0.08)',
        },
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        h1: { fontWeight: 800, letterSpacing: '-0.025em', color: '#111827' },
        h2: { fontWeight: 700, letterSpacing: '-0.025em', color: '#111827' },
        h3: { fontWeight: 700, letterSpacing: '-0.025em', color: '#111827' },
        h4: { fontWeight: 700, letterSpacing: '-0.025em', color: '#111827' },
        h5: { fontWeight: 600, color: '#1f2937' },
        h6: { fontWeight: 600, color: '#1f2937' },
        button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: {
        borderRadius: 16,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    scrollbarWidth: 'none',
                    '&::-webkit-scrollbar': {
                        display: 'none',
                    },
                    backgroundColor: '#f3f4f6',
                    color: '#111827',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: '50px',
                    boxShadow: 'none',
                    padding: '10px 24px',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)',
                        transform: 'translateY(-1px)',
                    },
                },
                containedPrimary: {
                    background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backdropFilter: 'blur(20px)',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)', // Translucent white
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                },
                elevation1: { boxShadow: '0 4px 20px rgba(0,0,0,0.05)' },
                elevation2: { boxShadow: '0 8px 30px rgba(0,0,0,0.08)' },
                elevation3: { boxShadow: '0 12px 40px rgba(0,0,0,0.12)' },
            },
        },
        MuiBottomNavigation: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    borderTop: '1px solid rgba(0, 0, 0, 0.05)',
                },
            },
        },
        MuiBottomNavigationAction: {
            styleOverrides: {
                root: {
                    color: '#9ca3af',
                    '&.Mui-selected': {
                        color: '#4f46e5',
                    },
                },
            },
        },
    },
});

export default theme;
