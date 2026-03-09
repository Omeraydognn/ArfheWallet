import * as React from "react";
import {
  AppBar,
  Box,
  Toolbar,
  Alert,
} from "@mui/material";
import { WalletContext } from "../AppContext.js";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import NotificationPanel from "./NotificationPanel.js";
import NetworkHealthIndicator from "./NetworkHealthIndicator.js";
import AccountSwitcher from "./AccountSwitcher.js";

function ArfBar({ network, setNetwork }: { network: number; setNetwork: React.Dispatch<React.SetStateAction<number>> }) {
  const wallet = React.useContext(WalletContext);
  const { activeIndex, activeAccount } = useActiveAccount();

  if (!wallet) return <Alert severity="error">AppContext is lost</Alert>;

  return (
    <Box sx={{ width: '100%', flexShrink: 0 }}>
      {/* AppBar */}
      <Box sx={{ flexGrow: 1 }}>
        <AppBar color="transparent" elevation={0} position="fixed">
          <Toolbar sx={{ justifyContent: "space-between", px: 1 }}>
            {/* Account Switcher — MetaMask-style dropdown */}
            <AccountSwitcher />

            {/* Network Health & Notifications */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <NetworkHealthIndicator />
              <NotificationPanel />
            </Box>
          </Toolbar>
        </AppBar>
      </Box>
    </Box>
  );
}

export default React.memo(ArfBar);
