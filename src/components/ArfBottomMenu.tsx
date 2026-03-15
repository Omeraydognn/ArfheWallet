import React from "react";
import {
  Box,
  Tabs,
  Tab,
  Stack,
} from "@mui/material";
import {
  Send as SendIcon,
  CallReceived,
  SwapVert,
} from "@mui/icons-material";
import SwapPanel from "./SwapPanel.js";
import { CustomTabPanel } from "./panels/shared.js";
import SendPanel from "./panels/SendPanel.js";
import ReceivePanel from "./panels/ReceivePanel.js";

export default function ArfBottomMenu() {
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    const handleSetTab = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab !== undefined) {
        // Map old tab indices to new ones (0=Send, 1=Receive, 2=Swap)
        const tab = detail.tab;
        if (tab <= 2) setValue(tab);
      }
      // Prefill send token if provided
      if (detail?.token) {
        window.dispatchEvent(new CustomEvent('arf-send-prefill', { detail: { token: detail.token } }));
      }
    };
    window.addEventListener('arf-menu-set-tab', handleSetTab);
    return () => window.removeEventListener('arf-menu-set-tab', handleSetTab);
  }, []);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ px: 1.5, pt: 0.5, pb: 1, height: '75vh', maxHeight: 470, overflowY: 'auto' }}>
      {/* Drawer Handle */}
      <Stack direction="row" justifyContent="center" sx={{ mb: 0.5 }}>
        <Box sx={{
          width: 36, height: 4, borderRadius: 2,
          bgcolor: 'divider',
        }} />
      </Stack>

      {/* Tabs — only Send, Receive, Swap */}
      <Tabs
        value={value}
        onChange={handleChange}
        centered
        sx={{
          minHeight: 28,
          mb: 0.25,
          '& .MuiTabs-indicator': {
            height: 2,
            borderRadius: '2px 2px 0 0',
            bgcolor: 'primary.main',
          },
          '& .MuiTab-root': {
            fontWeight: 700,
            fontSize: '0.72rem',
            minHeight: 28,
            py: 0.25,
            px: 1.5,
            textTransform: 'none',
            color: 'text.secondary',
            '&.Mui-selected': { color: 'text.primary' },
          },
        }}
      >
        <Tab icon={<SendIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="Send" />
        <Tab icon={<CallReceived sx={{ fontSize: 14 }} />} iconPosition="start" label="Receive" />
        <Tab icon={<SwapVert sx={{ fontSize: 14 }} />} iconPosition="start" label="Swap" />
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
    </Box>
  );
}
