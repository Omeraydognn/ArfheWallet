import { useState } from 'react';
import { Container, Paper, Typography, Box, Button, Collapse, CircularProgress } from '@mui/material';
import { ExpandMore, ExpandLess, ErrorOutline, CheckCircleOutline, WarningAmberOutlined, CancelOutlined } from '@mui/icons-material';

const mockApprovals = [
  {
    address: '0xa25g5de5g451vvvd75q5r..',
    risk: 86,
    value: '100 USDC',
    details: 'Bu adres, USDC token’larınıza sınırsız erişime sahiptir. Yüksek riskli.',
  },
  {
    address: '0xazzg5de5g451vvvd75q5r..',
    risk: 50,
    value: 'Sınırsız',
    details: 'Bu adres, belirli bir miktar için token kullanma iznine sahiptir. Orta riskli.',
  },
  {
    address: '0xaopg5de5g451vvvd75q5r..',
    risk: 0,
    value: '0 USDT',
    details: 'Bu adresin tokenlarınıza erişimi yoktur. Güvenli.',
  },
];

const getRiskColor = (risk: number) => {
  if (risk >= 80) return 'text-red-500 bg-red-100';
  if (risk >= 40) return 'text-yellow-500 bg-yellow-100';
  return 'text-green-500 bg-green-100';
};

const getRiskIcon = (risk: number) => {
  if (risk >= 80) return <ErrorOutline className="text-red-500" />;
  if (risk >= 40) return <WarningAmberOutlined className="text-yellow-500" />;
  return <CheckCircleOutline className="text-green-500" />;
};

const ApprovalCard = ({ approval }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRevoke = () => {
    setLoading(true);
    // Simulate API call to revoke permission
    setTimeout(() => {
      setLoading(false);
      // alert('İzinler başarıyla iptal edildi!');
      // Burada gerçek bir durum yönetimi (state management) yapılmalı
    }, 2000);
  };

  return (
    <Paper className="p-4 rounded-xl shadow-lg bg-white mb-4">
      <Box className="flex items-center justify-between">
        <Typography className="text-sm md:text-base font-semibold text-gray-700">
          Sözleşme Adresi: <span className="font-mono text-gray-900">{approval.address}</span>
        </Typography>
        <Box className={"flex items-center space-x-2 px-3 py-1 rounded-full"}>
          <Typography className="text-xs font-bold">
            Risk: {approval.risk}
          </Typography>
          {getRiskIcon(approval.risk)}
        </Box>
      </Box>

      <Box className="mt-2 flex items-center justify-between space-x-2">
        <Button
          variant="outlined"
          size="small"
          onClick={() => setExpanded(!expanded)}
          endIcon={expanded ? <ExpandLess /> : <ExpandMore />}
          className="rounded-full normal-case"
        >
          Detayları göster
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleRevoke}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CancelOutlined />}
          className="rounded-full normal-case"
        >
          {loading ? 'İptal Ediliyor...' : 'İzinleri iptal et'}
        </Button>
      </Box>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box className="mt-4 p-4 border border-gray-200 rounded-lg">
          <Typography variant="body2" className="font-semibold mb-1">
            İzin Verilen Değer: <span className="font-normal text-gray-700">{approval.value}</span>
          </Typography>
          <Typography variant="body2" className="font-semibold">
            Detaylar: <span className="font-normal text-gray-700">{approval.details}</span>
          </Typography>
        </Box>
      </Collapse>
    </Paper>
  );
};

const RevokePage = () => {
  return (
    <div className="bg-gray-100 min-h-screen flex flex-col font-sans text-gray-800">
      <Container maxWidth="md" className="py-8">
        <Paper className="p-6 md:p-8 rounded-xl shadow-lg bg-white">
          <Typography variant="h4" className="font-semibold text-gray-800 text-center mb-6">
            Token İzinlerini Yönet
          </Typography>
          <Typography variant="body1" className="text-center text-gray-600 mb-6">
            Hesabınızın diğer sözleşmelere verdiği tüm token onaylarını görüntüleyin ve yönetin. Yüksek riskli onayları iptal etmeniz önerilir.
          </Typography>
          
          <Box className="space-y-4">
            {mockApprovals.map((approval, index) => (
              <ApprovalCard key={index} approval={approval} />
            ))}
          </Box>
        </Paper>
      </Container>
    </div>
  );
};

export default RevokePage;
