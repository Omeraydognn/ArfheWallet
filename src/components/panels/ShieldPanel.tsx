import React, { useContext, useState } from "react";
import {
  Box,
  Select,
  MenuItem,
  Stack,
  Button,
  Typography,
  Paper,
  TextField,
  CircularProgress,
  Link,
  Chip,
  Fade,
} from "@mui/material";
import {
  Shield,
  LockOutlined,
  LockOpen,
  ArrowForward,
  OpenInNew,
} from "@mui/icons-material";
import { WalletContext } from "../../AppContext.js";
import FheEncryptingOverlay from "../FheEncryptingOverlay.js";
import { getContractsForNetwork, getExplorerBaseForNetwork, inputCardSx, ctaButtonSx } from "./shared.js";

// --- Shield Panel (Privacy) ---
export default function ShieldPanel() {
  const context = useContext(WalletContext);
  const network = context?.networkProvider?.getActiveNetwork();
  const activeAccount = context?.accountManager?.GetActive();

  const [mode, setMode] = useState<"shield" | "unshield">("shield");
  const [token, setToken] = useState<"USDC" | "ETH">("ETH");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [pendingClaim, setPendingClaim] = useState(false);

  const handleAction = async () => {
    if (!network || !activeAccount) return;

    setLoading(true);
    setStatus("Processing... Please sign in wallet.");
    setTxHash("");

    try {
      const activeContracts = getContractsForNetwork(network.network_id);
      const config = activeContracts[token as keyof typeof activeContracts];
      if (!config) throw new Error("Invalid Token Config");

      if (config.shielded === "0x0000000000000000000000000000000000000000") {
        throw new Error(`${token} wrapping not yet deployed`);
      }

      let hash = "";

      if (mode === "shield") {

        if (token === "ETH") {
          setStatus("Wrapping ETH to cETH...");
          hash = await network.wrapETH(activeAccount, config.shielded, amount);
        } else {
          hash = await network.wrap(activeAccount, config.public, config.shielded, amount);
        }

        setTxHash(hash);
        setStatus("Confirming transaction...");
        await network.waitForTransaction(hash);

        setStatus("Shield successful");
        setLoading(false);

        setTimeout(() => {
          setAmount("");
          setStatus("");
          setTxHash("");
        }, 3000);

      } else {

        setStatus("Unwrapping tokens...");
        hash = await network.unwrap(activeAccount, config.shielded, amount);

        setTxHash(hash);
        setStatus("Confirming transaction...");
        await network.waitForTransaction(hash);

        setStatus("Unshield successful");
        setLoading(false);

        setTimeout(() => {
          setAmount("");
          setStatus("");
          setTxHash("");
        }, 3000);
      }

    } catch (e) {
      setStatus("Failed: " + (e instanceof Error ? e.message : String(e)));
      setPendingClaim(false);
      setLoading(false);
    }
  };

  return (
    <Box sx={{ position: 'relative' }}>
      {/* FHE Overlay — fullscreen during wrap/unwrap */}
      <FheEncryptingOverlay
        visible={loading}
        message={
          mode === "shield"
            ? (status.includes("Confirming")
              ? `Waiting for on-chain confirmation of your ${token} shield...`
              : `Wrapping & encrypting ${token} using Fully Homomorphic Encryption.`)
            : (status.includes("Confirming")
              ? `Waiting for on-chain confirmation of your ${token} unshield...`
              : status.includes("decryption")
                ? `Requesting FHE decryption key from the network...`
                : `Unwrapping ${token} from the FHE vault`)
        }
      />

      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Shield sx={{ fontSize: 20, color: 'secondary.main' }} />
        <Typography variant="subtitle1" fontWeight={700}>
          Privacy Shield
        </Typography>
        <Chip label="FHE" size="small" color="secondary" variant="outlined"
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {mode === "shield"
          ? "Encrypt your tokens for confidential transfers on-chain."
          : "Decrypt your tokens back to standard ERC-20 format."
        }
      </Typography>

      {/* Mode Toggle */}
      <Paper elevation={0} sx={{
        display: 'flex',
        borderRadius: 2.5,
        p: 0.5,
        bgcolor: 'action.hover',
        mb: 1.5
      }}>
        <Button
          fullWidth
          size="small"
          variant={mode === "shield" ? "contained" : "text"}
          color={mode === "shield" ? "secondary" : "inherit"}
          onClick={() => setMode("shield")}
          startIcon={<LockOutlined sx={{ fontSize: 16 }} />}
          sx={{
            borderRadius: 2,
            py: 1,
            fontWeight: 600,
            fontSize: '0.8rem',
            boxShadow: mode === "shield" ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
          }}
        >
          Shield
        </Button>
        <Button
          fullWidth
          size="small"
          variant={mode === "unshield" ? "contained" : "text"}
          color={mode === "unshield" ? "warning" : "inherit"}
          onClick={() => setMode("unshield")}
          startIcon={<LockOpen sx={{ fontSize: 16 }} />}
          sx={{
            borderRadius: 2,
            py: 1,
            fontWeight: 600,
            fontSize: '0.8rem',
            boxShadow: mode === "unshield" ? '0 2px 8px rgba(245, 158, 11, 0.3)' : 'none',
          }}
        >
          Unshield
        </Button>
      </Paper>

      {/* Amount Input Card */}
      <Paper elevation={0} sx={inputCardSx}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {mode === "shield" ? "Amount to Shield" : "Amount to Unshield"}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            variant="standard"
            placeholder="0.00"
            fullWidth
            value={amount}
            onChange={e => setAmount(e.target.value)}
            InputProps={{
              disableUnderline: true,
              style: { fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }
            }}
            disabled={loading}
          />
          <Select
            value={token}
            onChange={e => setToken(e.target.value as "ETH" | "USDC")}
            variant="standard"
            disableUnderline
            disabled={loading}
            sx={{
              fontWeight: 700,
              fontSize: '0.9rem',
              bgcolor: 'background.paper',
              borderRadius: 2,
              px: 1.5,
              py: 0.5,
              minWidth: 80,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <MenuItem value="ETH">ETH</MenuItem>
            <MenuItem value="USDC">USDC</MenuItem>
          </Select>
        </Stack>
      </Paper>

      {/* Status Feedback */}
      {status && (
        <Fade in>
          <Paper elevation={0} sx={{
            mt: 1.5,
            p: 1.5,
            borderRadius: 2.5,
            bgcolor: status.includes("Failed") ? 'error.main' : status.includes("successful") ? 'success.main' : 'primary.main',
            color: '#fff',
          }}>
            <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
              {status}
            </Typography>
            {txHash && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', opacity: 0.9 }}>
                  {txHash.slice(0, 10)}...{txHash.slice(-6)}
                </Typography>
                <Link
                  href={`${getExplorerBaseForNetwork(network?.network_id)}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener"
                  sx={{ color: '#fff', display: 'flex', alignItems: 'center' }}
                >
                  <OpenInNew sx={{ fontSize: 14 }} />
                </Link>
              </Stack>
            )}
          </Paper>
        </Fade>
      )}

      {/* CTA Button */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleAction}
        disabled={loading || !amount}
        color={mode === "shield" ? "secondary" : "warning"}
        sx={{
          ...ctaButtonSx,
          mt: 2,
          boxShadow: mode === "shield"
            ? '0 4px 14px rgba(16, 185, 129, 0.3)'
            : '0 4px 14px rgba(245, 158, 11, 0.3)',
        }}
        endIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
      >
        {loading
          ? (pendingClaim
            ? "Waiting for decryption..."
            : (status.includes("Confirming")
              ? "Confirming..."
              : "Processing..."))
          : (mode === "shield" ? "Shield Assets" : "Unshield Assets")
        }
      </Button>
    </Box>
  );
}
