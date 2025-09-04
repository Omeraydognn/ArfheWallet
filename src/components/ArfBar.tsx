import React from "react";
import {
  AppBar,
  Box,
  Button,
  Toolbar,
  Typography,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Drawer,
  Avatar,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
} from "@mui/material";
import { Menu } from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import "./ArfBar.css";

const NETWORK_NAMES = ["UNKNOWN", "Ethereum", "Zama.ai", "Fhenix"];
const NETWORK_AVATAR_SRC = ["", "eth.png", "discorvery.png", "discorvery.png"];

function AccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallet = React.useContext(WalletContext);
  const { activeIndex, activeAccount, setActiveIndex } = useActiveAccount();

  if (!wallet) return null;

  const accounts = wallet.accountManager.GetAll();

  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Box sx={{ width: 280, display: "flex", flexDirection: "column", height: "100%" }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Accounts
          </Typography>
          <Divider />
          <List>
            {accounts.map((acc, idx) => (
              <ListItem key={idx} disablePadding>
                <ListItemButton
                  selected={idx === activeIndex}
                  onClick={() => {
                    setActiveIndex(idx);
                    onClose();
                  }}
                >
                  <ListItemText
                    primary={acc.GetName()}
                    secondary={acc.GetPublicKey()}
                    primaryTypographyProps={{ fontSize: 14 }}
                    secondaryTypographyProps={{ fontSize: 12, noWrap: true }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        <Box sx={{ p: 2, mt: "auto" }}>
          <Button
            variant="contained"
            fullWidth
            onClick={() => {
              const newIndex = wallet.accountManager.CreateAccount();
              setActiveIndex(newIndex);
            }}
          >
            Add Account
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}

function ArfBar({ network, setNetwork }: { network: any; setNetwork: any }) {
  const wallet = React.useContext(WalletContext);
  const { activeIndex, activeAccount } = useActiveAccount();

  const [networkDrawerOpen, setNetworkDrawerOpen] = React.useState(false);
  const [accountDrawerOpen, setAccountDrawerOpen] = React.useState(false);

  const toggleNetworkDrawer = () => setNetworkDrawerOpen(!networkDrawerOpen);
  const toggleAccountDrawer = () => setAccountDrawerOpen(!accountDrawerOpen);

  if (!wallet) return <Alert severity="error">AppContext is lost</Alert>;

  return (
    <div className="arf-bar">
      {/* Network Drawer */}
      <Drawer anchor="top" open={networkDrawerOpen} onClose={toggleNetworkDrawer}>
        <div className="network-select">
          <FormControl fullWidth>
            <InputLabel id="network-select-label">Network</InputLabel>
            <Select
              labelId="network-select-label"
              id="network-select"
              value={network}
              label="Network"
              onChange={(e) => setNetwork(e.target.value)}
            >
              <MenuItem value={1}>Ethereum</MenuItem>
              <MenuItem value={2}>Zama.ai</MenuItem>
              <MenuItem value={3}>Fhenix</MenuItem>
            </Select>
          </FormControl>
        </div>
      </Drawer>

      {/* Account Drawer */}
      <AccountDrawer open={accountDrawerOpen} onClose={toggleAccountDrawer} />

      {/* AppBar */}
      <Box sx={{ flexGrow: 1 }}>
        <AppBar color="transparent" elevation={0} position="fixed">
          <Toolbar className="arf-toolbar">
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
              onClick={toggleAccountDrawer}
            >
              <Menu />
            </IconButton>

            <Box className="arf-toolbar-name">
              <Typography textAlign="center" fontSize={12}>
                {activeAccount?.GetName() ?? "No Active Account"}
              </Typography>
              <Typography textAlign="center" fontSize={12}>
                {activeAccount?.GetShortKey() ?? "0x000000000"}
              </Typography>
            </Box>

            <Button onClick={toggleNetworkDrawer}>
              <Avatar src={NETWORK_AVATAR_SRC[network] ?? ""} />
            </Button>
          </Toolbar>
        </AppBar>
      </Box>
    </div>
  );
}

export default ArfBar;
