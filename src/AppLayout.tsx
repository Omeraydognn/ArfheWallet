import React from 'react';
import { Outlet } from 'react-router';
import ArfBottomBar from './components/ArfBottomBar';
import ArfBar from './components/ArfBar';
import './AppLayout.css';
import { Box } from '@mui/material';
import { ActiveAccountProvider } from './ActiveAccountProvider';

const AppLayout: React.FC = () => {
  const [network, setNetwork] = React.useState(1);

  return (
    <div className='app-layout'>
      <ActiveAccountProvider>
        <Box sx={{ flexShrink: 0 }}>
          <ArfBar network={network} setNetwork={setNetwork} />
        </Box>

        <Box className="content-box">
          <Outlet />
        </Box>

        <Box sx={{ flexShrink: 0 }}>
          <ArfBottomBar />
        </Box>
      </ActiveAccountProvider>
    </div>
  );
}

export default AppLayout;
