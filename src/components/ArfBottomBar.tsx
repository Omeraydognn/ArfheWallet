import React, { useState, useEffect } from "react";
import {
  BottomNavigation,
  BottomNavigationAction,
  Fab,
  Drawer,
  Box,
  Paper,
  Stack,
} from "@mui/material";
import type { BoxProps } from "@mui/material";
import { History, Home, Send, Lock, Explore } from "@mui/icons-material";
import ArfBottomMenu from "./ArfBottomMenu";
import ShieldPanel from "./panels/ShieldPanel.js";
import { useNavigate, useLocation } from "react-router";
import { useTheme } from "@mui/material";

/** Fix for MUI passing invalid props to non-Action children */
interface SafeBoxProps extends Omit<BoxProps, 'onChange'> {
  showLabel?: boolean;
  onChange?: (() => void) | null;
  value?: unknown;
}
const SafeBox = ({ showLabel: _sl, onChange: _oc, value: _v, ...props }: SafeBoxProps) => <Box {...props} />;

function ArfBottomBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shieldDrawerOpen, setShieldDrawerOpen] = useState(false);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      setDrawerOpen(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('arf-menu-set-tab', { detail: (e as CustomEvent).detail }));
      }, 100);
    };
    const handleShieldOpen = () => {
      setDrawerOpen(false); // Close send menu first
      setTimeout(() => setShieldDrawerOpen(true), 200);
    };
    const handleReturnToSend = () => {
      setShieldDrawerOpen(false);
      setTimeout(() => setDrawerOpen(true), 200);
    };
    window.addEventListener('open-arf-menu', handleOpen);
    window.addEventListener('open-shield-panel', handleShieldOpen);
    window.addEventListener('return-to-send-menu', handleReturnToSend);
    return () => {
      window.removeEventListener('open-arf-menu', handleOpen);
      window.removeEventListener('open-shield-panel', handleShieldOpen);
      window.removeEventListener('return-to-send-menu', handleReturnToSend);
    };
  }, []);

  // Map path to index for highlighting
  const getSubPath = (path: string): number => {
    switch (path) {
      case '/home': return 0;
      case '/explore': return 1;
      case '/history': return 3;
      case '/privacy': return 4;
      default: return 0;
    }
  };

  return (
    <Box sx={{
      position: 'fixed',
      bottom: 12,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      zIndex: 1000,
      pointerEvents: 'none' // Allow clicking through empty space
    }}>
      <Paper
        elevation={4}
        sx={{
          borderRadius: '24px',
          overflow: 'hidden',
          pointerEvents: 'auto', // Re-enable clicks
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid',
          borderColor: theme.palette.mode === 'dark' ? 'rgba(96, 165, 250, 0.06)' : 'rgba(37, 99, 235, 0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px'
        }}
      >
        <BottomNavigation
          value={getSubPath(location.pathname)}
          onChange={() => {
            // value is strictly controlled by path, so onChange might not be primary driver if using navigate
          }}
          showLabels
          sx={{
            backgroundColor: 'transparent',
            height: 52,
            minWidth: 300,
            '& .MuiBottomNavigationAction-root': { minWidth: 'auto', padding: '4px 0' },
            '& .MuiBottomNavigationAction-label': { fontSize: '0.65rem' },
          }}
        >
          <BottomNavigationAction
            label="Home"
            icon={<Home sx={{ fontSize: 22 }} />}
            onClick={() => navigate('home')}
          />
          <BottomNavigationAction
            label="Explore"
            icon={<Explore sx={{ fontSize: 22 }} />}
            onClick={() => navigate('explore')}
          />

          <SafeBox sx={{ width: 56, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Fab
              color="primary"
              aria-label="Send transaction"
              onClick={() => setDrawerOpen(true)}
              sx={{
                width: 44,
                height: 44,
                boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)',
                background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                '&:hover': {
                  transform: 'scale(1.05)',
                  boxShadow: '0 0 30px rgba(37, 99, 235, 0.6)',
                },
              }}>
              <Send sx={{ fontSize: 22 }} />
            </Fab>
          </SafeBox>

          <BottomNavigationAction
            label="History"
            icon={<History sx={{ fontSize: 22 }} />}
            onClick={() => navigate('history')}
          />
          <BottomNavigationAction
            label="Privacy"
            icon={<Lock sx={{ fontSize: 22 }} />}
            onClick={() => navigate('privacy')}
          />
        </BottomNavigation>
      </Paper>

      <Drawer
        anchor="bottom"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        aria-label="Send transaction menu"
        PaperProps={{
          sx: {
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            maxWidth: '600px',
            mx: 'auto'
          }
        }}
      >
        <ArfBottomMenu />
      </Drawer>

      {/* Shield Panel Drawer */}
      <Drawer
        anchor="bottom"
        open={shieldDrawerOpen}
        onClose={() => setShieldDrawerOpen(false)}
        aria-label="Shield panel"
        PaperProps={{
          sx: {
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            maxWidth: '600px',
            mx: 'auto',
            maxHeight: '80vh',
            overflowY: 'auto',
          }
        }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 2 }}>
          <Stack direction="row" justifyContent="center" sx={{ mb: 1 }}>
            <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
          </Stack>
          <ShieldPanel />
        </Box>
      </Drawer>
    </Box>
  );
}

export default React.memo(ArfBottomBar);
