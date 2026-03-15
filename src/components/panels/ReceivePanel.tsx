import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import {
  Box,
  Stack,
  Button,
  Typography,
  Paper,
  Chip,
} from "@mui/material";
import {
  ContentCopy,
  CheckCircle,
  CallReceived,
  Share as ShareIcon,
} from "@mui/icons-material";
import { WalletContext } from "../../AppContext.js";
import { useToast } from "../ToastProvider";
import { NetworkId } from "../../backend/NetworkTypes.js";
import { inputCardSx } from "./shared.js";

// --- Receive Panel ---
export default function ReceivePanel() {
  const { t } = useTranslation();
  const context = useContext(WalletContext);
  const address = context?.accountManager?.GetActive()?.GetAddress() ?? "";
  const accountName = context?.accountManager?.GetActive()?.GetName() ?? "";
  const activeNetworkId = context?.networkProvider?.getActiveNetworkId() ?? NetworkId.Ethereum_Mainnet;
  const activeNetwork = context?.networkProvider?.getActiveNetwork();
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  // Network display info
  const networkName = activeNetwork?.network_name ?? "Unknown";
  const networkColor = activeNetworkId === NetworkId.Ethereum_Mainnet ? '#10b981' :
    activeNetworkId === NetworkId.Ethereum_Sepolia ? '#f59e0b' :
    activeNetworkId === NetworkId.Arbitrum_One ? '#2563eb' :
    activeNetworkId === NetworkId.Arbitrum_Sepolia ? '#60a5fa' :
    activeNetworkId === NetworkId.Base_Mainnet ? '#0052ff' :
    activeNetworkId === NetworkId.Base_Sepolia ? '#93c5fd' : '#404040';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      showToast(t("receive.addressCopied"), "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t("receive.copyFailed"), "error");
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: t("receive.shareTitle"),
      text: `${accountName}\n${address}\n${networkName}`,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(address);
        showToast(t("receive.addressCopied"), "success");
      }
    } catch {
      // user cancelled share — ignore
    }
  };

  // Format address in chunks for readability
  const formatAddress = (addr: string): string[] => {
    if (!addr || addr.length < 10) return [addr];
    // Split into groups: 0x + 4 groups of 8 + last part
    const clean = addr.slice(2); // remove 0x
    const chunks: string[] = [];
    for (let i = 0; i < clean.length; i += 8) {
      chunks.push(clean.slice(i, i + 8));
    }
    return chunks;
  };

  const addressChunks = formatAddress(address);

  return (
    <Box sx={{ textAlign: 'center' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ mb: 0.25 }}>
        <CallReceived sx={{ fontSize: 14, color: 'primary.main' }} />
        <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.8rem' }}>
          {t("receive.title")}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, fontSize: '0.65rem' }}>
        {t("receive.description")}
      </Typography>

      {/* QR Code — local generation */}
      <Paper elevation={0} sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        p: 1,
        borderRadius: 2.5,
        mb: 0.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#ffffff',
      }}>
        <QRCodeSVG
          value={address || "0x"}
          size={120}
          level="M"
          marginSize={1}
          imageSettings={{
            src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%236366f1'/%3E%3Ctext x='12' y='16' text-anchor='middle' fill='white' font-size='12' font-weight='bold'%3EA%3C/text%3E%3C/svg%3E",
            width: 24,
            height: 24,
            excavate: true,
          }}
        />
      </Paper>

      {/* Account Name + Network Badge */}
      <Stack alignItems="center" spacing={0.25} sx={{ mb: 0.5 }}>
        {accountName && (
          <Typography variant="body2" fontWeight={700} sx={{ color: 'text.primary' }}>
            {accountName}
          </Typography>
        )}
        <Chip
          icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: networkColor, flexShrink: 0 }} />}
          label={networkName}
          size="small"
          sx={{
            fontWeight: 600,
            fontSize: '0.65rem',
            height: 20,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            '& .MuiChip-icon': { ml: 1 },
          }}
        />
      </Stack>

      {/* Address Display — chunked for readability */}
      <Paper elevation={0} sx={{
        ...inputCardSx,
        p: 1,
        cursor: 'pointer',
        '&:active': { transform: 'scale(0.99)' },
        mb: 0.75,
      }} onClick={handleCopy}>
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.72rem',
            color: 'text.secondary',
            lineHeight: 1.6,
            letterSpacing: '0.5px',
            wordBreak: 'break-all',
            textAlign: 'center',
          }}
        >
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>0x</Box>
          {addressChunks.map((chunk, i) => (
            <React.Fragment key={i}>
              {chunk}
              {i < addressChunks.length - 1 && ' '}
            </React.Fragment>
          ))}
        </Typography>
      </Paper>

      {/* Action Buttons */}
      <Stack direction="row" spacing={1} justifyContent="center">
        <Button
          variant="contained"
          startIcon={copied ? <CheckCircle sx={{ fontSize: 13 }} /> : <ContentCopy sx={{ fontSize: 13 }} />}
          onClick={handleCopy}
          color={copied ? "success" : "primary"}
          sx={{
            flex: 1,
            borderRadius: 2.5,
            height: 34,
            fontWeight: 700,
            fontSize: '0.72rem',
            textTransform: 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {copied ? t("receive.copied") : t("receive.copyAddress")}
        </Button>
        <Button
          variant="outlined"
          startIcon={<ShareIcon sx={{ fontSize: 13 }} />}
          onClick={handleShare}
          sx={{
            flex: 1,
            borderRadius: 2.5,
            height: 34,
            fontWeight: 700,
            fontSize: '0.72rem',
            textTransform: 'none',
          }}
        >
          {t("receive.share")}
        </Button>
      </Stack>

      {/* Warning */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: '0.58rem', opacity: 0.7 }}>
        {t("receive.warning", { network: networkName })}
      </Typography>
    </Box>
  );
}
