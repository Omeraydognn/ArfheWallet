import React from "react";
import {
  Box,
  Tabs,
  Tab,
  Stack,
  Button,
} from "@mui/material";
import {
  Send as SendIcon,
  QrCode,
  Shield,
  CallReceived,
  SwapVert,
  ShoppingCart,
  CameraAlt,
} from "@mui/icons-material";
import SwapPanel from "./SwapPanel.js";
import BuyPanel from "./BuyPanel.js";
import QrScannerModal, { QrScanResult } from "./QrScannerModal.js";
import { CustomTabPanel } from "./panels/shared.js";
import SendPanel from "./panels/SendPanel.js";
import ReceivePanel from "./panels/ReceivePanel.js";
import ShieldPanel from "./panels/ShieldPanel.js";
import ScanDialog from "./panels/ScanDialog.js";
import { useNetwork } from "../hooks/index.js";
import { isFheNetwork } from "../backend/NetworkTypes.js";

export default function ArfBottomMenu() {
  const { networkId } = useNetwork();
  const showFhe = isFheNetwork(networkId);
  const [value, setValue] = React.useState(0);
  const [scanOpen, setScanOpen] = React.useState(false);
  const [qrScannerOpen, setQrScannerOpen] = React.useState(false);

  // If Shield tab (index 4) is active and we switch to a non-FHE network, reset to Send
  React.useEffect(() => {
    if (!showFhe && value === 4) setValue(0);
  }, [showFhe]);

  React.useEffect(() => {
    const handleSetTab = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab !== undefined) {
        setValue(detail.tab);
      }
      // Prefill send token if provided
      if (detail?.token) {
        window.dispatchEvent(new CustomEvent('arf-send-prefill', { detail: { token: detail.token } }));
      }
    };
    window.addEventListener('arf-menu-set-tab', handleSetTab);
    return () => window.removeEventListener('arf-menu-set-tab', handleSetTab);
  }, []);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ px: 2.5, pt: 1.5, pb: 4, height: '80vh' }}>
      {/* Drawer Handle */}
      <Stack direction="row" justifyContent="center" alignItems="center" sx={{ position: 'relative', mb: 1.5 }}>
        <Box sx={{
          width: 36, height: 4, borderRadius: 2,
          bgcolor: 'divider',
        }} />
        <Box sx={{ position: 'absolute', right: 0 }}>
          <Stack direction="row" spacing={0.5}>
            <Button
              size="small"
              startIcon={<CameraAlt sx={{ fontSize: 16 }} />}
              onClick={() => setQrScannerOpen(true)}
              sx={{
                fontSize: '0.7rem',
                color: 'text.secondary',
                fontWeight: 600,
                minWidth: 'auto',
                '&:hover': { color: 'primary.main' }
              }}
            >
              Scan
            </Button>
            <Button
              size="small"
              startIcon={<QrCode sx={{ fontSize: 16 }} />}
              onClick={() => setScanOpen(true)}
              sx={{
                fontSize: '0.7rem',
                color: 'text.secondary',
                fontWeight: 600,
                minWidth: 'auto',
                '&:hover': { color: 'primary.main' }
              }}
            >
              WC
            </Button>
          </Stack>
        </Box>
      </Stack>

      {/* Tabs */}
      <Tabs
        value={value}
        onChange={handleChange}
        centered
        sx={{
          minHeight: 40,
          '& .MuiTabs-indicator': {
            height: 2.5,
            borderRadius: '3px 3px 0 0',
            bgcolor: 'primary.main',
          },
          '& .MuiTab-root': {
            fontWeight: 700,
            fontSize: '0.85rem',
            minHeight: 40,
            py: 1,
            textTransform: 'none',
            color: 'text.secondary',
            '&.Mui-selected': { color: 'text.primary' },
          },
        }}
      >
        <Tab icon={<SendIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Send" />
        <Tab icon={<CallReceived sx={{ fontSize: 16 }} />} iconPosition="start" label="Receive" />
        <Tab icon={<SwapVert sx={{ fontSize: 16 }} />} iconPosition="start" label="Swap" />
        <Tab icon={<ShoppingCart sx={{ fontSize: 16 }} />} iconPosition="start" label="Buy" />
        {showFhe && <Tab icon={<Shield sx={{ fontSize: 16 }} />} iconPosition="start" label="Shield" />}
      </Tabs>

      <CustomTabPanel value={value} index={0}>
        <SendPanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={1}>
        <ReceivePanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={2}>
        <SwapPanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={3}>
        <BuyPanel />
      </CustomTabPanel>
      {showFhe && (
        <CustomTabPanel value={value} index={4}>
          <ShieldPanel />
        </CustomTabPanel>
      )}

      <ScanDialog open={scanOpen} onClose={() => setScanOpen(false)} />
      <QrScannerModal
        open={qrScannerOpen}
        onClose={() => setQrScannerOpen(false)}
        onResult={(result: QrScanResult) => {
          if (result.type === "walletconnect" && result.wcUri) {
            // Open WalletConnect scan dialog and paste URI
            setQrScannerOpen(false);
            setScanOpen(true);
          } else if (result.type === "address" || result.type === "eip681") {
            // Switch to Send tab and fill address
            setQrScannerOpen(false);
            setValue(0); // Send tab
            window.dispatchEvent(new CustomEvent("arf-qr-address", { detail: { address: result.address, amount: result.amount } }));
          }
        }}
      />
    </Box>
  );
}
