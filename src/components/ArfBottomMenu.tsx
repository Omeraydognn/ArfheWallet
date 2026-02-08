import React, { useContext, useState } from "react";
import {
  Box,
  FormControl,
  Tabs,
  Tab,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  Stack,
  Button,
  Typography,
  Paper,
  InputAdornment,
  CircularProgress,
  Alert,
  Snackbar,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@mui/material";
import { WalletContext } from "../AppContext.js";
import { SwapHoriz, Send, QrCode, ContentCopy, CheckCircle, Shield, Error as ErrorIcon } from "@mui/icons-material";
import { isAddress, parseUnits, Interface, formatEther, getAddress } from "ethers";

// --- Tab Panel Wrapper ---
function CustomTabPanel(props: { children: React.ReactNode; index: number; value: number }) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other} style={{ width: '100%' }}>
      {value === index && <Box sx={{ p: 0, pt: 3 }}>{children}</Box>}
    </div>
  );
}

// Demo Configuration
// ArfheWallet - Wrapped Token Addresses
const CONTRACTS = {
  "USDC": {
    public: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"), // Sepolia USDC
    shielded: getAddress((import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS || "0x730Bb4ee9EA1cdB0B45C1DB01cA67a616D2D3C88") // cUSDC
  },
  "ETH": {
    public: getAddress((import.meta as any).env.VITE_SEPOLIA_WETH_ADDRESS || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"), // Sepolia WETH
    shielded: getAddress((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "0x17CecF8090B945932e2F592168B636F7A0c986e8") // cETH
  },
  "LINK": {
    public: getAddress("0x779877A7B0D9E8603169DdbD7836e478b4624789"), // Sepolia LINK
    shielded: getAddress("0x0000000000000000000000000000000000000000") // NOT SUPPORTED YET
  }
};

// --- Shield Panel (Privacy) ---
function ShieldPanel() {
  const context = useContext(WalletContext);
  const network = context?.networkProvider?.getActiveNetwork();
  const activeAccount = context?.accountManager?.GetActive();

  const [mode, setMode] = useState<"shield" | "unshield">("shield");
  const [token, setToken] = useState<"USDC" | "ETH">("ETH");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [pendingClaim, setPendingClaim] = useState(false); // For unwrap step 2

  const handleAction = async () => {
    if (!network || !activeAccount) return;
    
    setLoading(true);
    setStatus("Processing... Please sign in wallet.");
    setTxHash("");

    try {
      // @ts-ignore
      const config = CONTRACTS[token];
      if (!config) throw new Error("Invalid Token Config");
      
      // Check if wrapper exists
      if (config.shielded === "0x0000000000000000000000000000000000000000") {
        throw new Error(`${token} wrapping not yet deployed`);
      }

      let hash = "";

      if (mode === "shield") {
        console.log("[Wrap] Wrapping", token, "Amount:", amount);
        console.log("[Wrap] Public token:", config.public);
        console.log("[Wrap] Wrapper contract:", config.shielded);
        
        // ETH: Use direct wrapETH() for V2 contract
        if (token === "ETH") {
          setStatus("Wrapping ETH → cETH...");
          hash = await network.wrapETH(activeAccount, config.shielded, amount);
        } else {
          // USDC: Use standard wrap (requires approval)
          hash = await network.wrap(activeAccount, config.public, config.shielded, amount);
        }
        
        setTxHash(hash);
        setStatus("Pending Confirmation... (Waiting for block)");
        await network.waitForTransaction(hash);
        
        setStatus("✅ Shield (Wrap) Successful!");
        setLoading(false);
        
        // Reset form
        setTimeout(() => {
          setAmount("");
          setStatus("");
          setTxHash("");
        }, 3000);
        
      } else {
        // Unwrap: Wrapped Token -> Public Token (SimpleWrappedUSDC - single step, NO FHE)
        console.log("[Unwrap] Unwrapping", token, "Amount:", amount);
        console.log("[Unwrap] Wrapper contract:", config.shielded);
        
        setStatus("Unwrapping tokens...");
        hash = await network.unwrap(activeAccount, config.shielded, amount);
        
        setTxHash(hash);
        setStatus("Pending Confirmation... (Waiting for block)");
        await network.waitForTransaction(hash);
        
        setStatus("✅ Unshield (Unwrap) Successful!");
        setLoading(false);
        
        // Reset form
        setTimeout(() => {
          setAmount("");
          setStatus("");
          setTxHash("");
        }, 3000);
      }
      
    } catch (e: any) {
      console.error(e);
      setStatus("❌ Failed: " + e.message);
      setPendingClaim(false);
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom sx={{ mb: 3 }}>
        🛡️ Privacy Shield (FHE)
      </Typography>

      <Alert severity="info" sx={{ mb: 3, fontSize: '0.8rem' }}>
        <strong>🛡️ CoFHE Privacy Shield:</strong> Shield (wrap) your tokens (ETH/USDC) to enable <strong>confidential transfers</strong> using Fully Homomorphic Encryption. Balance and transaction amounts remain encrypted on-chain.
        {mode === "unshield" && (
          <>
            <br /><br />
            <strong>⚠️ Unwrap Process:</strong> Burns encrypted tokens and returns your original tokens (WETH/USDC) instantly.
          </>
        )}
      </Alert>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant={mode === "shield" ? "contained" : "outlined"}
          onClick={() => setMode("shield")}
          fullWidth
          color="secondary"
        >
          🔒 Shield (Wrap)
        </Button>
        <Button
          variant={mode === "unshield" ? "contained" : "outlined"}
          onClick={() => setMode("unshield")}
          fullWidth
          color="warning"
        >
          🔓 Unshield (Unwrap)
        </Button>
      </Stack>

      <Paper elevation={0} variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography variant="caption" color="text.secondary">Amount</Typography>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
          <TextField
            variant="standard"
            placeholder="0.0"
            fullWidth
            value={amount}
            onChange={e => setAmount(e.target.value)}
            InputProps={{ disableUnderline: true, style: { fontSize: '1.5rem', fontWeight: 600 } }}
            disabled={loading}
          />
          <Select
            value={token}
            onChange={e => setToken(e.target.value as any)}
            variant="standard"
            disableUnderline
            disabled={loading}
          >
            <MenuItem value="ETH">ETH</MenuItem>
            <MenuItem value="USDC">USDC</MenuItem>
          </Select>
        </Stack>
      </Paper>

      {status && (
        <Alert 
          severity={status.includes("Failed") || status.includes("❌") ? "error" : status.includes("Pending") ? "info" : "success"} 
          sx={{ mb: 2 }}
        >
          <Box>
            {status}
            {txHash && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ wordBreak: 'break-all', fontFamily: 'monospace', display: 'block', mb: 0.5 }}>
                  Hash: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </Typography>
                <Link
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener"
                  color="inherit"
                  underline="always"
                  sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                >
                  View on Explorer
                </Link>
              </Box>
            )}
          </Box>
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleAction}
        disabled={loading || !amount}
        color={mode === "shield" ? "secondary" : "warning"}
        sx={{ borderRadius: 3, height: 48 }}
      >
        {loading 
          ? (pendingClaim 
              ? "⏳ Waiting for decryption..." 
              : (status.includes("Confirming") || status.includes("Pending") 
                  ? "⏳ Confirming..." 
                  : "🔄 Processing..."))
          : (mode === "shield" ? "🔒 Shield Assets" : "🔓 Unshield Assets")
        }
      </Button>
    </Box>
  );
}

// --- Send Panel ---
function SendPanel() {
  const context = useContext(WalletContext);
  const activeAccount = context?.accountManager?.GetActive();
  const network = context?.networkProvider?.getActiveNetwork();

  const [sendAddress, setSendAddress] = useState("");
  const [sendTokenAddress, setSendTokenAddress] = useState("ETH");
  const [sendAmount, setSendAmount] = useState("");
  const [isConfidential, setIsConfidential] = useState(false);

  const [status, setStatus] = useState<"idle" | "validating" | "signing" | "broadcasting" | "pending" | "success" | "fail">("idle");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  const tokens = context?.tokenCache?.getAllTokens(network?.network_id ?? 1) ?? [];

  const handleSend = async () => {
    if (!activeAccount || !network) return;

    setFeedbackMsg("");
    setTxHash("");
    setStatus("validating");

    try {
      if (!isAddress(sendAddress)) throw new Error("Invalid Recipient");
      if (!sendAmount || parseFloat(sendAmount) <= 0) throw new Error("Invalid Amount");

      setStatus("signing");
      setFeedbackMsg("Please sign the transaction...");

      let hash = "";

      if (isConfidential) {
        // Confidential Transfer using FHE Wrapped Tokens
        // Events won't show amounts!
        
        let tokenAddress = "";
        let decimals = 18;

        // Direct cUSDC transfer (already wrapped token)
        if (sendTokenAddress.toLowerCase() === CONTRACTS["USDC"].shielded.toLowerCase()) {
          tokenAddress = sendTokenAddress; // Already cUSDC
          decimals = 6;
        }
        // Legacy: If public USDC selected, redirect to wrapped version
        else if (sendTokenAddress.toLowerCase() === CONTRACTS["USDC"].public.toLowerCase()) {
          tokenAddress = CONTRACTS["USDC"].shielded;
          decimals = 6;
        }
        // Direct cETH transfer (already wrapped token)
        else if (sendTokenAddress.toLowerCase() === CONTRACTS["ETH"].shielded.toLowerCase()) {
          tokenAddress = sendTokenAddress; // Already cETH
          decimals = 18;
        }
        // Legacy: If public WETH selected, redirect to wrapped version
        else if (sendTokenAddress.toLowerCase() === CONTRACTS["ETH"].public.toLowerCase()) {
          tokenAddress = CONTRACTS["ETH"].shielded;
          decimals = 18;
        }
        else if (sendTokenAddress === "ETH") {
          // Native ETH - should use WETH wrapper
          tokenAddress = CONTRACTS["ETH"].shielded;
          decimals = 18;
        }
        else {
          throw new Error("Confidential transfer only supports cUSDC and cETH");
        }
        
        // Check if wrapper exists
        if (tokenAddress === "0x0000000000000000000000000000000000000000") {
          throw new Error("Token wrapper not deployed yet");
        }

        console.log("[Send] Confidential Transfer - Token:", tokenAddress, "Amount:", sendAmount, "To:", sendAddress);
        
        // Use network.transferConfidential() - encrypts amount with cofhejs FHE
        // Amount is encrypted into InEuint struct (ctHash + signature) before sending
        setFeedbackMsg("Encrypting amount with FHE...");
        hash = await network.transferConfidential(activeAccount, tokenAddress, sendAddress, sendAmount);
        console.log("[Send] Confidential Transfer TX:", hash);
        
      } else {
        // Standard Transfer
        if (sendTokenAddress === "ETH") {
          console.log("[Send] ETH Transfer - Amount:", sendAmount, "to:", sendAddress);
          hash = await network.sendTransaction(activeAccount, { to: sendAddress, value: sendAmount });
          console.log("[Send] ETH Transfer TX:", hash);
        } else {
          console.log("[Send] ERC20 Transfer - Token:", sendTokenAddress, "Amount:", sendAmount);
          const iface = new Interface(["function transfer(address to, uint256 amount)"]);
          const tokenMeta = context?.tokenCache?.getToken(network.network_id, sendTokenAddress);
          const decimals = tokenMeta?.decimals ?? 18;
          const amountWei = parseUnits(sendAmount, decimals);
          console.log("[Send] ERC20 Amount in Wei:", amountWei.toString());
          const data = iface.encodeFunctionData("transfer", [sendAddress, amountWei]);
          hash = await network.sendTransaction(activeAccount, { to: sendTokenAddress, value: "0", data });
          console.log("[Send] ERC20 Transfer TX:", hash);
        }
      }

      setTxHash(hash);
      setStatus("pending");
      setFeedbackMsg("Broadcasted! Waiting...");
      await network.waitForTransaction(hash);
      setStatus("success");
      setFeedbackMsg("Success!");

    } catch (err: any) {
      console.error(err);
      setStatus("fail");
      setFeedbackMsg(err.message || "Failed");
    }
  };

  const isLoading = ["validating", "signing", "broadcasting", "pending"].includes(status);

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom sx={{ mb: 3 }}>
        Send Assets
      </Typography>

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button
          size="small"
          variant={isConfidential ? "contained" : "outlined"}
          color={isConfidential ? "secondary" : "inherit"}
          onClick={() => setIsConfidential(!isConfidential)}
          startIcon={isConfidential ? <Shield /> : null}
        >
          {isConfidential ? "🔒 Confidential ON" : "Enable Confidential"}
        </Button>
      </Stack>

      {isConfidential && (
        <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8rem' }}>
          <strong>Confidential Mode:</strong> You're sending <strong>encrypted tokens (cUSDC/cETH)</strong>. Amounts are hidden on-chain. Make sure you have shielded balance.
        </Alert>
      )}

      {status === 'success' ? (
        <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
          <CheckCircle color="success" sx={{ fontSize: 64 }} />
          <Typography variant="h6">Transfer Complete!</Typography>
          <Button variant="outlined" onClick={() => { setStatus('idle'); setSendAmount(""); setSendAddress(""); }}>
            Send Another
          </Button>
        </Stack>
      ) : (
        <Stack spacing={3}>
          <TextField
            label="Recipient Address"
            placeholder="0x..."
            fullWidth
            value={sendAddress}
            onChange={(e) => setSendAddress(e.target.value)}
            disabled={isLoading}
          />

          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Asset</InputLabel>
              <Select
                value={sendTokenAddress}
                label="Asset"
                onChange={(e) => setSendTokenAddress(e.target.value)}
                disabled={isLoading}
              >
                <MenuItem value="ETH">ETH {isConfidential ? "(eETH)" : ""}</MenuItem>
                {tokens.filter(t => t.symbol !== "ETH").map(t => (
                  <MenuItem key={t.contractAddress} value={t.contractAddress}>
                    {t.symbol} {isConfidential ? "(eToken)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Amount"
              type="number"
              fullWidth
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              disabled={isLoading}
            />
          </Stack>

          {status === 'fail' && (
            <Alert severity="error">{feedbackMsg}</Alert>
          )}

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSend}
            disabled={isLoading || !sendAddress || !sendAmount}
            color={isConfidential ? "secondary" : "primary"}
          >
            {isLoading ? "Processing..." : (isConfidential ? "Send Confidential" : "Send Transaction")}
          </Button>
        </Stack>
      )}
    </Box>
  );
}

// --- Receive Panel ---
function ReceivePanel() {
  const context = useContext(WalletContext);
  const address = context?.accountManager?.GetActive()?.GetAddress() ?? "0x0000000000000000000000000000000000000000";

  return (
    <Box sx={{ textAlign: 'center', pb: 2 }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Receive Assets
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Scan this QR code to deposit tokens into your account.
      </Typography>

      <Paper elevation={0} variant="outlined" sx={{
        display: 'inline-flex',
        p: 2,
        borderRadius: 4,
        mb: 4,
        bgcolor: 'background.paper'
      }}>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}`}
          alt="QR Code"
          style={{ width: 180, height: 180, borderRadius: 8 }}
        />
      </Paper>

      <TextField
        value={address}
        fullWidth
        InputProps={{
          readOnly: true,
          endAdornment: <InputAdornment position="end"><ContentCopy sx={{ fontSize: 18, cursor: 'pointer' }} /></InputAdornment>
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 3,
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            bgcolor: 'action.hover'
          }
        }}
      />
    </Box>
  );
}

// --- Swap Panel ---
function SwapPanel() {
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom sx={{ mb: 3 }}>
        Swap Tokens
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 1 }}>
        <Typography variant="caption" color="text.secondary">You pay</Typography>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
          <TextField
            variant="standard"
            placeholder="0"
            fullWidth
            InputProps={{ disableUnderline: true, style: { fontSize: '1.5rem', fontWeight: 600 } }}
          />
          <Select value={0} variant="standard" disableUnderline sx={{ minWidth: 80 }}>
            <MenuItem value={0}><Stack direction="row" alignItems="center" gap={1}>ETH</Stack></MenuItem>
          </Select>
        </Stack>
      </Paper>
    </Box>
  );
}


export default function ArfBottomMenu() {
  const [value, setValue] = React.useState(0);
  const [scanOpen, setScanOpen] = React.useState(false);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ p: 2, pb: 4, height: '80vh' }}>
      <Stack direction="row" justifyContent="center" alignItems="center" sx={{ position: 'relative', mb: 2 }}>
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
        <Box sx={{ position: 'absolute', right: 0 }}>
          <Button size="small" startIcon={<QrCode />} onClick={() => setScanOpen(true)}>
            Connect
          </Button>
        </Box>
      </Stack>

      <Tabs
        value={value}
        onChange={handleChange}
        centered
        sx={{
          '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' },
          '& .MuiTab-root': { fontWeight: 700, fontSize: '0.9rem' }
        }}
      >
        <Tab label="Send" />
        <Tab label="Receive" />
        <Tab label="Swap" />
        <Tab label="Shield" />
      </Tabs>

      <CustomTabPanel value={value} index={0}>
        <SendPanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={1}>
        <ReceivePanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={2}>
        <SwapPanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={3}>
        <ShieldPanel />
      </CustomTabPanel>

      <ScanDialog open={scanOpen} onClose={() => setScanOpen(false)} />
    </Box>
  );
}

function ScanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const context = useContext(WalletContext);
  const [uri, setUri] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const handleConnect = async () => {
    if (!uri) return;
    setLoading(true);
    setMsg("");
    try {
      await context?.walletConnectService.pair(uri);
      setMsg("Connected!");
      setTimeout(onClose, 1000);
    } catch (e: any) {
      if (e.toString().includes("Expired")) {
        setMsg("QR Code Expired. Please refresh dApp.");
      } else {
        setMsg("Connection failed");
      }
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>Connect dApp</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          placeholder="wc:..."
          value={uri}
          onChange={e => setUri(e.target.value)}
          multiline
          rows={3}
          sx={{ mt: 1 }}
        />
        {msg && <Typography color={msg.includes("fail") ? "error" : "success"} variant="caption">{msg}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleConnect} disabled={loading} variant="contained">
          {loading ? "Connecting..." : "Connect"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}