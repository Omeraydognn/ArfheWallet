/**
 * ArfTheme — Unified Design System for ArfheWallet
 *
 * Single source of truth for the entire application's visual identity.
 * Supports light + dark modes with premium crypto-wallet aesthetics:
 * glassmorphism, smooth transitions, depth layering.
 *
 * Professional vivid blue accent palette with refined slate neutrals.
 * Vibrant, original fintech aesthetic for crypto wallet.
 *
 * Usage:
 *   import { getTheme, tokens } from "./ArfTheme";
 *   const theme = getTheme("light");
 */

import { createTheme, type PaletteMode, alpha } from "@mui/material";

// ─── Design Tokens ───────────────────────────────────────────────
// Re-usable semantic color & style constants.
// Components can import `tokens` directly for values outside MUI's
// palette system (gradients, chart colors, network badges, etc.).

export const tokens = {
  // Brand — refined slate neutral scale
  brand: {
    neutral50: "#f8fafc",
    neutral100: "#f1f5f9",
    neutral200: "#e2e8f0",
    neutral300: "#cbd5e1",
    neutral400: "#94a3b8",
    neutral500: "#64748b",
    neutral600: "#475569",
    neutral700: "#334155",
    neutral800: "#1e293b",
    neutral900: "#0f172a",
  },

  // Blue — vivid primary accent (premium crypto fintech)
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
  },

  // Sky — bright complementary highlight
  sky: {
    50: "#f0f9ff",
    100: "#e0f2fe",
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c4a6e",
  },

  // Accent — emerald for success / privacy / FHE
  accent: {
    emerald50: "#ecfdf5",
    emerald100: "#d1fae5",
    emerald400: "#34d399",
    emerald500: "#10b981",
    emerald600: "#059669",
    emerald700: "#047857",
  },

  // Danger / negative
  danger: {
    red400: "#f87171",
    red500: "#ef4444",
    red600: "#dc2626",
  },

  // Warning
  warning: {
    amber400: "#fbbf24",
    amber500: "#f59e0b",
    amber600: "#d97706",
  },

  // Info
  info: {
    sky400: "#38bdf8",
    sky500: "#0ea5e9",
    blue500: "#3b82f6",
  },

  // Extra palette (charts, avatars, categories)
  extra: {
    slate500: "#64748b",
    slate600: "#475569",
    zinc500: "#71717a",
    zinc600: "#52525b",
    cool500: "#6b7280",
    walletConnect: "#3396FF",
  },

  // ── Gradients ────────────────────────────────────────────────
  gradient: {
    /** Primary CTA button — vivid blue */
    primary: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
    /** Hero / splash accent */
    brand: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)",
    /** Success / privacy */
    success: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    /** Shimmer text animation */
    shimmerLight: "linear-gradient(90deg, #94a3b8, #2563eb, #94a3b8)",
    shimmerDark: "linear-gradient(90deg, #60a5fa, #dbeafe, #60a5fa)",
    /** Swap / action */
    action: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
    /** WalletConnect */
    walletConnect: "linear-gradient(135deg, #3396FF 0%, #2563eb 100%)",
    /** Balance card — premium */
    balanceLight: "linear-gradient(135deg, #0c1a3d 0%, #1e3a8a 40%, #2563eb 100%)",
    balanceDark: "linear-gradient(135deg, #0b1120 0%, #0c1a3d 40%, #172554 100%)",
    /** Card hover subtle tint */
    cardHoverLight: "linear-gradient(135deg, rgba(37,99,235,0.03) 0%, rgba(255,255,255,0.9) 100%)",
    cardHoverDark: "linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(11,17,32,0.9) 100%)",
  },

  // ── Chart palette ────────────────────────────────────────────
  chart: ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#93c5fd"] as readonly string[],

  // ── Network badge colors ─────────────────────────────────────
  network: {
    ethereumMainnet: "#343434",
    ethereumSepolia: "#64748b",
    fhenixSepolia: "#2563eb",
    arbitrumOne: "#2d374b",
    arbitrumSepolia: "#94a3b8",
    baseMainnet: "#0052FF",
    baseSepolia: "#60a5fa",
    custom: "#1e40af",
  },

  // ── Shadows ──────────────────────────────────────────────────
  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    md: "0 4px 12px rgba(0,0,0,0.06)",
    lg: "0 8px 30px rgba(0,0,0,0.08)",
    xl: "0 12px 40px rgba(0,0,0,0.12)",
    glow: (color: string) => `0 4px 20px ${color}33`,
    cardLight: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
    cardDark: "0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -1px rgba(0,0,0,0.2)",
  },

  // ── Transitions ──────────────────────────────────────────────
  transition: {
    fast: "all 0.15s ease-in-out",
    normal: "all 0.2s ease-in-out",
    smooth: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // ── Spacing / Layout ────────────────────────────────────────
  radius: {
    sm: 6,
    md: 10,
    lg: 12,
    xl: 14,
    pill: 30,
  },

  // ── Glassmorphism presets ────────────────────────────────────
  glass: {
    light: {
      background: "rgba(255, 255, 255, 0.85)",
      border: "1px solid rgba(37, 99, 235, 0.08)",
      backdropFilter: "blur(20px)",
    },
    dark: {
      background: "rgba(11, 17, 32, 0.82)",
      border: "1px solid rgba(96, 165, 250, 0.08)",
      backdropFilter: "blur(20px)",
    },
  },
} as const;

