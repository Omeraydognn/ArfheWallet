import { useEffect, useState } from "react";
import { Button, Drawer, FormControl, InputLabel, MenuItem, Select, Alert, Typography, Box, Card, Paper, List, ListItem, ListItemButton, ListItemText, ListItemIcon, Icon, Tooltip, Avatar, Chip, Stack, SvgIcon, IconButton } from "@mui/material";
import "./Home.css";
import { Label, Check, Circle, ContentCopy } from "@mui/icons-material";
import { LineChart } from "@mui/x-charts";
import { AppContext, WalletContext } from "../AppContext.js";
import { ActiveAccountContext, ActiveAccountContextType } from "../ActiveAccountProvider.js";
import ArfGraph from "../components/ArfGraph.js";
import { TokenBalance } from "../backend/Network.js";
import { TokenCacheItem } from "../backend/TokenCache.js";
import * as React from "react";
import ArfButton from "../components/ArfButton";
import { useNavigate } from "react-router";

const NETWORK_NAMES = [
  "UNKNOWN",
  "Ethereum",
  "Zama.ai",
  "Fhenix",
]

const NETWORK_AVATAR_SRC = [
  "",
  "eth.png",
  "discorvery.png",
  "discorvery.png",
]

const TOKENS = [
  { name: "ETH", icon: "eth.png", contract: "ETH" },
  { name: "USDT", icon: "usdt.png", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { name: "ARF", icon: "coin.svg", contract: "0xYourArfContract" },
];

const demoData = [
  { x: 0, y: 2 },
  { x: 1, y: 5.5 },
  { x: 2, y: 2 },
  { x: 3, y: 8.5 },
  { x: 4, y: 1.5 },
  { x: 5, y: 5 },
];

function Home() {
  const wallet_context = React.useContext<AppContext | undefined>(WalletContext);
  if (!wallet_context)
    return;

  const active_context = React.useContext<ActiveAccountContextType | undefined>(ActiveAccountContext);
  if (!active_context)
    return;

  const navigate = useNavigate();

  const [network, setNetwork] = React.useState(4);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [tokens, setTokens] = useState<TokenCacheItem[]>([]);

  const handleNetworkChange = (event: any) => {
    setNetwork(event.target.value)
  };

  useEffect(() => {
    async function fetchBalances() {
      try {
        const net = wallet_context?.networkProvider.getSepoliaNetwork();
        if (!net) return;

        const address = active_context?.activeAccount?.GetAddress();
        if (!address) return;

        const tokenBalances: TokenBalance[] = await net.getTokenBalances(
          wallet_context?.tokenCache, address
        );

        // Map balances by contract/name
        const balanceMap: Record<string, string> = {};
        tokenBalances.forEach((tb) => {
          balanceMap[tb.contractAddress] = tb.tokenBalance;
        });

        setBalances(balanceMap);

        const cached = wallet_context?.tokenCache.getAllTokens(network) ?? [];
        setTokens(cached);
      } catch (err) {
        console.error("Error fetching balances:", err);
      }
    }

    fetchBalances();
  }, [active_context.activeAccount]);

  return (
    <div className='home'>

      { 
      /*
        <Paper elevation={2}>
          <Alert icon={<Check fontSize="inherit" />} severity="success" >
            The USDT transfer of 10.00 from 0x0000..00aa to 0xf33f..d00d is successful. 
            TX ID: 0x012301230123012301230123123
            <Button>
              CHECK
            </Button>
          </Alert>
        </Paper>
        */
      }

      <Box sx={{ padding: 2 }} className="infobox">
        {/* text section (with padding) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="h3" fontWeight={700}>
            $0.00
          </Typography>
          <Typography variant="body1" color="success.main" fontWeight={700}>
            +0.00 (0%)
          </Typography>
        </Box>

        {/* graph section (full width, ignoring padding) */}
        
        <Box sx={{ mx: -2, mb: -2 }}> 
          <ArfGraph data={demoData}/>
        </Box>
        
      </Box>

      <Box className="options-list">
        <Stack direction="row" >

          <ArfButton icon={
            <SvgIcon>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                <path d="M267 48C230.6 48 209.2 106.3 198.7 160L168 160C154.7 160 144 170.7 144 184C144 197.3 154.7 208 168 208L192 208L192 240C192 257 195.3 273.2 201.3 288L192 288L192 288L171.5 288C156.3 288 144 300.3 144 315.5C144 318.5 144.5 321.4 145.4 324.2L174.3 410.8C136.2 443.6 112 492.1 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 492.1 503.8 443.6 465.7 410.9L494.6 324.3C495.5 321.5 496 318.6 496 315.6C496 300.4 483.7 288.1 468.5 288.1L448 288.1L448 288.1L438.7 288.1C444.7 273.3 448 257.1 448 240.1L448 208.1L472 208.1C485.3 208.1 496 197.4 496 184.1C496 170.8 485.3 160.1 472 160.1L441.3 160.1C430.9 106.4 409.4 48.1 373 48.1C363.4 48.1 354 52 345.5 56.3C337.3 60.4 327.1 64.1 320 64.1C312.9 64.1 302.7 60.4 294.5 56.3C286 51.9 276.6 48 267 48zM360.7 532.4L335.9 461.5L363.8 429C366.5 425.8 368 421.8 368 417.6C368 407.9 360.2 400.1 350.5 400.1L289.5 400.1C279.8 400.1 272 407.9 272 417.6C272 421.8 273.5 425.8 276.2 429L304.1 461.5L279.3 532.4L222.3 352L258 352C276.4 362.2 297.5 368 320 368C342.5 368 363.6 362.2 382 352L417.7 352L360.7 532.4zM320 320C285.3 320 255.8 297.9 244.7 267C250.4 270.2 257 272 264 272L276.4 272C292.9 272 307.5 261.4 312.7 245.8C315 238.8 324.9 238.8 327.2 245.8C332.4 261.4 347.1 272 363.5 272L375.9 272C382.9 272 389.5 270.2 395.2 267C384.1 297.9 354.6 320 319.9 320z"/>
              </svg>
            </SvgIcon>
          } label="Revoke" onClick={(e) => navigate('/revoke')}/>
          <ArfButton icon={
            <SvgIcon>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                <path d="M576 112C576 100.9 570.3 90.6 560.8 84.8C551.3 79 539.6 78.4 529.7 83.4L413.5 141.5L234.1 81.6C226 78.9 217.3 79.5 209.7 83.3L81.7 147.3C70.8 152.8 64 163.9 64 176L64 528C64 539.1 69.7 549.4 79.2 555.2C88.7 561 100.4 561.6 110.3 556.6L226.4 498.5L405.8 558.3C413.9 561 422.6 560.4 430.2 556.6L558.2 492.6C569 487.2 575.9 476.1 575.9 464L575.9 112zM256 440.9L256 156.4L384 199.1L384 483.6L256 440.9z"/>
              </svg>
            </SvgIcon>
          } label="Graph" onClick={(e) => navigate('/graph')}/>
        </Stack>
      </Box>

      <Box className="list">
        { tokens.length === 0 ? (
          <NoAssetsFound />
        ) : (
          <List>
            {tokens.map((token) => (
              <ListItem
                key={token.contractAddress}
                className="list-item"
                secondaryAction={
                  <Typography fontWeight={600} textAlign="right">
                    {balances[token.contractAddress] ?? "0.00"}
                  </Typography>
                }
              >
                <ListItemIcon>
                  <Avatar src={token.logoSrc} />
                </ListItemIcon>
                <ListItemText primary={token.symbol} secondary={token.name} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

    </div>
  );
}

function NoAssetsFound() {
  return (
    <Box sx={{ p: 3, textAlign: "center" }}>
      <Typography variant="h6" color="text.secondary">
        No assets found
      </Typography>
    </Box>
  );
}


export default Home;