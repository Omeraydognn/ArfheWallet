import { createTheme, PaletteMode } from "@mui/material";

export const getTheme = (mode: PaletteMode) => {
  return createTheme({
    palette: {
      mode,
      ...(mode === 'dark' ? {
        // Dark Mode Colors
        background: {
          default: '#0f172a', // Slate 900 - Premium Dark
          paper: '#1e293b',   // Slate 800
        },
        text: {
          primary: '#f8fafc', // Slate 50
          secondary: '#94a3b8', // Slate 400
        },
        primary: {
          main: '#6366f1', // Indigo 500
        },
        secondary: {
          main: '#10b981', // Emerald 500
        }
      } : {
        // Light Mode Colors (Default MUI or keep existing empty)
        // User said: "The application will remain the same"
        background: {
          default: '#f8fafc',
          paper: '#ffffff',
        },
        text: {
          primary: '#0f172a',
          secondary: '#64748b',
        },
        primary: {
          main: '#4f46e5', // Indigo 600
        }
      }),
    },
    typography: {
      fontFamily: [
        "Funnel Display",
        "sans-serif",
      ].join(','),
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none', // Disable elevation overlay in dark mode for cleaner look
          }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 12,
            fontWeight: 600,
          }
        }
      }
    }
  });
};