import React from 'react';
import { Outlet } from 'react-router';
import ArfBottomBar from './components/ArfBottomBar';
import ArfBar from './components/ArfBar';
import { Box } from '@mui/material';
import { ActiveAccountProvider } from './ActiveAccountProvider';

const AppLayout: React.FC = () => {
  const [network, setNetwork] = React.useState(1);

  return (
    <Box sx={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ActiveAccountProvider>
        {/* Accessibility: skip link for keyboard users */}
        <a href="#main-content" className="skip-to-content">Skip to content</a>

        <Box component="header" sx={{ flexShrink: 0 }}>
          <ArfBar network={network} setNetwork={setNetwork} />
        </Box>

        <Box component="main" id="main-content" tabIndex={-1} sx={{ flex: 1, mt: '5rem', mb: '5rem', overflowY: 'auto', minHeight: 0 }}>
          <Outlet />
        </Box>

        <Box component="nav" aria-label="Main navigation" sx={{ flexShrink: 0 }}>
          <ArfBottomBar />
        </Box>
      </ActiveAccountProvider>
    </Box>
  );
}

export default AppLayout;
