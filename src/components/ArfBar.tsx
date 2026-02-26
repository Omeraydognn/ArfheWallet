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
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
} from "@mui/material";
import { Menu } from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import { useToast } from "./ToastProvider.js";
import "./ArfBar.css";
import Account from "../backend/Account.js";


const NETWORK_AVATAR_SRC = ["", "eth.png", "discorvery.png", "discorvery.png"];

import { useNavigate } from "react-router";
import { Settings as SettingsIcon, Add } from "@mui/icons-material"; // Add icons

function AccountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallet = React.useContext(WalletContext);
  const { activeIndex, activeAccount, setActiveIndex } = useActiveAccount();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [isAddModalOpen, setAddModalOpen] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importKey, setImportKey] = React.useState("");

  if (!wallet) return null;

  const accounts = wallet.accountManager.GetAll();

  const handleCreateNew = () => {
    try {
      const newIndex = wallet.accountManager.DeriveNewAccount();
      setActiveIndex(newIndex);
      showToast("New account derived successfully!", "success");
      setAddModalOpen(false);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  const handleImport = () => {
    try {
      const key = importKey.trim();
      if (!key) return;

      let index = -1;
      if (key.includes(" ")) {
        // Assume mnemonic if it contains spaces
        index = wallet.accountManager.ImportAccount(key);
      } else {
        // Otherwise, assume private key
        index = wallet.accountManager.ImportPrivateKey(key, "Imported Account");
      }

      if (index === -1) throw new Error("Failed to import account. Invalid key or already exists.");
      setActiveIndex(index);
      showToast("Account imported successfully!", "success");
      setAddModalOpen(false);
      setIsImporting(false);
      setImportKey("");
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

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
                    secondary={acc.GetShortAddress() ?? "0x000..."}
                    primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: 12 }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        <Box sx={{ p: 2, mt: "auto" }}>
          {wallet.accountManager.CanDeriveNewAccount() && (
            <Button
              variant="outlined"
              fullWidth
              startIcon={<Add />}
              onClick={() => setAddModalOpen(true)}
              sx={{ mb: 1, borderRadius: 3, textTransform: 'none' }}
            >
              Add Account
            </Button>
          )}

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

      <Dialog open={isAddModalOpen} onClose={() => { setAddModalOpen(false); setIsImporting(false); }} PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 320 } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          {isImporting ? "Import Wallet" : "Add Account"}
        </DialogTitle>
        <DialogContent>
          {!isImporting ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Button variant="contained" fullWidth size="large" onClick={handleCreateNew} sx={{ borderRadius: 3, textTransform: 'none', py: 1.5 }}>
                Create New Account
              </Button>
              <Button variant="outlined" fullWidth size="large" onClick={() => setIsImporting(true)} sx={{ borderRadius: 3, textTransform: 'none', py: 1.5 }}>
                Import Wallet
              </Button>
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Enter your Private Key or 12-word Secret Recovery Phrase to import an external account.
              </Typography>
              <TextField
                fullWidth
                label="Private Key / Recovery Phrase"
                variant="outlined"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                sx={{ mb: 3 }}
              />
              <Button variant="contained" fullWidth size="large" onClick={handleImport} sx={{ borderRadius: 3, textTransform: 'none', py: 1.5 }}>
                Import
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>
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
