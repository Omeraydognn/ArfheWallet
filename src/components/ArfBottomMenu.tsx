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
  const [sendAddress, setSendAddress] = React.useState("");
  const [sendToken, setSendToken] = React.useState(0);
  const [sendAmount, setSendAmount] = React.useState(0.0);

  return (
    <Stack direction="column">
      <TextField
        variant="filled"
        label="Send To Address"
        placeholder="0x"
        fullWidth
        value={sendAddress}
        onChange={(e) => setSendAddress(e.target.value)}
      />
      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{
          width: "100%",
          marginTop: "1rem",
          marginBottom: "0.5rem",
        }}
      >
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
          sx={{ marginLeft: "0.5rem" }}
          value={sendAmount}
          onChange={(e) => setSendAmount(parseFloat(e.target.value))}
        />
      </Stack>

      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{ position: "absolute", width: "90%", bottom: "15px" }}
      >
        <Button>CANCEL</Button>
        <Button variant="contained">SEND</Button>
      </Stack>
    </Stack>
  );
}

function ReceivePanel() {
  const wallet = useContext(WalletContext);

  const PUBLIC_KEY = wallet?.accountManager?.GetActive()?.public_key;

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
  const [swapContract, setSwapContract] = React.useState(0); // provider id
  const [fromToken, setFromToken] = React.useState(0);
  const [toToken, setToToken] = React.useState(1);
  const [swapAmount, setSwapAmount] = React.useState(0.0);

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
