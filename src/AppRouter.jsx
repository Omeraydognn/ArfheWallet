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
import { ThemeProvider, CssBaseline } from "@mui/material";
import { ColorModeProvider, ColorModeContext } from "./ThemeContext";
import { getTheme } from "./components/ArfTheme";
import React, { useContext, useMemo } from "react";


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
        <Route path="home" element={<Home />} />
        {/* Nice and easy... */}
        <Route path="explore" element={<Explore />} />
        <Route path="history" element={<History />} />
        <Route path="privacy" element={<Privacy />} />

        <Route path="explore" element={<Explore />} />
        <Route path="revoke" element={<Revoke />} />
        <Route path="graphexplorer" element={<GraphExplorer />} />



        <Route path="revoke" element={<Revoke />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/security" element={<SettingsSecurity />} />
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


