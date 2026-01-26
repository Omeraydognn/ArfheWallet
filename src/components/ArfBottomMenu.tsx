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
import { SwapHoriz, Send, QrCode, ContentCopy, CheckCircle, Error as ErrorIcon } from "@mui/icons-material";
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
// ArfheWallet - Fhenix Shielded Token Addresses
const CONTRACTS = {
  "USDC": {
    public: getAddress("0x1c7d4b196cb0c7b01d743fbc6116a902379c7238"),
    shielded: getAddress("0x2035f9228e160243be8e07973715c929845e445e")
  },
  "ETH": {
    public: getAddress("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
    // Correct Fhenix eETH Address
    shielded: getAddress("0xfff9976742d46cc05630d1f6ebab18b2324d6b14")
  },
  "LINK": {
    public: getAddress("0x776b6fc2ed15d6bb5fc32e0c89de68683118c62a"),
    shielded: getAddress("0xfa1c414878ae7beed5ef116d3999988d6a686831")
  }
};

// --- Shield Panel (Privacy) ---
function ShieldPanel() {
  const context = useContext(WalletContext);
  const network = context?.networkProvider?.getActiveNetwork();
  const activeAccount = context?.accountManager?.GetActive();

  const [mode, setMode] = useState<"shield" | "unshield">("shield");
  const [token, setToken] = useState<"USDC" | "ETH">("USDC");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  const handleAction = async () => {
    if (!network || !activeAccount) return;
    setLoading(true);
    setStatus("Processing... Please sign in wallet.");
    setTxHash("");

    try {
      // @ts-ignore
      const config = CONTRACTS[token];
      if (!config) throw new Error("Invalid Token Config");

      let hash = "";

      if (mode === "shield") {
        hash = await network.wrap(activeAccount, config.public, config.shielded, amount);
      } else {
        hash = await network.unwrap(activeAccount, config.shielded, amount);
      }

      setTxHash(hash);
      setStatus("Pending Confirmation... (Waiting for block)");

      await network.waitForTransaction(hash);

      setStatus(mode === "shield" ? "Shield (Deposit) Successful!" : "Unshield (Withdraw) Successful!");
      setLoading(false); 
    } catch (e: any) {
      console.error(e);
      setStatus("Failed: " + e.message);
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom sx={{ mb: 3 }}>
        Privacy Shield
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant={mode === "shield" ? "contained" : "outlined"}
          onClick={() => setMode("shield")}
          fullWidth
        >
          Shield (Deposit)
        </Button>
        <Button
          variant={mode === "unshield" ? "contained" : "outlined"}
          onClick={() => setMode("unshield")}
          fullWidth
        >
          Unshield (Withdraw)
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
            <MenuItem value="USDC">eUSDC</MenuItem>
            <MenuItem value="ETH">eETH</MenuItem>
          </Select>
        </Stack>
      </Paper>

      {status && (
        <Alert severity={status.includes("Failed") ? "error" : status.includes("Pending") ? "info" : "success"} sx={{ mb: 2 }}>
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
        sx={{ borderRadius: 3, height: 48, bgcolor: mode === "shield" ? 'primary.main' : 'warning.main' }}
      >
        {loading ? (status.includes("Pending") ? "Pending..." : "Processing...") : (mode === "shield" ? "Shield Assets" : "Unshield Assets")}
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
        // Confidential Transfer
        let shieldedAddress = "";
        let decimals = 18;

        // @ts-ignore
        if (sendTokenAddress === "ETH") {
          shieldedAddress = CONTRACTS["ETH"].shielded;
          decimals = 18;
        }
        // @ts-ignore
        else if (sendTokenAddress.toLowerCase() === CONTRACTS["USDC"].public.toLowerCase()) {
          shieldedAddress = CONTRACTS["USDC"].shielded;
          decimals = 6;
        }
        else {
          // Fallback
          // @ts-ignore
          shieldedAddress = CONTRACTS["USDC"].shielded;
          decimals = 6;
        }

        // Convert to BigInt String (Wei) for FHE Encryption
        const amountWei = parseUnits(sendAmount, decimals);
        
        // Passing Wei string to Network.ts
        hash = await network.transferConfidential(activeAccount, shieldedAddress, sendAddress, amountWei.toString());
      } else {
        // Standard Transfer
        if (sendTokenAddress === "ETH") {
          hash = await network.sendTransaction(activeAccount, { to: sendAddress, value: sendAmount });
        } else {
          const iface = new Interface(["function transfer(address to, uint256 amount)"]);
          const tokenMeta = context?.tokenCache?.getToken(network.network_id, sendTokenAddress);
          const decimals = tokenMeta?.decimals ?? 18;
          const amountWei = parseUnits(sendAmount, decimals);
          const data = iface.encodeFunctionData("transfer", [sendAddress, amountWei]);
          hash = await network.sendTransaction(activeAccount, { to: sendTokenAddress, value: "0", data });
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
          startIcon={isConfidential ? <CheckCircle /> : null}
        >
          {isConfidential ? "Confidential Mode ON" : "Enable Confidential Mode"}
        </Button>
      </Stack>

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