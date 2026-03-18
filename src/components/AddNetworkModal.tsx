import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  IconButton,
  CircularProgress,
  Alert,
  Chip,
  alpha,
  useTheme,
  InputAdornment,
} from "@mui/material";
import {
  Close,
  Wifi,
  CheckCircle,
  Error as ErrorIcon,
  Language,
  Tag,
  Link as LinkIcon,
  CurrencyExchange,
  DriveFileRenameOutline,
} from "@mui/icons-material";
import { CustomNetworkConfig } from "../backend/NetworkTypes";

interface AddNetworkModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (config: CustomNetworkConfig) => void;
}

type RpcTestStatus = "idle" | "testing" | "success" | "error";

export default function AddNetworkModal({ open, onClose, onAdd }: AddNetworkModalProps) {
  const theme = useTheme();

  const [networkName, setNetworkName] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [chainId, setChainId] = useState("");
  const [currencySymbol, setCurrencySymbol] = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");

  const [rpcTestStatus, setRpcTestStatus] = useState<RpcTestStatus>("idle");
  const [rpcTestChainId, setRpcTestChainId] = useState<number | null>(null);
  const [rpcTestError, setRpcTestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const resetForm = () => {
    setNetworkName("");
    setRpcUrl("");
    setChainId("");
    setCurrencySymbol("");
    setExplorerUrl("");
    setRpcTestStatus("idle");
    setRpcTestChainId(null);
    setRpcTestError("");
    setFormError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  /** Test RPC connection by calling eth_chainId */
  const testRpcConnection = async () => {
    if (!rpcUrl.trim()) return;

    setRpcTestStatus("testing");
    setRpcTestError("");
    setRpcTestChainId(null);

    const url = rpcUrl.trim();
    const isWs = url.startsWith("ws://") || url.startsWith("wss://");

    try {
      let result: string;

      if (isWs) {
        // WebSocket RPC test — works in both extension and localhost
        result = await new Promise<string>((resolve, reject) => {
          let ws: WebSocket;
          try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
          const id = Date.now();
          const timer = setTimeout(() => { ws.close(); reject(new Error("Connection timed out")); }, 10000);
          ws.onopen = () => ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: "eth_chainId", params: [] }));
          ws.onmessage = (e) => {
            try {
              const d = JSON.parse(e.data as string) as { id?: number; result?: string; error?: { message?: string } };
              if (d.id !== id) return;
              clearTimeout(timer); ws.close();
              d.error ? reject(new Error(d.error.message)) : resolve(d.result as string);
            } catch (err) { clearTimeout(timer); ws.close(); reject(err); }
          };
          ws.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket connection failed")); };
        });
      } else {
        // HTTP/HTTPS — route through service worker in extension context
        const rpcBody = JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 });
        const isExtension =
          typeof window !== "undefined" &&
          typeof (window as any).chrome !== "undefined" &&
          !!(window as any).chrome?.runtime?.id;

        let data: { result?: string; error?: { message?: string } };
        if (isExtension) {
          const response = await new Promise<{ success: boolean; data?: { result?: string; error?: { message?: string } }; error?: string }>((resolve) => {
            (window as any).chrome.runtime.sendMessage({ type: "RPC_FETCH", url, body: rpcBody }, resolve);
          });
          if (!response?.success) throw new Error(response?.error || "Service worker fetch failed");
          data = response.data as { result?: string; error?: { message?: string } };
        } else {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: rpcBody, signal: controller.signal });
          clearTimeout(timeout);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          data = await res.json();
        }
        if (data.error) throw new Error(data.error.message || "RPC returned an error");
        if (!data.result) throw new Error("No chain ID returned from RPC");
        result = data.result;
      }

      const detectedChainId = parseInt(result, 16);
      setRpcTestChainId(detectedChainId);
      setRpcTestStatus("success");
      if (!chainId) setChainId(detectedChainId.toString());

    } catch (err) {
      setRpcTestStatus("error");
      const msg = err instanceof Error ? err.message : "Connection failed";
      if (msg.includes("abort") || msg.includes("timed out") || msg.includes("timeout")) {
        setRpcTestError("Connection timed out. The RPC may be slow or unreachable.");
      } else if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
        setRpcTestError("Could not reach the RPC URL. Check the URL and try again.");
      } else {
        setRpcTestError(msg);
      }
    }
  };

  /** Validate and submit */
  const handleSubmit = () => {
    setFormError("");

    // Validation
    if (!networkName.trim()) {
      setFormError("Network name is required.");
      return;
    }
    if (!rpcUrl.trim()) {
      setFormError("RPC URL is required.");
      return;
    }
    if (!rpcUrl.trim().startsWith("http")) {
      setFormError("RPC URL must start with http:// or https://");
      return;
    }
    if (!chainId.trim() || isNaN(Number(chainId)) || Number(chainId) <= 0) {
      setFormError("Valid Chain ID is required (positive integer).");
      return;
    }
    if (!currencySymbol.trim()) {
      setFormError("Currency symbol is required (e.g. ETH, MATIC).");
      return;
    }

    // Warn if RPC test hasn't been done — but allow skipping with a warning
    if (rpcTestStatus === "idle") {
      setFormError("Please test the RPC connection first (or enter chain ID manually if test fails).");
      return;
    }

    // Warn if detected chain ID doesn't match
    if (rpcTestStatus === "success" && rpcTestChainId && rpcTestChainId !== Number(chainId)) {
      setFormError(`Chain ID mismatch: RPC returned ${rpcTestChainId}, but you entered ${chainId}.`);
      return;
    }

    setSubmitting(true);
    try {
      const config: CustomNetworkConfig = {
        chainId: Number(chainId),
        networkName: networkName.trim(),
        rpcUrl: rpcUrl.trim(),
        explorerUrl: explorerUrl.trim() || "",
        currencySymbol: currencySymbol.trim().toUpperCase(),
      };
      onAdd(config);
      handleClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add network");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = networkName.trim() && rpcUrl.trim() && chainId.trim() && currencySymbol.trim() && rpcTestStatus !== "idle";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="add-network-title"
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: "hidden",
          backgroundImage: "none",
          bgcolor: "background.paper",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 3,
          pb: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${alpha(theme.palette.secondary.main, 0.8)})`,
          color: "white",
        }}
      >
        <Box>
          <Typography id="add-network-title" variant="h6" fontWeight={700}>
            Add Custom Network
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            Connect to any EVM-compatible network
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClose} sx={{ color: "white" }} aria-label="Close add network dialog">
          <Close />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          {/* Network Name */}
          <TextField
            label="Network Name"
            placeholder="e.g. Polygon Mainnet"
            value={networkName}
            onChange={(e) => setNetworkName(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <DriveFileRenameOutline sx={{ fontSize: 18, color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
          />

          {/* RPC URL + Test Button */}
          <Box>
            <TextField
              label="RPC URL"
              placeholder="https://polygon-rpc.com"
              value={rpcUrl}
              onChange={(e) => {
                setRpcUrl(e.target.value);
                setRpcTestStatus("idle");
              }}
              fullWidth
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={testRpcConnection}
                      disabled={!rpcUrl.trim() || rpcTestStatus === "testing"}
                      startIcon={
                        rpcTestStatus === "testing" ? (
                          <CircularProgress size={14} />
                        ) : rpcTestStatus === "success" ? (
                          <CheckCircle sx={{ fontSize: 14 }} />
                        ) : rpcTestStatus === "error" ? (
                          <ErrorIcon sx={{ fontSize: 14 }} />
                        ) : (
                          <Wifi sx={{ fontSize: 14 }} />
                        )
                      }
                      color={
                        rpcTestStatus === "success"
                          ? "success"
                          : rpcTestStatus === "error"
                            ? "error"
                            : "primary"
                      }
                      sx={{
                        textTransform: "none",
                        fontWeight: 600,
                        fontSize: 12,
                        borderRadius: 2,
                        minWidth: 70,
                      }}
                    >
                      {rpcTestStatus === "testing"
                        ? "Testing..."
                        : rpcTestStatus === "success"
                          ? "Connected"
                          : rpcTestStatus === "error"
                            ? "Retry"
                            : "Test"}
                    </Button>
                  </InputAdornment>
                ),
              }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />

            {/* RPC Test Results */}
            {rpcTestStatus === "success" && rpcTestChainId && (
              <Chip
                icon={<CheckCircle sx={{ fontSize: 14 }} />}
                label={`Connected — Chain ID: ${rpcTestChainId}`}
                color="success"
                size="small"
                variant="outlined"
                sx={{ mt: 1, fontWeight: 600, fontSize: 11 }}
              />
            )}
            {rpcTestStatus === "error" && rpcTestError && (
              <Alert severity="error" sx={{ mt: 1, borderRadius: 2, py: 0.5, fontSize: 12 }}>
                {rpcTestError}
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    If test fails due to CORS, enter the Chain ID manually and click &quot;Add Network&quot; — it will still work at runtime.
                  </Typography>
                </Box>
              </Alert>
            )}
          </Box>

          {/* Chain ID */}
          <TextField
            label="Chain ID"
            placeholder="e.g. 137"
            value={chainId}
            onChange={(e) => setChainId(e.target.value.replace(/\D/g, ""))}
            fullWidth
            size="small"
            type="text"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Tag sx={{ fontSize: 18, color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
            helperText={
              rpcTestChainId && chainId && Number(chainId) !== rpcTestChainId
                ? `⚠ RPC returned chain ID ${rpcTestChainId}`
                : undefined
            }
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
          />

          {/* Currency Symbol */}
          <TextField
            label="Currency Symbol"
            placeholder="e.g. MATIC"
            value={currencySymbol}
            onChange={(e) => setCurrencySymbol(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 10))}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CurrencyExchange sx={{ fontSize: 18, color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
          />

          {/* Explorer URL (Optional) */}
          <TextField
            label="Block Explorer URL (Optional)"
            placeholder="e.g. https://polygonscan.com"
            value={explorerUrl}
            onChange={(e) => setExplorerUrl(e.target.value)}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Language sx={{ fontSize: 18, color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
          />

          {/* Error Message */}
          {formError && (
            <Alert severity="error" sx={{ borderRadius: 2, fontSize: 13 }}>
              {formError}
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSubmit}
            disabled={!isFormValid || submitting}
            sx={{
              borderRadius: 3,
              py: 1.5,
              fontWeight: 700,
              textTransform: "none",
              fontSize: 15,
              background: isFormValid
                ? `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`
                : undefined,
              boxShadow: isFormValid ? `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}` : "none",
            }}
          >
            {submitting ? <CircularProgress size={22} color="inherit" /> : "Add Network"}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
