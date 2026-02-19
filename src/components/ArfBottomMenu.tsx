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
  DialogActions,
  Chip,
  IconButton,
  Tooltip,
  Fade
} from "@mui/material";
import { WalletContext } from "../AppContext.js";
import {
  Send as SendIcon,
  QrCode,
  ContentCopy,
  CheckCircle,
  Shield,
  Error as ErrorIcon,
  CallReceived,
  LockOutlined,
  LockOpen,
  ArrowForward,
  OpenInNew,
  Visibility,
  VisibilityOff
} from "@mui/icons-material";
import { isAddress, parseUnits, Interface, formatEther, getAddress } from "ethers";
import { NetworkId } from "../backend/NetworkTypes.js";

// --- Tab Panel Wrapper ---
function CustomTabPanel(props: { children: React.ReactNode; index: number; value: number }) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other} style={{ width: '100%' }}>
      {value === index && <Box sx={{ pt: 2.5 }}>{children}</Box>}
    </div>
  );
}

// ArfheWallet - Wrapped Token Addresses
const CONTRACTS = {
  "USDC": {
    public: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
    shielded: getAddress((import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS || "0x730Bb4ee9EA1cdB0B45C1DB01cA67a616D2D3C88")
  },
  "ETH": {
    public: getAddress((import.meta as any).env.VITE_SEPOLIA_WETH_ADDRESS || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
    shielded: getAddress((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "0x17CecF8090B945932e2F592168B636F7A0c986e8")
  },
  "LINK": {
    public: getAddress("0x779877A7B0D9E8603169DdbD7836e478b4624789"),
    shielded: getAddress("0x0000000000000000000000000000000000000000")
  }
};

// Shared input card style
const inputCardSx = {
  p: 2,
  borderRadius: 3,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'action.hover',
  transition: 'border-color 0.2s',
  '&:hover': { borderColor: 'primary.main' }
};

// Shared CTA button sx
const ctaButtonSx = {
  borderRadius: 3,
  height: 52,
  fontWeight: 700,
  fontSize: '0.95rem',
  letterSpacing: '0.02em',
  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.25)',
  '&:hover': {
    boxShadow: '0 6px 20px rgba(79, 70, 229, 0.35)',
    transform: 'translateY(-1px)',
  },
  transition: 'all 0.2s ease',
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
  const [pendingClaim, setPendingClaim] = useState(false);

  const handleAction = async () => {
    if (!network || !activeAccount) return;

    setLoading(true);
    setStatus("Processing... Please sign in wallet.");
    setTxHash("");

    try {
      // @ts-ignore
      const config = CONTRACTS[token];
      if (!config) throw new Error("Invalid Token Config");

      if (config.shielded === "0x0000000000000000000000000000000000000000") {
        throw new Error(`${token} wrapping not yet deployed`);
      }

      let hash = "";

      if (mode === "shield") {
        console.log("[Wrap] Wrapping", token, "Amount:", amount);
        console.log("[Wrap] Public token:", config.public);
        console.log("[Wrap] Wrapper contract:", config.shielded);

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
        console.log("[Unwrap] Unwrapping", token, "Amount:", amount);
        console.log("[Unwrap] Wrapper contract:", config.shielded);

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

    } catch (e: any) {
      console.error(e);
      setStatus("Failed: " + e.message);
      setPendingClaim(false);
      setLoading(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Shield sx={{ fontSize: 20, color: 'secondary.main' }} />
        <Typography variant="subtitle1" fontWeight={700}>
          Privacy Shield
        </Typography>
        <Chip label="FHE" size="small" color="secondary" variant="outlined"
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
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
        mb: 2.5
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
              style: { fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em' }
            }}
            disabled={loading}
          />
          <Select
            value={token}
            onChange={e => setToken(e.target.value as any)}
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
            mt: 2,
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
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
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
          mt: 2.5,
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

  const [ownedTokens, setOwnedTokens] = useState<{ contractAddress: string; symbol: string; balance: string }[]>([]);
  const [ownedShieldedTokens, setOwnedShieldedTokens] = useState<{ contractAddress: string; symbol: string; balance: string }[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);

  // Load token balances on mount
  React.useEffect(() => {
    const loadBalances = async () => {
      if (!network || !activeAccount) {
        setTokensLoading(false);
        return;
      }
      setTokensLoading(true);
      try {
        const address = activeAccount.GetAddress();
        if (!address) { setTokensLoading(false); return; }
        const networkId = network.network_id;

        const IGNORED_CONTRACTS = [
          "0xbde0a2e375b67c802d4651fecf3b678b1886d15b",
          "0x3e0722a877e52fe755e8bf02372342c63930fd57",
          "0x6ab305c679002c0938c2be3f824fcb8b81be5b70",
          "0x5c3f1fe2c451ccc73443865fec914a595c3d1a7c",
          "0x730bb4ee9ea1cdb0b45c1db01ca67a616d2d3c88",
          "0x23bad885b76c95ec9e2b47663022d552d780200f",
          "0x503e16b7920420277ce1548444dbb30e97f87d40",
          "0x3696a9a8ecd0dbd7111dd15f7837d7f38d83a0c0",
          "0x7890673c207a728ef7d9378c7206030749351dad",
          "0x4b3dd819cfbf1364cabd5c8f9c5c05917d09168c",
          "0x421583e66b21de780b4f94fcecce858c07f3d2d9",
          "0x0125c55244724c1bf1d16b91e046fe7e8a5719e2",
          "0x8d0419e8a259366516fc4fbabebdc013cad8770f",
          "0x2210264a3775d5fbc51b1b73667f5590230ac2bd"
        ];

        const WRAPPED_USDC = ((import.meta as any).env.VITE_WRAPPED_USDC_ADDRESS || "").toLowerCase();
        const WRAPPED_ETH = ((import.meta as any).env.VITE_WRAPPED_ETH_ADDRESS || "").toLowerCase();
        const shieldedAddresses = [WRAPPED_USDC, WRAPPED_ETH].filter(Boolean);
        const REAL_WETH = CONTRACTS["ETH"].public.toLowerCase();

        const tokenBalances = await network.getTokenBalances(context?.tokenCache, address);
        const seenSymbols = new Set<string>();
        const publicTokensWithBalance = tokenBalances
          .filter(tb => {
            if (parseFloat(tb.tokenBalance) <= 0) return false;
            const addr = tb.contractAddress.toLowerCase();
            if (IGNORED_CONTRACTS.includes(addr)) return false;
            if (shieldedAddresses.includes(addr)) return false;
            const meta = context?.tokenCache?.getToken(networkId, tb.contractAddress);
            const symbol = meta?.symbol ?? "";
            if (symbol === "WETH" && addr !== REAL_WETH) return false;
            if (!tb.isNative && symbol && seenSymbols.has(symbol)) return false;
            if (symbol) seenSymbols.add(symbol);
            return true;
          })
          .map(tb => {
            const meta = context?.tokenCache?.getToken(networkId, tb.contractAddress);
            return {
              contractAddress: tb.contractAddress,
              symbol: meta?.symbol ?? (tb.isNative ? "ETH" : "???"),
              balance: tb.tokenBalance
            };
          });
        setOwnedTokens(publicTokensWithBalance);

        // Fetch shielded token balances (only on Sepolia)
        if (networkId === NetworkId.Ethereum_Sepolia && (WRAPPED_USDC || WRAPPED_ETH)) {
          const shielded: { contractAddress: string; symbol: string; balance: string }[] = [];

          if (WRAPPED_ETH) {
            try {
              const bal = await network.getShieldedBalance(WRAPPED_ETH, address, activeAccount);
              if (bal && parseFloat(bal) > 0) {
                shielded.push({ contractAddress: WRAPPED_ETH, symbol: "cETH", balance: bal });
              }
            } catch (e) { console.warn("[SendPanel] cETH balance fetch failed", e); }
          }
          if (WRAPPED_USDC) {
            try {
              const bal = await network.getShieldedBalance(WRAPPED_USDC, address, activeAccount);
              if (bal && parseFloat(bal) > 0) {
                shielded.push({ contractAddress: WRAPPED_USDC, symbol: "cUSDC", balance: bal });
              }
            } catch (e) { console.warn("[SendPanel] cUSDC balance fetch failed", e); }
          }
          setOwnedShieldedTokens(shielded);
        }
      } catch (e) {
        console.error("[SendPanel] Failed to load balances:", e);
      } finally {
        setTokensLoading(false);
      }
    };
    loadBalances();
  }, [network, activeAccount]);

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
        let tokenAddress = "";
        let decimals = 18;

        if (sendTokenAddress.toLowerCase() === CONTRACTS["USDC"].shielded.toLowerCase()) {
          tokenAddress = sendTokenAddress;
          decimals = 6;
        } else if (sendTokenAddress.toLowerCase() === CONTRACTS["USDC"].public.toLowerCase()) {
          tokenAddress = CONTRACTS["USDC"].shielded;
          decimals = 6;
        } else if (sendTokenAddress.toLowerCase() === CONTRACTS["ETH"].shielded.toLowerCase()) {
          tokenAddress = sendTokenAddress;
          decimals = 18;
        } else if (sendTokenAddress.toLowerCase() === CONTRACTS["ETH"].public.toLowerCase()) {
          tokenAddress = CONTRACTS["ETH"].shielded;
          decimals = 18;
        } else if (sendTokenAddress === "ETH") {
          tokenAddress = CONTRACTS["ETH"].shielded;
          decimals = 18;
        } else {
          throw new Error("Confidential transfer only supports cUSDC and cETH");
        }

        if (tokenAddress === "0x0000000000000000000000000000000000000000") {
          throw new Error("Token wrapper not deployed yet");
        }

        console.log("[Send] Confidential Transfer - Token:", tokenAddress, "Amount:", sendAmount, "To:", sendAddress);
        setFeedbackMsg("Encrypting amount with FHE...");
        hash = await network.transferConfidential(activeAccount, tokenAddress, sendAddress, sendAmount);
        console.log("[Send] Confidential Transfer TX:", hash);

      } else {
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
  const displayTokens = isConfidential ? ownedShieldedTokens : ownedTokens;

  return (
    <Box>
      {/* Header row with confidential toggle */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SendIcon sx={{ fontSize: 20, color: 'primary.main' }} />
          <Typography variant="subtitle1" fontWeight={700}>
            Send
          </Typography>
        </Stack>
        <Tooltip title={isConfidential ? "Encrypted transfer via FHE" : "Enable encrypted transfers"} arrow>
          <Button
            size="small"
            variant={isConfidential ? "contained" : "outlined"}
            color={isConfidential ? "secondary" : "inherit"}
            onClick={() => setIsConfidential(!isConfidential)}
            startIcon={isConfidential ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
            sx={{
              borderRadius: 2,
              px: 1.5,
              py: 0.5,
              fontSize: '0.75rem',
              fontWeight: 600,
              minWidth: 'auto',
              ...(isConfidential && {
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              })
            }}
          >
            {isConfidential ? "Confidential" : "Public"}
          </Button>
        </Tooltip>
      </Stack>

      {/* Confidential mode hint */}
      {isConfidential && (
        <Fade in>
          <Paper elevation={0} sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 2.5,
            bgcolor: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid',
            borderColor: 'rgba(16, 185, 129, 0.2)',
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              Confidential mode encrypts transfer amounts using FHE.
              Only shielded tokens (cETH, cUSDC) with balance are available.
            </Typography>
          </Paper>
        </Fade>
      )}

      {/* Success State */}
      {status === 'success' ? (
        <Stack spacing={2.5} alignItems="center" sx={{ py: 5 }}>
          <Box sx={{
            width: 72, height: 72, borderRadius: '50%',
            bgcolor: 'success.main', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)',
          }}>
            <CheckCircle sx={{ fontSize: 40, color: '#fff' }} />
          </Box>
          <Typography variant="h6" fontWeight={700}>Transfer Complete</Typography>
          {txHash && (
            <Link
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank" rel="noopener"
              underline="hover"
              sx={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              View on Explorer <OpenInNew sx={{ fontSize: 14 }} />
            </Link>
          )}
          <Button
            variant="outlined"
            onClick={() => { setStatus('idle'); setSendAmount(""); setSendAddress(""); setTxHash(""); }}
            sx={{ borderRadius: 3, fontWeight: 600 }}
          >
            New Transfer
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          {/* Recipient */}
          <Paper elevation={0} sx={inputCardSx}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Recipient</Typography>
            <TextField
              variant="standard"
              placeholder="0x..."
              fullWidth
              value={sendAddress}
              onChange={(e) => setSendAddress(e.target.value)}
              disabled={isLoading}
              InputProps={{
                disableUnderline: true,
                style: { fontSize: '0.95rem', fontWeight: 500, fontFamily: 'monospace', marginTop: 4 }
              }}
            />
          </Paper>

          {/* Asset + Amount row */}
          <Stack direction="row" spacing={1.5}>
            <Paper elevation={0} sx={{ ...inputCardSx, flex: 1.2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Asset</Typography>
              <Select
                value={sendTokenAddress}
                onChange={(e) => setSendTokenAddress(e.target.value)}
                variant="standard"
                disableUnderline
                fullWidth
                disabled={isLoading || tokensLoading}
                sx={{ fontWeight: 600, fontSize: '0.95rem', mt: 0.5 }}
              >
                {tokensLoading ? (
                  <MenuItem value="ETH" disabled>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CircularProgress size={14} />
                      <span>Loading...</span>
                    </Stack>
                  </MenuItem>
                ) : displayTokens.length === 0 ? (
                  <MenuItem value="ETH" disabled>
                    {isConfidential ? "No shielded tokens" : "No tokens found"}
                  </MenuItem>
                ) : (
                  displayTokens.map(t => (
                    <MenuItem key={t.contractAddress} value={t.contractAddress}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%' }}>
                        <Typography variant="body2" fontWeight={600}>{t.symbol}</Typography>
                        <Typography variant="caption" color="text.secondary">{parseFloat(t.balance).toFixed(4)}</Typography>
                      </Stack>
                    </MenuItem>
                  ))
                )}
              </Select>
            </Paper>

            <Paper elevation={0} sx={{ ...inputCardSx, flex: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Amount</Typography>
              <TextField
                variant="standard"
                placeholder="0.00"
                type="number"
                fullWidth
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                disabled={isLoading}
                InputProps={{
                  disableUnderline: true,
                  style: { fontSize: '1.1rem', fontWeight: 700, marginTop: 4 }
                }}
              />
            </Paper>
          </Stack>

          {/* Error */}
          {status === 'fail' && (
            <Fade in>
              <Paper elevation={0} sx={{
                p: 1.5, borderRadius: 2.5,
                bgcolor: 'error.main', color: '#fff',
              }}>
                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                  {feedbackMsg}
                </Typography>
              </Paper>
            </Fade>
          )}

          {/* Loading feedback */}
          {isLoading && status !== 'fail' && (
            <Fade in>
              <Paper elevation={0} sx={{
                p: 1.5, borderRadius: 2.5,
                bgcolor: 'primary.main', color: '#fff',
              }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={16} color="inherit" />
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                    {feedbackMsg || "Processing..."}
                  </Typography>
                </Stack>
              </Paper>
            </Fade>
          )}

          {/* CTA */}
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSend}
            disabled={isLoading || !sendAddress || !sendAmount}
            color={isConfidential ? "secondary" : "primary"}
            sx={{
              ...ctaButtonSx,
              ...(isConfidential && {
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              })
            }}
            endIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : <ArrowForward />}
          >
            {isLoading
              ? "Processing..."
              : (isConfidential ? "Send Confidential" : "Send Transaction")
            }
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
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ textAlign: 'center' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mb: 0.5 }}>
        <CallReceived sx={{ fontSize: 20, color: 'primary.main' }} />
        <Typography variant="subtitle1" fontWeight={700}>
          Receive
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
        Share your address or scan QR to receive tokens.
      </Typography>

      {/* QR Code */}
      <Paper elevation={0} sx={{
        display: 'inline-flex',
        p: 2.5,
        borderRadius: 4,
        mb: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#ffffff',
      }}>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}`}
          alt="QR Code"
          style={{ width: 160, height: 160, borderRadius: 8 }}
        />
      </Paper>

      {/* Address with copy */}
      <Paper elevation={0} sx={{
        ...inputCardSx,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        cursor: 'pointer',
        '&:active': { transform: 'scale(0.99)' }
      }} onClick={handleCopy}>
        <Typography variant="body2" sx={{
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: 'text.secondary'
        }}>
          {address}
        </Typography>
        <Tooltip title={copied ? "Copied!" : "Copy address"}>
          <IconButton size="small" sx={{ ml: 0.5 }}>
            {copied
              ? <CheckCircle sx={{ fontSize: 18, color: 'success.main' }} />
              : <ContentCopy sx={{ fontSize: 16 }} />
            }
          </IconButton>
        </Tooltip>
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
    <Box sx={{ px: 2.5, pt: 1.5, pb: 4, height: '80vh' }}>
      {/* Drawer Handle */}
      <Stack direction="row" justifyContent="center" alignItems="center" sx={{ position: 'relative', mb: 1.5 }}>
        <Box sx={{
          width: 36, height: 4, borderRadius: 2,
          bgcolor: 'divider',
        }} />
        <Box sx={{ position: 'absolute', right: 0 }}>
          <Button
            size="small"
            startIcon={<QrCode sx={{ fontSize: 16 }} />}
            onClick={() => setScanOpen(true)}
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              fontWeight: 600,
              '&:hover': { color: 'primary.main' }
            }}
          >
            WalletConnect
          </Button>
        </Box>
      </Stack>

      {/* Tabs */}
      <Tabs
        value={value}
        onChange={handleChange}
        centered
        sx={{
          minHeight: 40,
          '& .MuiTabs-indicator': {
            height: 2.5,
            borderRadius: '3px 3px 0 0',
            bgcolor: 'primary.main',
          },
          '& .MuiTab-root': {
            fontWeight: 700,
            fontSize: '0.85rem',
            minHeight: 40,
            py: 1,
            textTransform: 'none',
            color: 'text.secondary',
            '&.Mui-selected': { color: 'text.primary' },
          },
        }}
      >
        <Tab icon={<SendIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Send" />
        <Tab icon={<CallReceived sx={{ fontSize: 16 }} />} iconPosition="start" label="Receive" />
        <Tab icon={<Shield sx={{ fontSize: 16 }} />} iconPosition="start" label="Shield" />
      </Tabs>

      <CustomTabPanel value={value} index={0}>
        <SendPanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={1}>
        <ReceivePanel />
      </CustomTabPanel>
      <CustomTabPanel value={value} index={2}>
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
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          bgcolor: 'background.paper',
          backgroundImage: 'none',
        }
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', pb: 0 }}>
        Connect dApp
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Paste the WalletConnect URI to pair with a dApp.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          placeholder="wc:..."
          value={uri}
          onChange={e => setUri(e.target.value)}
          multiline
          rows={3}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
            }
          }}
        />
        {msg && (
          <Typography
            color={msg.includes("fail") || msg.includes("Expired") ? "error" : "success.main"}
            variant="caption"
            fontWeight={600}
            sx={{ mt: 1, display: 'block' }}
          >
            {msg}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 600 }}>Cancel</Button>
        <Button
          onClick={handleConnect}
          disabled={loading || !uri}
          variant="contained"
          sx={{ borderRadius: 3, fontWeight: 600, px: 3 }}
          endIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? "Connecting..." : "Connect"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}