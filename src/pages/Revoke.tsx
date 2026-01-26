import { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Collapse,
  CircularProgress,
  Chip,
  IconButton,
  Avatar
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  WarningAmberRounded,
  VerifiedUserRounded,
  GppBadRounded,
  DeleteOutline
} from '@mui/icons-material';

const mockApprovals = [
  {
    address: '0xa25...75q5r',
    name: 'Unknown Spender',
    risk: 86,
    value: 'Unlimited USDC',
    details: 'This contract has unlimited access to your USDC. High risk of drain.',
  },
  {
    address: '0xazz...5q5r',
    name: 'Uniswap Router',
    risk: 20,
    value: '500 USDT',
    details: 'Trusted DEX router with limited allowance.',
  },
  {
    address: '0xaop...5q5r',
    name: 'Aave Pool',
    risk: 5,
    value: '0 DAI',
    details: 'No active allowance detected.',
  },
];

const ApprovalCard = ({ approval }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRevoke = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 2000);
  };

  const getRiskColor = (risk) => {
    if (risk >= 80) return 'error';
    if (risk >= 40) return 'warning';
    return 'success';
  };

  const getRiskIcon = (risk) => {
    if (risk >= 80) return <GppBadRounded color="error" />;
    if (risk >= 40) return <WarningAmberRounded color="warning" />;
    return <VerifiedUserRounded color="success" />;
  };

  return (
    <Paper elevation={0} sx={{
      p: 0,
      mb: 3,
      borderRadius: 4,
      background: 'rgba(30, 30, 30, 0.4)',
      border: '1px solid rgba(255,255,255,0.05)',
      overflow: 'hidden',
      transition: 'all 0.2s',
      '&:hover': {
        borderColor: 'rgba(255,255,255,0.1)',
        background: 'rgba(30, 30, 30, 0.6)',
      }
    }}>
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'text.secondary' }}>
            {getRiskIcon(approval.risk)}
          </Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {approval.name}
            </Typography>
            <Typography variant="caption" fontFamily="monospace" color="text.secondary">
              {approval.address}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            label={`${approval.risk}/100 Risk`}
            color={getRiskColor(approval.risk)}
            size="small"
            variant="outlined"
          />
          <IconButton onClick={() => setExpanded(!expanded)} size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ px: 3, pb: 3, pt: 0 }}>
          <Box sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: 'rgba(0,0,0,0.2)',
            mb: 2,
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Allowance</Typography>
              <Typography variant="body2" fontWeight={600} color="text.primary">{approval.value}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Details</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '60%', textAlign: 'right' }}>
                {approval.details}
              </Typography>
            </Box>
          </Box>

          <Button
            fullWidth
            variant="contained"
            color="error"
            onClick={handleRevoke}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <DeleteOutline />}
            sx={{
              borderRadius: 3,
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
          >
            {loading ? 'Revoking Access...' : 'Revoke Permission'}
          </Button>
        </Box>
      </Collapse>
    </Paper>
  );
};

const RevokePage = () => {
  return (
    <Box sx={{ pb: 12 }}>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Access Control
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Review and revoke token approvals to keep your assets secure. Recurring high-risk approvals are flagged automatically.
          </Typography>
        </Box>

        <Box>
          {mockApprovals.map((approval, index) => (
            <ApprovalCard key={index} approval={approval} />
          ))}
        </Box>
      </Container>
    </Box>
  );
};

export default RevokePage;
