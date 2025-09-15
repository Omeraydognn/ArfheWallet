import React, { useState } from 'react';
import { Container, Paper, Typography, Box, Button, List, ListItem, ListItemText } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { styled } from '@mui/system';
import clsx from 'clsx';

// Styled Button components for each privacy level
const PrivacyButton = styled(Button)(({ theme, color, selected }) => ({
  flex: 1,
  padding: '12px',
  borderRadius: '12px',
  fontWeight: 'bold',
  textTransform: 'none',
  boxShadow: selected ? `0 4px 6px rgba(0, 0, 0, 0.1)` : 'none',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: `0 6px 8px rgba(0, 0, 0, 0.15)`,
  },
  ...(color === 'red' && {
    backgroundColor: selected ? '#EF4444' : '#FEE2E2',
    color: selected ? '#FFFFFF' : '#EF4444',
  }),
  ...(color === 'orange' && {
    backgroundColor: selected ? '#F97316' : '#FFEDD5',
    color: selected ? '#FFFFFF' : '#F97316',
  }),
  ...(color === 'green' && {
    backgroundColor: selected ? '#22C55E' : '#DCFCE7',
    color: selected ? '#FFFFFF' : '#22C55E',
  }),
}));

const TransactionItem = styled(ListItem)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: '12px',
  marginBottom: '8px',
  backgroundColor: '#FFFFFF',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  transition: 'all 0.3s ease',
  '&:hover': {
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
  },
}));

const FHEPrivacyPanel = () => {
  const [privacySetting, setPrivacySetting] = useState('full');
  const [history, setHistory] = useState([
    { id: 1, action: 'İşlem: 0x00000000000000000000000000000000', encrypted: true },
    { id: 2, action: 'İşlem: 0x00000000000000000000000000000000', encrypted: true },
    { id: 3, action: 'İşlem: 0x00000000000000000000000000000000', encrypted: true },
    { id: 4, action: 'İşlem: 0x00000000000000000000000000000000', encrypted: true },
    { id: 5, action: 'İşlem: 0x00000000000000000000000000000000', encrypted: true },
    { id: 6, action: 'İşlem: 0x00000000000000000000000000000000', encrypted: true },
  ]);

  const handleSetPrivacy = (setting) => {
    setPrivacySetting(setting);
  };

  const handleDecrypt = (id) => {
    setHistory(history.map(item =>
      item.id === id ? { ...item, encrypted: false } : item
    ));
    alert('Şifre başarıyla çözüldü!');
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col font-sans text-gray-800">
      <Container maxWidth="sm" className="py-8">
        <Paper className="p-6 md:p-8 rounded-3xl shadow-lg bg-white">
          <Box className="text-center mb-6">
            <Typography variant="body1" className="text-sm text-gray-500 mb-1">Hesap</Typography>
            <Typography variant="h6" className="font-semibold text-gray-800">biar.arf</Typography>
          </Box>

          <Box className="flex justify-center items-center mb-6">
            <Button
              variant="contained"
              className="rounded-full px-6 py-3 font-semibold normal-case shadow-lg"
              startIcon={<LockIcon />}
              sx={{ backgroundColor: '#1E40AF', '&:hover': { backgroundColor: '#1E40AF' } }}
            >
              Gizlilik Paneli
            </Button>
          </Box>

          <Box className="bg-gray-100 p-6 rounded-2xl text-center mb-8 shadow-inner">
            <Typography variant="h6" className="font-semibold text-gray-800 mb-4">
              Gizlilik Ayarı
            </Typography>
            <div className="flex justify-center space-x-4">
              <PrivacyButton
                onClick={() => handleSetPrivacy('open')}
                color="red"
                selected={privacySetting === 'open'}
              >
                Açık
              </PrivacyButton>
              <PrivacyButton
                onClick={() => handleSetPrivacy('semi-open')}
                color="orange"
                selected={privacySetting === 'semi-open'}
              >
                Yarı Açık
              </PrivacyButton>
              <PrivacyButton
                onClick={() => handleSetPrivacy('full')}
                color="green"
                selected={privacySetting === 'full'}
              >
                Gizli
              </PrivacyButton>
            </div>
          </Box>
          
          <Box className="p-6 rounded-2xl shadow-lg bg-white">
            <Typography variant="h6" className="font-semibold text-gray-800 text-center mb-4">
              İşlem Geçmişi
            </Typography>
            <List className="p-0">
              {history.map((item) => (
                <TransactionItem key={item.id}>
                  <ListItemText primary={item.action} primaryTypographyProps={{ className: 'font-mono text-sm' }} />
                  {item.encrypted ? (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => handleDecrypt(item.id)}
                      startIcon={<LockIcon />}
                      className="rounded-full normal-case text-white"
                      sx={{ backgroundColor: '#EF4444', '&:hover': { backgroundColor: '#DC2626' } }}
                    >
                      Şifreyi Çöz
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      disabled
                      startIcon={<LockOpenIcon />}
                      className="rounded-full normal-case text-gray-500 border-gray-300"
                    >
                      Çözüldü
                    </Button>
                  )}
                </TransactionItem>
              ))}
            </List>
          </Box>
        </Paper>
      </Container>
    </div>
  );
};

export default FHEPrivacyPanel;
