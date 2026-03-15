import * as React from "react";
import {
  AppBar,
  Box,
  Toolbar,
  Alert,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  CameraAlt,
  QrCode,
} from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import NotificationPanel from "./NotificationPanel.js";
import NetworkHealthIndicator from "./NetworkHealthIndicator.js";
import AccountSwitcher from "./AccountSwitcher.js";
import QrScannerModal, { QrScanResult } from "./QrScannerModal.js";
import ScanDialog from "./panels/ScanDialog.js";

function ArfBar({ network, setNetwork }: { network: number; setNetwork: React.Dispatch<React.SetStateAction<number>> }) {
  const wallet = React.useContext(WalletContext);
  const { activeIndex, activeAccount } = useActiveAccount();
  const [qrScannerOpen, setQrScannerOpen] = React.useState(false);
  const [scanOpen, setScanOpen] = React.useState(false);

  if (!wallet) return <Alert severity="error">AppContext is lost</Alert>;

  return (
    <Box sx={{ width: '100%', flexShrink: 0 }}>
      {/* AppBar */}
      <Box sx={{ flexGrow: 1 }}>
        <AppBar color="transparent" elevation={0} position="fixed">
          <Toolbar sx={{ justifyContent: "space-between", px: 1 }}>
            {/* Account Switcher — MetaMask-style dropdown */}
            <AccountSwitcher />

            {/* Scan, WC, Network Health & Notifications */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
              <Tooltip title="Scan QR" arrow>
                <IconButton
                  size="small"
                  onClick={() => setQrScannerOpen(true)}
                  aria-label="Scan QR code"
                  sx={{ color: 'text.secondary', p: 0.5 }}
                >
                  <CameraAlt sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="WalletConnect" arrow>
                <IconButton
                  size="small"
                  onClick={() => setScanOpen(true)}
                  aria-label="WalletConnect"
                  sx={{ color: 'text.secondary', p: 0.5 }}
                >
                  <QrCode sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <NetworkHealthIndicator />
              <NotificationPanel />
            </Box>
          </Toolbar>
        </AppBar>
      </Box>

      {/* QR Scanner Modal */}
      <QrScannerModal
        open={qrScannerOpen}
        onClose={() => setQrScannerOpen(false)}
        onResult={(result: QrScanResult) => {
          if (result.type === "walletconnect" && result.wcUri) {
            setQrScannerOpen(false);
            setScanOpen(true);
          } else if (result.type === "address" || result.type === "eip681") {
            setQrScannerOpen(false);
            // Open send menu and fill address
            window.dispatchEvent(new CustomEvent('open-arf-menu', { detail: { tab: 0 } }));
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("arf-qr-address", { detail: { address: result.address, amount: result.amount } }));
            }, 200);
          }
        }}
      />

      {/* WalletConnect Scan Dialog */}
      <ScanDialog open={scanOpen} onClose={() => setScanOpen(false)} />
    </Box>
  );
}

export default React.memo(ArfBar);
