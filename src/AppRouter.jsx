import React from "react";
import { Routes, Route } from "react-router"
import AppLayout from "./AppLayout";
import { AppContext } from "./AppContext";
import Home from "./pages/Home";
import Splash from "./pages/Splash";
import Auth from "./pages/Auth";
import History from "./pages/History";
import Privacy from "./pages/Privacy";
import Explore from "./pages/Explore";
import Revoke from "./pages/Revoke";
import GraphExplorer from "./pages/GraphExplorer";



import NetworkProvider from "./backend/NetworkProvider";
// import { WalletContext } from "./AppContext";
import { WalletProvider } from "./WalletProvider";
import './AppRouter.css';
import { ActiveAccountProvider } from "./ActiveAccountProvider";

const appContext = new AppContext();

function AppRouter() {
  return (
    <WalletProvider>
      <ActiveAccountProvider>  
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="auth" element={<Auth />} />

          <Route element={<AppLayout />}>
            <Route path="home" element={<Home />} />
            <Route path="history" element={<History />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="explore" element={<Explore />} />
            <Route path="revoke" element={<Revoke />} />
            <Route path="graphexplorer" element={<GraphExplorer />} />

          </Route>        

        </Routes>
      </ActiveAccountProvider>
    </WalletProvider>
  );
};

export default AppRouter;