// ─── Light palette ───────────────────────────────────────────────

const lightPalette = {
  mode: "light" as const,
  primary: {
    main: "#2563eb", // Vivid blue — premium accent
    light: "#3b82f6",
    dark: "#1d4ed8",
    contrastText: "#ffffff",
  },
  secondary: {
    main: tokens.accent.emerald500,
    light: tokens.accent.emerald400,
    dark: tokens.accent.emerald600,
    contrastText: "#ffffff",
  },
  background: {
    default: "#f8fafc", // Clean slate white
    paper: "#ffffff",
  },
  text: {
    primary: "#0f172a",
    secondary: "#475569", // Slate secondary text
  },
  error: { main: tokens.danger.red500 },
  warning: { main: tokens.warning.amber500 },
  info: { main: tokens.info.blue500 },
  success: { main: tokens.accent.emerald500 },
  action: {
    hover: "rgba(37, 99, 235, 0.04)",
    selected: alpha("#2563eb", 0.06),
  },
  divider: "rgba(37, 99, 235, 0.08)",
};

// ─── Dark palette ────────────────────────────────────────────────

const darkPalette = {
  mode: "dark" as const,
  primary: {
    main: "#60a5fa", // Bright blue — vibrant on dark
    light: "#93c5fd",
    dark: "#3b82f6",
    contrastText: "#0b1120",
  },
  secondary: {
    main: tokens.accent.emerald500,
    light: tokens.accent.emerald400,
    dark: tokens.accent.emerald600,
    contrastText: "#ffffff",
  },
  background: {
    default: "#0b1120", // Deep navy dark
    paper: "#111827", // Slate 900 paper
  },
  text: {
    primary: "#f1f5f9", // Slate 100
    secondary: "#94a3b8", // Slate 400
  },
  error: { main: tokens.danger.red400 },
  warning: { main: tokens.warning.amber400 },
  info: { main: tokens.info.sky400 },
  success: { main: tokens.accent.emerald400 },
  action: {
    hover: "rgba(96, 165, 250, 0.06)",
    selected: alpha("#60a5fa", 0.08),
  },
  divider: "rgba(96, 165, 250, 0.08)",
};

// ─── Typography ──────────────────────────────────────────────────
// "Funnel Display" for headings, Inter/Roboto fallback for body.

const typography = {
  htmlFontSize: 18, // Scale down all rem-based sizes (default 16 → 18 = ~12% smaller)
  fontSize: 12.25, // Base font-size (default 14 → 12.25)
  fontFamily: ['"Funnel Display"', '"Inter"', '"Roboto"', '"Helvetica"', '"Arial"', "sans-serif"].join(","),
  h1: { fontWeight: 800, letterSpacing: "-0.025em" },
  h2: { fontWeight: 700, letterSpacing: "-0.025em" },
  h3: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.85rem" },
  h4: { fontWeight: 700, letterSpacing: "-0.015em", fontSize: "1.5rem" },
  h5: { fontWeight: 600, fontSize: "1.15rem" },
  h6: { fontWeight: 600, fontSize: "1rem" },
  subtitle1: { fontWeight: 500, fontSize: "0.9rem" },
  subtitle2: { fontWeight: 500, fontSize: "0.8rem" },
  body1: { fontSize: "0.85rem" },
  body2: { fontSize: "0.78rem" },
  caption: { fontSize: "0.68rem" },
  button: { textTransform: "none" as const, fontWeight: 600, letterSpacing: "0.01em", fontSize: "0.8rem" },
};

// ─── Component overrides (shared across modes) ──────────────────

