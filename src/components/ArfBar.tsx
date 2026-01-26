import * as React from "react";
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
import Account from "../backend/Account.js";


const NETWORK_AVATAR_SRC = ["", "eth.png", "discorvery.png", "discorvery.png"];

import { useNavigate } from "react-router";
import { Settings as SettingsIcon, Add } from "@mui/icons-material"; // Add icons

function AccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallet = React.useContext(WalletContext);
  const { activeIndex, activeAccount, setActiveIndex } = useActiveAccount();
  const navigate = useNavigate();

  if (!wallet) return null;

  const accounts = wallet.accountManager.GetAll();

  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Box sx={{ width: 280, display: "flex", flexDirection: "column", height: "100%" }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom fontWeight={700}>
            Accounts
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <List>
            {accounts.map((acc: Account, idx: number) => (
              <ListItem key={idx} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  selected={idx === activeIndex}
                  onClick={() => {
                    wallet.accountManager.SetActive(idx);
                    setActiveIndex(idx);
                    onClose();
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  <Avatar sx={{ width: 32, height: 32, mr: 2, bgcolor: idx === activeIndex ? 'primary.main' : 'grey.300' }}>
                    {acc.GetName()[0]}
                  </Avatar>
                  <ListItemText
                    primary={acc.GetName()}
                    secondary={acc.GetAddress().substring(0, 6) + "..." + acc.GetAddress().substring(38)}
                    primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: 12 }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        <Box sx={{ p: 2, mt: "auto" }}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<Add />}
            onClick={() => {
              const newIndex = wallet.accountManager.CreateAccount();
              setActiveIndex(newIndex);
            }}
            sx={{ mb: 1, borderRadius: 3, textTransform: 'none' }}
          >
            Add Account
          </Button>

          <Button
            variant="text"
            fullWidth
            startIcon={<SettingsIcon />}
            onClick={() => {
              navigate('/settings');
              onClose();
            }}
            sx={{ borderRadius: 3, textTransform: 'none', color: 'text.secondary' }}
          >
            Settings
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



      {/* Account Drawer */}
      <AccountDrawer open={accountDrawerOpen} onClose={toggleAccountDrawer} />

      {/* AppBar */}
      <Box sx={{ flexGrow: 1 }}>
        <AppBar color="transparent" elevation={0} position="fixed">
          <Toolbar className="arf-toolbar" sx={{ justifyContent: "center", position: "relative" }}>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ position: "absolute", left: 16 }}
              onClick={toggleAccountDrawer}
            >
              <Menu />
            </IconButton>

            <Box className="arf-toolbar-name" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography textAlign="center" fontSize={14} fontWeight={700}>
                {activeAccount?.GetName() ?? "No Active Account"}
              </Typography>
              <Typography textAlign="center" fontSize={11} color="text.secondary" sx={{ opacity: 0.8 }}>
                {activeAccount?.GetShortAddress() ?? "0x000..."}
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>
      </Box>
    </div>
  );
}

export default ArfBar;
