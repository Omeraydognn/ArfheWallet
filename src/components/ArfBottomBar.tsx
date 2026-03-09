import React, { useState, useEffect } from "react";
import {
  BottomNavigation,
  BottomNavigationAction,
  Fab,
  Drawer,
  Box,
  Paper,
} from "@mui/material";
import type { BoxProps } from "@mui/material";
import { History, Home, Send, Hub, Explore } from "@mui/icons-material";
import ArfBottomMenu from "./ArfBottomMenu";
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

  useEffect(() => {
    const handleOpen = (e: Event) => {
      setDrawerOpen(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('arf-menu-set-tab', { detail: (e as CustomEvent).detail }));
      }, 100);
    };
    window.addEventListener('open-arf-menu', handleOpen);
    return () => window.removeEventListener('open-arf-menu', handleOpen);
  }, []);

  // Map path to index for highlighting
  const getSubPath = (path: string): number => {
    switch (path) {
      case '/home': return 0;
      case '/explore': return 1;
      case '/history': return 3;
      case '/GraphExplorer': return 4;
      default: return 0;
    }
  };

  return (
    <Box sx={{
      position: 'fixed',
      bottom: 24,
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
            height: 64,
            minWidth: 320
          }}
        >
          <BottomNavigationAction
            label="Home"
            icon={<Home sx={{ fontSize: 28 }} />}
            onClick={() => navigate('home')}
          />
          <BottomNavigationAction
            label="Explore"
            icon={<Explore sx={{ fontSize: 28 }} />}
            onClick={() => navigate('explore')}
          />

          <SafeBox sx={{ width: 72, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Fab
              color="primary"
              aria-label="Send transaction"
              onClick={() => setDrawerOpen(true)}
              sx={{
                width: 56,
                height: 56,
                boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)',
                background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                '&:hover': {
                  transform: 'scale(1.05)',
                  boxShadow: '0 0 30px rgba(37, 99, 235, 0.6)',
                },
              }}>
              <Send sx={{ fontSize: 28 }} />
            </Fab>
          </SafeBox>

          <BottomNavigationAction
            label="History"
            icon={<History sx={{ fontSize: 28 }} />}
            onClick={() => navigate('history')}
          />
          <BottomNavigationAction
            label="Graph"
            icon={<Hub sx={{ fontSize: 28 }} />}
            onClick={() => navigate('GraphExplorer')}
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
    </Box>
  );
}

export default React.memo(ArfBottomBar);
