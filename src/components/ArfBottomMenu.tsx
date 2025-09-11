import React, { useContext } from "react";
import {
  Box,
  FormControl,
  Tab,
  Tabs,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  Stack,
  Button,
  Typography,
} from "@mui/material";
import "./ArfBottomMenu.css";
import { WalletContext } from "../AppContext.js";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function SendPanel() {
  const context = useContext(WalletContext);
  const networkProvider = context?.networkProvider;
  const activeAccount = context?.accountManager?.GetActive();

  const [sendAddress, setSendAddress] = React.useState("");
  const [sendToken, setSendToken] = React.useState(0);
  const [sendAmount, setSendAmount] = React.useState(0.0);

  const [blockNumber, setBlockNumber] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchBlockNumber = async () => {
      const network = networkProvider?.getSepoliaNetwork();
      if (!network) return;

      try {
        const number = await network.getBlockNumber();
        // if getBlockNumber returns full block JSON, extract the number
        setBlockNumber(number.toString());
      } catch (err) {
        console.error("Failed to fetch block number:", err);
      }
    };

    fetchBlockNumber();
  }, [networkProvider]); // re-run if provider changes

  const handleSend = async () => {
    if (!activeAccount) {
      setError("No active account");
      return;
    }
    if (!networkProvider) {
      setError("No network provider");
      return;
    }
    if (!sendAddress || sendAmount <= 0) {
      setError("Invalid address or amount");
      return;
    }

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      if (sendToken === 0) {
        const network = networkProvider.getSepoliaNetwork();
        if (!network) {
          throw Error("No network available");
        }

        const hash = await network.sendTransaction(activeAccount, {
          to: sendAddress,
          value: sendAmount.toString(),
          gasPrice: "10", // simple static gas price; could be dynamic
        });

        setTxHash(hash);
      } else {
        throw Error("Token sending support is coming soon.")
      }
    } catch (err: any) {
      console.error("Transaction failed:", err);
      setError(err.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack direction="column" spacing={2}>
      <TextField
        variant="filled"
        label="Send To Address"
        placeholder="0x"
        fullWidth
        value={sendAddress}
        onChange={(e) => setSendAddress(e.target.value)}
      />

      <Stack direction="row" spacing={1}>
        <FormControl sx={{ flex: "1" }}>
          <InputLabel id="send-token-label">Token</InputLabel>
          <Select
            labelId="send-token-label"
            value={sendToken}
            label="Token"
            onChange={(event) => {
              setSendToken(event.target.value as number);
            }}
          >
            <MenuItem value={0}>ETH</MenuItem>
            <MenuItem value={1}>ARF</MenuItem>
            <MenuItem value={2}>USDT</MenuItem>
          </Select>
        </FormControl>

        <TextField
          variant="filled"
          label="Amount"
          type="number"
          value={sendAmount}
          onChange={(e) => setSendAmount(parseFloat(e.target.value))}
        />
      </Stack>

      <Typography>
        Latest Block: {blockNumber ? blockNumber : "Loading..."}
      </Typography>

      {loading && <Typography>Sending transaction...</Typography>}
      {txHash && (
        <Typography color="primary">
          Tx Sent: {txHash.slice(0, 10)}...{txHash.slice(-8)}
        </Typography>
      )}
      {error && <Typography color="error">{error}</Typography>}

      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{ position: "absolute", width: "90%", bottom: "15px" }}
      >
        <Button onClick={() => {
          setSendAddress("");
          setSendAmount(0);
          setSendToken(0);
          setTxHash(null);
          setError(null);
        }}>
          CANCEL
        </Button>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={loading}
        >
          SEND
        </Button>
      </Stack>
    </Stack>
  );
}