function getComponents(mode: PaletteMode) {
  const isDark = mode === "dark";
  const glass = isDark ? tokens.glass.dark : tokens.glass.light;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        "*": {
          transition: "background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease",
        },
        body: {
          scrollbarWidth: "none" as const,
          "&::-webkit-scrollbar": { display: "none" },
          backgroundColor: isDark ? "#0b1120" : "#f8fafc",
          color: isDark ? "#f1f5f9" : "#0f172a",
        },
      },
    },

    // ── Toolbar — compact for extension popup ───────────────────
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: "48px !important",
          height: 48,
        },
      },
    },

    // ── Button ──────────────────────────────────────────────────
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.pill,
          boxShadow: "none",
          padding: "6px 16px",
          fontWeight: 600,
          transition: tokens.transition.normal,
          "&:hover": {
            boxShadow: tokens.shadow.glow("#2563eb"),
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "translateY(0)",
          },
        },
        containedPrimary: {
          background: tokens.gradient.primary,
          color: "#ffffff",
          "&:hover": {
            background: `linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)`,
            color: "#ffffff",
          },
          "&.Mui-disabled": {
            background: isDark ? "#1e293b" : "#e2e8f0",
            color: isDark ? "#475569" : "#94a3b8",
            boxShadow: "none",
          },
        },
      },
    },

    // ── Paper / Cards — glassmorphism ───────────────────────────
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backdropFilter: glass.backdropFilter,
          backgroundColor: glass.background,
          border: glass.border,
          boxShadow: isDark ? tokens.shadow.cardDark : tokens.shadow.cardLight,
          transition: tokens.transition.smooth,
        },
        elevation1: { boxShadow: isDark ? "0 4px 20px rgba(11,17,32,0.35)" : "0 4px 20px rgba(37,99,235,0.06)" },
        elevation2: { boxShadow: isDark ? "0 8px 30px rgba(11,17,32,0.4)" : "0 8px 30px rgba(37,99,235,0.09)" },
        elevation3: { boxShadow: isDark ? "0 12px 40px rgba(11,17,32,0.45)" : "0 12px 40px rgba(37,99,235,0.13)" },
      },
    },

    // ── Bottom Navigation ──────────────────────────────────────
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          backgroundColor: glass.background,
          backdropFilter: "blur(10px)",
          borderTop: isDark ? "1px solid rgba(96,165,250,0.06)" : "1px solid rgba(37,99,235,0.06)",
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: isDark ? "#475569" : "#94a3b8",
          transition: tokens.transition.fast,
          "&.Mui-selected": {
            color: isDark ? "#60a5fa" : "#2563eb",
          },
        },
      },
    },

    // ── Chip ────────────────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          fontWeight: 500,
        },
      },
    },

    // ── Dialog ──────────────────────────────────────────────────
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.radius.lg,
          backdropFilter: glass.backdropFilter,
          backgroundColor: isDark ? "rgba(17,24,39,0.95)" : "rgba(248,250,252,0.95)",
        },
      },
    },

    // ── TextField ───────────────────────────────────────────────
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: tokens.radius.md,
            transition: tokens.transition.fast,
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: isDark ? "#3b82f6" : "#2563eb",
              borderWidth: 2,
            },
          },
        },
      },
    },

    // ── Switch ──────────────────────────────────────────────────
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          "&.Mui-checked": {
            color: isDark ? "#60a5fa" : "#2563eb",
            "& + .MuiSwitch-track": {
              backgroundColor: isDark ? "#1e3a8a" : "#1d4ed8",
              opacity: 0.7,
            },
          },
        },
      },
    },

    // ── Tooltip ─────────────────────────────────────────────────
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: tokens.radius.sm,
          fontSize: "0.75rem",
          fontWeight: 500,
          backdropFilter: "blur(8px)",
          backgroundColor: isDark ? "rgba(11,17,32,0.92)" : "rgba(15,23,42,0.92)",
          color: "#f1f5f9",
        },
      },
    },

    // ── Skeleton (loading states) ───────────────────────────────
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          backgroundColor: isDark ? "rgba(96,165,250,0.06)" : "rgba(37,99,235,0.06)",
        },
      },
    },

    // ── List ────────────────────────────────────────────────────
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.md,
          transition: tokens.transition.fast,
          "&:hover": {
            backgroundColor: isDark ? "rgba(96,165,250,0.04)" : "rgba(37,99,235,0.03)",
          },
        },
      },
    },

    // ── Tab ─────────────────────────────────────────────────────
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none" as const,
          fontWeight: 600,
          minHeight: 32,
          padding: "4px 12px",
          transition: tokens.transition.fast,
        },
      },
    },
  };
}

// ─── Theme factory ───────────────────────────────────────────────

export const getTheme = (mode: PaletteMode) => {
  const palette = mode === "dark" ? darkPalette : lightPalette;

  return createTheme({
    palette,
    typography,
    shape: { borderRadius: tokens.radius.lg },
    components: getComponents(mode),
  });
};

export default getTheme;