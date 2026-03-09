/**
 * AccountSwitcher.tsx — MetaMask-style account selector dropdown
 *
 * Features:
 *  - Identicon-style colored avatar (deterministic from address)
 *  - Account name + short address in header
 *  - Dropdown with all accounts, quick switch, address copy
 *  - Derive new account / import wallet inline
 */

import React, { useState, useRef } from "react";
import {
  Box,
  Avatar,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  TextField,
  Chip,
} from "@mui/material";
import {
  ExpandMore,
  ContentCopy,
  Check,
  Add,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import { useActiveAccount } from "../ActiveAccountProvider.js";
import { useToast } from "./ToastProvider.js";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Account from "../backend/Account.js";

// ─── Deterministic color from address string ────────────────────────
function addressToColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 50%)`;
}

function addressToGradient(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 40 + Math.abs((hash >> 8) % 60)) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 70%, 55%), hsl(${hue2}, 60%, 45%))`;
}

// ─── Component ──────────────────────────────────────────────────────

function AccountSwitcher() {
  const { t } = useTranslation();
  const wallet = React.useContext(WalletContext);
  const { activeIndex, activeAccount, setActiveIndex } = useActiveAccount();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // Copy feedback per-account
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Add account dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importKey, setImportKey] = useState("");

  if (!wallet) return null;

  const accounts = wallet.accountManager.GetAll();
  const address = activeAccount?.GetAddress() ?? "";
  const shortAddr = activeAccount?.GetShortAddress() ?? "0x000...";
  const accountName = activeAccount?.GetName() ?? t("accountSwitcher.noAccount");

  // ─── Handlers ────

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setCopiedIndex(null);
  };

  const handleSwitch = (idx: number) => {
    setActiveIndex(idx);
    handleClose();
  };

  const handleCopy = async (addr: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedIndex(idx);
      showToast(t("accountSwitcher.addressCopied"), "success");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      showToast(t("accountSwitcher.copyFailed"), "error");
    }
  };

  const handleCreateNew = () => {
    try {
      const newIndex = wallet.accountManager.DeriveNewAccount();
      setActiveIndex(newIndex);
      showToast(t("accountSwitcher.accountCreated"), "success");
      setAddDialogOpen(false);
      handleClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleImport = () => {
    try {
      const key = importKey.trim();
      if (!key) return;

      let index = -1;
      if (key.includes(" ")) {
        index = wallet.accountManager.ImportAccount(key);
      } else {
        index = wallet.accountManager.ImportPrivateKey(key, "Imported Account");
      }

      if (index === -1) throw new Error("Failed to import account.");
      setActiveIndex(index);
      showToast(t("accountSwitcher.accountImported"), "success");
      setAddDialogOpen(false);
      setIsImporting(false);
      setImportKey("");
      handleClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <>
      {/* ── Trigger Button ── */}
      <Box
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        aria-label={t("accountSwitcher.switchAccount")}
        aria-haspopup="true"
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpen(e as unknown as React.MouseEvent<HTMLElement>); } }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          px: 1.5,
          py: 0.75,
          borderRadius: 3,
          transition: "all 0.2s ease",
          "&:hover": {
            bgcolor: "rgba(37, 99, 235, 0.06)",
          },
          userSelect: "none",
        }}
      >
        {/* Identicon Avatar */}
        <Avatar
          sx={{
            width: 28,
            height: 28,
            background: addressToGradient(address),
            fontSize: "0.75rem",
            fontWeight: 800,
            color: "#fff",
            border: "2px solid",
            borderColor: "divider",
          }}
        >
          {accountName.charAt(0).toUpperCase()}
        </Avatar>

        {/* Name + Address */}
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              fontSize: "0.8rem",
              lineHeight: 1.2,
              color: "text.primary",
              maxWidth: 100,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {accountName}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.65rem",
              lineHeight: 1.2,
              color: "text.secondary",
              opacity: 0.8,
            }}
          >
            {shortAddr}
          </Typography>
        </Box>

        {/* Chevron */}
        <ExpandMore
          sx={{
            fontSize: 18,
            color: "text.secondary",
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Box>

      {/* ── Dropdown Menu ── */}
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "center", vertical: "top" }}
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              mt: 1,
              minWidth: 260,
              maxWidth: 320,
              maxHeight: 400,
              boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
              border: "1px solid",
              borderColor: "divider",
            },
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 1 }}>
            {t("accountSwitcher.myAccounts")}
          </Typography>
        </Box>

        <Divider />

        {/* Account List */}
        {accounts.map((acc: Account, idx: number) => {
          const accAddr = acc.GetAddress() ?? "";
          const accShort = acc.GetShortAddress() ?? "0x000...";
          const isSelected = idx === activeIndex;

          return (
            <MenuItem
              key={idx}
              onClick={() => handleSwitch(idx)}
              selected={isSelected}
              sx={{
                py: 1.25,
                px: 2,
                borderRadius: 0,
                "&.Mui-selected": {
                  bgcolor: "rgba(37, 99, 235, 0.06)",
                  "&:hover": { bgcolor: "rgba(37, 99, 235, 0.1)" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    background: addressToGradient(accAddr),
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    color: "#fff",
                    border: isSelected ? "2px solid" : "none",
                    borderColor: "primary.main",
                  }}
                >
                  {acc.GetName().charAt(0).toUpperCase()}
                </Avatar>
              </ListItemIcon>

              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography variant="body2" fontWeight={isSelected ? 700 : 600} sx={{ fontSize: "0.82rem" }}>
                      {acc.GetName()}
                    </Typography>
                    {isSelected && (
                      <Chip
                        label={t("accountSwitcher.active")}
                        size="small"
                        color="primary"
                        sx={{
                          height: 16,
                          fontSize: "0.55rem",
                          fontWeight: 800,
                          "& .MuiChip-label": { px: 0.5 },
                        }}
                      />
                    )}
                  </Box>
                }
                secondary={accShort}
                secondaryTypographyProps={{ fontSize: "0.7rem", color: "text.secondary" }}
              />

              {/* Copy Address Button */}
              <Tooltip title={copiedIndex === idx ? t("accountSwitcher.copied") : t("accountSwitcher.copyAddress")} arrow>
                <IconButton
                  size="small"
                  onClick={(e) => handleCopy(accAddr, idx, e)}
                  aria-label={t("accountSwitcher.copyAddress")}
                  sx={{
                    ml: 0.5,
                    width: 28,
                    height: 28,
                    color: copiedIndex === idx ? "success.main" : "text.secondary",
                    "&:hover": { color: "primary.main" },
                  }}
                >
                  {copiedIndex === idx ? <Check sx={{ fontSize: 14 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
                </IconButton>
              </Tooltip>
            </MenuItem>
          );
        })}

        <Divider sx={{ my: 0.5 }} />

        {/* Add Account */}
        {wallet.accountManager.CanDeriveNewAccount() && (
          <MenuItem
            onClick={() => setAddDialogOpen(true)}
            sx={{ py: 1.25, px: 2, color: "primary.main" }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: "primary.main" }}>
              <Add sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary={t("accountSwitcher.addAccount")}
              primaryTypographyProps={{ fontWeight: 700, fontSize: "0.82rem" }}
            />
          </MenuItem>
        )}

        <Divider sx={{ my: 0.5 }} />

        {/* Settings */}
        <MenuItem
          onClick={() => { handleClose(); navigate("/settings"); }}
          sx={{ py: 1.25, px: 2, color: "text.secondary" }}
        >
          <ListItemIcon sx={{ minWidth: 40, color: "text.secondary" }}>
            <SettingsIcon sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary={t("accountSwitcher.settings")}
            primaryTypographyProps={{ fontWeight: 600, fontSize: "0.82rem" }}
          />
        </MenuItem>
      </Menu>

      {/* ── Add / Import Dialog ── */}
      <Dialog
        open={addDialogOpen}
        onClose={() => { setAddDialogOpen(false); setIsImporting(false); setImportKey(""); }}
        aria-labelledby="account-add-dialog-title"
        PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 300 } }}
      >
        <DialogTitle id="account-add-dialog-title" sx={{ fontWeight: 700, pb: 1 }}>
          {isImporting ? t("accountSwitcher.importWallet") : t("accountSwitcher.addNewAccount")}
        </DialogTitle>
        <DialogContent>
          {!isImporting ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={handleCreateNew}
                sx={{ borderRadius: 3, textTransform: "none", py: 1.5 }}
              >
                {t("accountSwitcher.deriveNew")}
              </Button>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                onClick={() => setIsImporting(true)}
                sx={{ borderRadius: 3, textTransform: "none", py: 1.5 }}
              >
                {t("accountSwitcher.importExisting")}
              </Button>
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t("accountSwitcher.importDescription")}
              </Typography>
              <TextField
                fullWidth
                label={t("accountSwitcher.importLabel")}
                variant="outlined"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                type="password"
                autoComplete="off"
                sx={{ mb: 3 }}
              />
              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={handleImport}
                disabled={!importKey.trim()}
                sx={{ borderRadius: 3, textTransform: "none", py: 1.5 }}
              >
                {t("accountSwitcher.importButton")}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default React.memo(AccountSwitcher);