function ReceivePanel() {
  const wallet = useContext(WalletContext);

  const PUBLIC_KEY = wallet?.accountManager?.GetActive()?.GetAddress();

  if (!PUBLIC_KEY) {
    return (
      <Box textAlign="center" sx={{ p: 2 }}>
        <Typography color="text.secondary">
          No active account found.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack direction="column" spacing={2} alignItems="center">
      {/* Instructional Text */}
      <Box textAlign="center">
        <Typography>
          Share this QR code or your public key to receive tokens safely.
        </Typography>
      </Box>

      {/* QR Code */}
      <Box>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
            PUBLIC_KEY
          )}`}
          alt="QR Code"
        />
      </Box>

      {/* Public Key field (readonly) */}
      <TextField
        label="Your Public Key"
        value={PUBLIC_KEY}
        fullWidth
        variant="outlined"
        InputProps={{ readOnly: true }}
      />
    </Stack>
  );
}


const SWAP_TEST_CONTRACTS = [
  { id: 0, name: "Uniswap", address: "0x1111111111111111111111111111111111111111" },
  { id: 1, name: "Sushiswap", address: "0x2222222222222222222222222222222222222222" },
  { id: 2, name: "PancakeSwap", address: "0x3333333333333333333333333333333333333333" },
];

function SwapPanel() {
  const [enabled, setEnabled] = React.useState(false); // toggle this to enable/disable swap

  const [swapContract, setSwapContract] = React.useState(0); // provider id
  const [fromToken, setFromToken] = React.useState(0);
  const [toToken, setToToken] = React.useState(1);
  const [swapAmount, setSwapAmount] = React.useState(0.0);

  if (!enabled) {
    return (
      <Stack
        direction="column"
        spacing={2}
        justifyContent="center"
        alignItems="center"
        sx={{ height: "100%", textAlign: "center" }}
      >
        <img
          src="/images/temp/swap-soon.png" // replace with your image path
          alt="Coming soon"
          style={{ width: 150, marginBottom: 16 }}
        />
        <Typography variant="h6" color="text.secondary">
          Coming soon...
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack direction="column" spacing={2}>
      {/* Contract Selector */}
      <FormControl fullWidth variant="filled">
        <InputLabel id="swap-contract-label">Swap Provider</InputLabel>
        <Select
          labelId="swap-contract-label"
          value={swapContract}
          onChange={(e) => setSwapContract(e.target.value as number)}
        >
          {SWAP_TEST_CONTRACTS.map((contract) => (
            <MenuItem key={contract.id} value={contract.id}>
              {contract.name} — {contract.address.slice(0, 6)}...{contract.address.slice(-4)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Stack direction="row">
        {/* From Token */}
        <FormControl fullWidth variant="filled">
          <InputLabel id="from-token-label">From</InputLabel>
          <Select
            labelId="from-token-label"
            value={fromToken}
            onChange={(e) => setFromToken(e.target.value as number)}
          >
            <MenuItem value={0}>ETH</MenuItem>
            <MenuItem value={1}>ARF</MenuItem>
            <MenuItem value={2}>USDT</MenuItem>
          </Select>
        </FormControl>

        {/* To Token */}
        <FormControl fullWidth variant="filled">
          <InputLabel id="to-token-label">To</InputLabel>
          <Select
            labelId="to-token-label"
            value={toToken}
            onChange={(e) => setToToken(e.target.value as number)}
          >
            <MenuItem value={0}>ETH</MenuItem>
            <MenuItem value={1}>ARF</MenuItem>
            <MenuItem value={2}>USDT</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* Amount */}
      <TextField
        variant="filled"
        label="Amount"
        fullWidth
        value={swapAmount}
        onChange={(e) => setSwapAmount(parseFloat(e.target.value))}
      />

      {/* Action Buttons */}
      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{ position: "absolute", width: "90%", bottom: "15px" }}
      >
        <Button>CANCEL</Button>
        <Button variant="contained">SWAP</Button>
      </Stack>
    </Stack>
  );
}

export default function ArfBottomMenu() {
  const [value, setValue] = React.useState(0);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <>
      <div className="arf-bottom-menu">
        <Box>
          <Tabs centered value={value} onChange={handleChange}>
            <Tab label="SEND" />
            <Tab label="RECEIVE" />
            <Tab label="SWAP" />
          </Tabs>
        </Box>
        <CustomTabPanel value={value} index={0}>
          <SendPanel />
        </CustomTabPanel>
        <CustomTabPanel value={value} index={1}>
          <ReceivePanel />
        </CustomTabPanel>
        <CustomTabPanel value={value} index={2}>
          <SwapPanel />
        </CustomTabPanel>
      </div>
    </>
  );
}
