import { Routes, Route } from "react-router"
import AppLayout from "./AppLayout";
import Splash from "./pages/Splash";
import Auth from "./pages/Auth";
import { ThemeProvider, CssBaseline, Fade } from "@mui/material";
import { ColorModeProvider, ColorModeContext } from "./ThemeContext";
import { getTheme } from "./components/ArfTheme";
import React, { useContext, useMemo, Suspense } from "react";
import { PageSkeleton } from "./components/SkeletonLoaders";

// Lazy-loaded pages — only downloaded when navigated to
const Home = React.lazy(() => import("./pages/Home"));
const Portfolio = React.lazy(() => import("./pages/Portfolio"));
const Explore = React.lazy(() => import("./pages/Explore"));
const History = React.lazy(() => import("./pages/History"));
const Privacy = React.lazy(() => import("./pages/Privacy"));
const Revoke = React.lazy(() => import("./pages/Revoke"));
const GraphExplorer = React.lazy(() => import("./pages/GraphExplorer"));
const Settings = React.lazy(() => import("./pages/Settings"));
const SettingsSecurity = React.lazy(() => import("./pages/SettingsSecurity"));
const TokenDetail = React.lazy(() => import("./pages/TokenDetail"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const IkaDashboard = React.lazy(() => import("./pages/IkaDashboard"));

// Wrap a route element in a smooth Fade transition
const FadePage = React.memo(function FadePage({ children }: { children: React.ReactNode }) {
  return <Fade in timeout={280}>{<div style={{ display: 'contents' }}>{children}</div>}</Fade>;
});


import { WalletProvider } from "./WalletProvider";
import { ActiveAccountProvider } from "./ActiveAccountProvider";

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
          <Route path="token/:address" element={<FadePage><TokenDetail /></FadePage>} />
          <Route path="ika" element={<FadePage><IkaDashboard /></FadePage>} />
          <Route path="*" element={<FadePage><NotFound /></FadePage>} />
        </Route>

      </Routes>
    </Suspense>
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


