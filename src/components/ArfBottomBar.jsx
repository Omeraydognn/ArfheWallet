import { useState } from "react";
import {
  BottomNavigation,
  BottomNavigationAction,
  Fab,
  Drawer,
  Box,
  Paper,
} from "@mui/material";
import { History, Home, Send, Lock, Search, GridViewRounded } from "@mui/icons-material";
import ArfBottomMenu from "./ArfBottomMenu";
import { useNavigate, useLocation } from "react-router";
import { useTheme } from "@mui/material";

// Fix for MUI passing invalid props to non-Action children
const SafeBox = ({ showLabel, onChange, value, ...props }) => <Box {...props} />;

export default function ArfBottomBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Map path to index for highlighting
  const getSubPath = (path) => {
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
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px'
        }}
      >
        <BottomNavigation
          value={getSubPath(location.pathname)}
          onChange={(event, newValue) => {
            // value is strictly controlled by path, so onChange might not be primary driver if using navigate
          }}
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
            icon={<GridViewRounded sx={{ fontSize: 28 }} />}
            onClick={() => navigate('explore')}
          />

          <SafeBox sx={{ width: 72, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Fab
              color="primary"
              onClick={() => setDrawerOpen(true)}
              sx={{
                width: 56,
                height: 56,
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.5)',
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                '&:hover': {
                  transform: 'scale(1.05)',
                  boxShadow: '0 0 30px rgba(99, 102, 241, 0.7)',
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
            label="Security"
            icon={<Lock sx={{ fontSize: 28 }} />}
            onClick={() => navigate('privacy')}
          />
        </BottomNavigation>
      </Paper>

      <Drawer
        anchor="bottom"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
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
