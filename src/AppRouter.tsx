import { Routes, Route } from "react-router"
import AppLayout from "./AppLayout";
import Home from "./pages/Home";
import Splash from "./pages/Splash";
import Auth from "./pages/Auth";
import History from "./pages/History";
import Privacy from "./pages/Privacy";
import Explore from "./pages/Explore";
import Revoke from "./pages/Revoke";
import GraphExplorer from "./pages/GraphExplorer";
import Settings from "./pages/Settings";
import SettingsSecurity from "./pages/SettingsSecurity";
import Portfolio from "./pages/Portfolio";
import { ThemeProvider, CssBaseline, Fade } from "@mui/material";
import { ColorModeProvider, ColorModeContext } from "./ThemeContext";
import { getTheme } from "./components/ArfTheme";
import React, { useContext, useMemo } from "react";

// Wrap a route element in a smooth Fade transition
function FadePage({ children }: { children: React.ReactNode }) {
  return <Fade in timeout={280}>{<div style={{ display: 'contents' }}>{children}</div>}</Fade>;
}


// import NetworkProvider from "./backend/NetworkProvider";
// import { WalletContext } from "./AppContext";
import { WalletProvider } from "./WalletProvider";
import './AppRouter.css';
import { ActiveAccountProvider } from "./ActiveAccountProvider";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="auth" element={<Auth />} />

      <Route element={<AppLayout />}>
        <Route path="home" element={<FadePage><Home /></FadePage>} />
        <Route path="portfolio" element={<FadePage><Portfolio /></FadePage>} />
        <Route path="explore" element={<FadePage><Explore /></FadePage>} />
        <Route path="history" element={<FadePage><History /></FadePage>} />
        <Route path="privacy" element={<FadePage><Privacy /></FadePage>} />
        <Route path="revoke" element={<FadePage><Revoke /></FadePage>} />
        <Route path="graphexplorer" element={<FadePage><GraphExplorer /></FadePage>} />
        <Route path="settings" element={<FadePage><Settings /></FadePage>} />
        <Route path="settings/security" element={<FadePage><SettingsSecurity /></FadePage>} />
      </Route>

    </Routes>
  );
}

function ThemedApp() {
  const { mode } = useContext(ColorModeContext);
  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <WalletProvider>
        <AppRoutes />
      </WalletProvider>
    </ThemeProvider>
  );
}

function AppRouter() {
  return (
    <ColorModeProvider>
      <ThemedApp />
    </ColorModeProvider>
  );
};

export default AppRouter;


