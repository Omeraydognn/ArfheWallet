import React, { useContext } from "react";
import {
  Box,
  Stack,
  Button,
  Typography,
  Paper,
  TextField,
  CircularProgress,
  Dialog,
  Chip,
  Fade,
} from "@mui/material";
import {
  QrCode,
  CheckCircle,
  Error as ErrorIcon,
} from "@mui/icons-material";
import { WalletContext } from "../../AppContext.js";

export default function ScanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const context = useContext(WalletContext);
  const wcService = context?.walletConnectService;
  const [uri, setUri] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "connecting" | "success" | "warning" | "error">("idle");
  const [msg, setMsg] = React.useState("");

  // Count active sessions
  const sessionCount = React.useMemo(() => {
    try { return wcService?.getActiveSessions()?.length || 0; } catch { return 0; }
  }, [open, wcService]);

  const handleConnect = async () => {
    const trimmedUri = uri.trim();
    if (!trimmedUri) return;
    setLoading(true);
    setMsg("");
    setStatus("connecting");
    try {
      await context?.walletConnectService.pair(trimmedUri);
      setMsg("Pairing initiated — approve the connection");
      setStatus("success");
      setTimeout(() => { onClose(); setUri(""); setStatus("idle"); setMsg(""); }, 1800);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg === "ALREADY_PAIRED" || errMsg.includes("Pairing already exists")) {
        setMsg("Already connected to this dApp");
        setStatus("warning");
      } else if (errMsg === "URI_EXPIRED" || errMsg.includes("Expired")) {
        setMsg("QR code expired — refresh the dApp");
        setStatus("error");
      } else if (errMsg.includes("not initialized")) {
        setMsg("Wallet initializing — try again");
        setStatus("warning");
      } else {
        setMsg("Connection failed — check the URI");
        setStatus("error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state after close animation
    setTimeout(() => { setUri(""); setStatus("idle"); setMsg(""); }, 300);
  };

  const statusColors = {
    idle: { bg: 'transparent', text: 'text.secondary' },
    connecting: { bg: 'rgba(37, 99, 235, 0.06)', text: '#2563eb' },
    success: { bg: 'rgba(34, 197, 94, 0.08)', text: '#16a34a' },
    warning: { bg: 'rgba(245, 158, 11, 0.08)', text: '#d97706' },
    error: { bg: 'rgba(239, 68, 68, 0.08)', text: '#dc2626' },
  };

  const statusIcons: Record<string, React.ReactNode> = {
    connecting: <CircularProgress size={16} sx={{ color: '#2563eb' }} />,
    success: <CheckCircle sx={{ fontSize: 18, color: '#16a34a' }} />,
    warning: <ErrorIcon sx={{ fontSize: 18, color: '#d97706' }} />,
    error: <ErrorIcon sx={{ fontSize: 18, color: '#dc2626' }} />,
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: 5,
          bgcolor: 'background.paper',
          backgroundImage: 'none',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.12)',
        }
      }}
    >
      {/* ─── Premium Header ─── */}
      <Box sx={{
        position: 'relative',
        textAlign: 'center',
        pt: 4,
        pb: 3,
        px: 3,
        background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
        overflow: 'hidden',
      }}>
        {/* Subtle grid pattern overlay */}
        <Box sx={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)',
          backgroundSize: '20px 20px',
        }} />

        {/* Glow effect */}
        <Box sx={{
          position: 'absolute',
          top: -40,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />

        {/* WC Icon with animated ring */}
        <Box sx={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 72,
          height: 72,
          borderRadius: '50%',
          mb: 2,
          background: 'linear-gradient(135deg, #3396FF 0%, #66B8FF 100%)',
          boxShadow: '0 8px 32px rgba(51, 150, 255, 0.4)',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: '2px solid rgba(51, 150, 255, 0.3)',
            animation: loading ? 'wcPulse 1.5s ease-in-out infinite' : 'none',
          },
          '@keyframes wcPulse': {
            '0%, 100%': { transform: 'scale(1)', opacity: 0.5 },
            '50%': { transform: 'scale(1.15)', opacity: 0 },
          },
        }}>
          <QrCode sx={{ fontSize: 32, color: '#fff' }} />
        </Box>

        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 800, letterSpacing: '-0.02em', position: 'relative' }}>
          WalletConnect
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 0.5, position: 'relative' }}>
          Connect to decentralized applications
        </Typography>

        {/* Active sessions badge */}
        {sessionCount > 0 && (
          <Chip
            size="small"
            label={`${sessionCount} active`}
            sx={{
              mt: 1.5,
              position: 'relative',
              bgcolor: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 24,
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          />
        )}
      </Box>

      {/* ─── Content ─── */}
      <Box sx={{ px: 3, pt: 3, pb: 1 }}>
        {/* Step indicators */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
          {[
            { num: 1, label: "Paste URI", active: status === "idle" || status === "connecting" },
            { num: 2, label: "Connecting", active: status === "connecting" },
            { num: 3, label: "Approve", active: status === "success" },
          ].map((step, i) => (
            <React.Fragment key={step.num}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  bgcolor: step.active ? '#2563eb' : 'action.hover',
                  color: step.active ? '#fff' : 'text.disabled',
                  transition: 'all 0.3s',
                }}>
                  {step.num}
                </Box>
                <Typography variant="caption" sx={{
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  color: step.active ? 'text.primary' : 'text.disabled',
                  transition: 'color 0.3s',
                }}>
                  {step.label}
                </Typography>
              </Stack>
              {i < 2 && (
                <Box sx={{
                  flex: 1,
                  height: 1,
                  bgcolor: i === 0 && (status === "connecting" || status === "success") ? '#2563eb' : 'divider',
                  transition: 'background-color 0.3s',
                }} />
              )}
            </React.Fragment>
          ))}
        </Stack>

        {/* URI Input Card */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 3,
            border: '1px solid',
            borderColor: uri ? 'primary.main' : 'divider',
            bgcolor: 'action.hover',
            transition: 'border-color 0.2s',
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'block',
            mb: 1,
            fontSize: '0.65rem',
          }}>
            Connection URI
          </Typography>
          <TextField
            autoFocus
            fullWidth
            placeholder="wc:a1b2c3d4..."
            value={uri}
            onChange={e => setUri(e.target.value)}
            multiline
            maxRows={4}
            minRows={2}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              style: {
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: '0.8rem',
                lineHeight: 1.6,
                color: uri ? 'inherit' : undefined,
              },
            }}
            disabled={loading}
          />
        </Paper>

        {/* Status Feedback */}
        {msg && (
          <Fade in>
            <Paper
              elevation={0}
              sx={{
                mt: 2,
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: statusColors[status].bg,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {statusIcons[status]}
              <Typography
                variant="caption"
                fontWeight={700}
                sx={{ color: statusColors[status].text, fontSize: '0.78rem' }}
              >
                {msg}
              </Typography>
            </Paper>
          </Fade>
        )}
      </Box>

      {/* ─── Actions ─── */}
      <Box sx={{ px: 3, pt: 1.5, pb: 3 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={handleConnect}
          disabled={loading || !uri.trim()}
          sx={{
            borderRadius: 3,
            py: 1.5,
            fontWeight: 700,
            fontSize: '0.95rem',
            textTransform: 'none',
            background: 'linear-gradient(135deg, #3396FF 0%, #1e3a5f 100%)',
            boxShadow: '0 4px 14px rgba(51, 150, 255, 0.35)',
            transition: 'all 0.2s',
            '&:hover': {
              background: 'linear-gradient(135deg, #2680E0 0%, #152a44 100%)',
              boxShadow: '0 8px 24px rgba(51, 150, 255, 0.4)',
              transform: 'translateY(-1px)',
            },
            '&.Mui-disabled': {
              background: '#e0e0e0',
              boxShadow: 'none',
            }
          }}
          endIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {loading ? "Connecting..." : "Connect"}
        </Button>

        <Button
          fullWidth
          onClick={handleClose}
          disabled={loading}
          sx={{
            mt: 1,
            borderRadius: 3,
            py: 1,
            fontWeight: 600,
            textTransform: 'none',
            color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          Cancel
        </Button>
      </Box>
    </Dialog>
  );
}
