/**
 * BuyPanel.tsx — Fiat On-Ramp Purchase Panel
 *
 * Provider selection (MoonPay, Transak, Ramp), fiat amount input,
 * crypto/fiat currency selectors, and deep-link redirect.
 */

import React, { useState, useContext, useMemo } from "react";
import {
    Box,
    Typography,
    Stack,
    Button,
    TextField,
    Paper,
    Chip,
    Avatar,
    InputAdornment,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    alpha,
    useTheme,
    Fade,
    Divider,
    IconButton,
} from "@mui/material";
import {
    ShoppingCart,
    OpenInNew,
    ArrowForward,
    CheckCircle,
    Security,
    Schedule,
    Info,
} from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import {
    ONRAMP_PROVIDERS,
    SUPPORTED_FIAT_CURRENCIES,
    detectFiatCurrency,
    openOnRamp,
    OnRampProvider,
    OnRampProviderInfo,
} from "../backend/FiatOnRampService.js";
import { useTranslation } from "react-i18next";

// ─── Popular Quick-Select Amounts ──────────────────────────────────
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];

// ─── Buyable Crypto Assets ─────────────────────────────────────────
const CRYPTO_OPTIONS = [
    { code: "ETH", name: "Ethereum", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png" },
    { code: "USDC", name: "USD Coin", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png" },
    { code: "USDT", name: "Tether", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png" },
    { code: "DAI", name: "Dai", icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png" },
];

export default function BuyPanel() {
    const { t } = useTranslation();
    const theme = useTheme();
    const context = useContext(WalletContext);

    // State
    const [selectedProvider, setSelectedProvider] = useState<OnRampProvider>("moonpay");
    const [fiatAmount, setFiatAmount] = useState<string>("100");
    const [fiatCurrency, setFiatCurrency] = useState<string>(() => detectFiatCurrency());
    const [cryptoCurrency, setCryptoCurrency] = useState<string>("ETH");
    const [purchased, setPurchased] = useState(false);

    const activeAccount = context?.accountManager?.GetActive();
    const walletAddress = activeAccount?.GetAddress() ?? "";
    const network = context?.networkProvider?.getActiveNetwork();
    const chainId = (network?.network_id as number) || 1;

    const providerInfo = useMemo(
        () => ONRAMP_PROVIDERS.find(p => p.id === selectedProvider)!,
        [selectedProvider]
    );

    const fiatSymbol = SUPPORTED_FIAT_CURRENCIES.find(c => c.code === fiatCurrency)?.symbol || "$";

    const handleBuy = () => {
        if (!walletAddress) return;

        openOnRamp(selectedProvider, {
            walletAddress,
            fiatCurrency,
            fiatAmount: parseFloat(fiatAmount) || 100,
            cryptoCurrency,
            chainId,
        });

        setPurchased(true);
        setTimeout(() => setPurchased(false), 5000);
    };

    return (
        <Box>
            {/* ─── Header ─── */}
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <ShoppingCart sx={{ fontSize: 20, color: "primary.main" }} />
                <Typography variant="subtitle1" fontWeight={700}>
                    {t("buy.title")}
                </Typography>
            </Stack>

            {/* ─── Provider Selection ─── */}
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: "block", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {t("buy.selectProvider")}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2.5, overflowX: "auto", pb: 0.5 }}>
                {ONRAMP_PROVIDERS.map((provider) => (
                    <ProviderCard
                        key={provider.id}
                        provider={provider}
                        selected={selectedProvider === provider.id}
                        onClick={() => setSelectedProvider(provider.id)}
                    />
                ))}
            </Stack>

            {/* ─── Amount Input ─── */}
            <Paper
                elevation={0}
                sx={{
                    p: 2,
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: alpha(theme.palette.primary.main, 0.15),
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                    mb: 2,
                }}
            >
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    {/* Fiat Amount */}
                    <TextField
                        label={t("buy.amount")}
                        value={fiatAmount}
                        onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, "");
                            setFiatAmount(val);
                        }}
                        placeholder={t("buy.amountPlaceholder")}
                        variant="outlined"
                        size="small"
                        sx={{ flex: 1 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Typography fontWeight={700} color="text.secondary">{fiatSymbol}</Typography>
                                </InputAdornment>
                            ),
                        }}
                    />
                    {/* Fiat Currency */}
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                        <InputLabel>{t("buy.fiatCurrency")}</InputLabel>
                        <Select
                            value={fiatCurrency}
                            onChange={(e) => setFiatCurrency(e.target.value)}
                            label={t("buy.fiatCurrency")}
                        >
                            {SUPPORTED_FIAT_CURRENCIES.map((c) => (
                                <MenuItem key={c.code} value={c.code}>
                                    {c.symbol} {c.code}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>

                {/* Quick Amounts */}
                <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: "wrap", gap: 0.5 }}>
                    {QUICK_AMOUNTS.map((amt) => (
                        <Chip
                            key={amt}
                            label={`${fiatSymbol}${amt}`}
                            size="small"
                            variant={fiatAmount === String(amt) ? "filled" : "outlined"}
                            color={fiatAmount === String(amt) ? "primary" : "default"}
                            onClick={() => setFiatAmount(String(amt))}
                            sx={{ fontWeight: 600, fontSize: "0.75rem" }}
                        />
                    ))}
                </Stack>
            </Paper>

            {/* ─── Crypto Selector ─── */}
            <Paper
                elevation={0}
                sx={{
                    p: 2,
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    mb: 2,
                }}
            >
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: "block", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {t("buy.selectCrypto")}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {CRYPTO_OPTIONS.map((c) => (
                        <Chip
                            key={c.code}
                            avatar={<Avatar src={c.icon} sx={{ width: 20, height: 20 }} />}
                            label={c.code}
                            size="small"
                            variant={cryptoCurrency === c.code ? "filled" : "outlined"}
                            color={cryptoCurrency === c.code ? "primary" : "default"}
                            onClick={() => setCryptoCurrency(c.code)}
                            sx={{ fontWeight: 600, fontSize: "0.75rem" }}
                        />
                    ))}
                </Stack>
            </Paper>

            {/* ─── Provider Summary Card ─── */}
            <Paper
                elevation={0}
                sx={{
                    p: 2,
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: alpha(providerInfo.color, 0.3),
                    bgcolor: alpha(providerInfo.color, 0.04),
                    mb: 2,
                }}
            >
                <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography fontSize="1.5rem">{providerInfo.logo}</Typography>
                            <Box>
                                <Typography fontWeight={700} fontSize={14}>{providerInfo.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{providerInfo.description}</Typography>
                            </Box>
                        </Stack>
                    </Stack>

                    <Divider sx={{ my: 0.5 }} />

                    <Stack direction="row" justifyContent="space-between">
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Schedule sx={{ fontSize: 14, color: "text.secondary" }} />
                            <Typography variant="caption" color="text.secondary">
                                {t("buy.processingTime")}
                            </Typography>
                        </Stack>
                        <Chip
                            label={`${t("buy.fees")}: ${providerInfo.fees}`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600 }}
                        />
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Security sx={{ fontSize: 14, color: "success.main" }} />
                        <Typography variant="caption" color="text.secondary">
                            {t("buy.secureCheckout", { provider: providerInfo.name })}
                        </Typography>
                    </Stack>

                    {/* ─── Provider-specific status notes ─── */}
                    {selectedProvider === "moonpay" && (
                        <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mt: 0.5, p: 1, borderRadius: 1.5, bgcolor: alpha("#ff9800", 0.08) }}>
                            <Info sx={{ fontSize: 14, color: "warning.main", mt: 0.2 }} />
                            <Typography variant="caption" color="warning.main" sx={{ fontSize: "0.68rem", lineHeight: 1.4 }}>
                                {t("buy.moonpayNote")}
                            </Typography>
                        </Stack>
                    )}
                    {selectedProvider === "transak" && (
                        <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mt: 0.5, p: 1, borderRadius: 1.5, bgcolor: alpha("#2196f3", 0.08) }}>
                            <Info sx={{ fontSize: 14, color: "info.main", mt: 0.2 }} />
                            <Typography variant="caption" color="info.main" sx={{ fontSize: "0.68rem", lineHeight: 1.4 }}>
                                {t("buy.transakNote")}
                            </Typography>
                        </Stack>
                    )}
                    {selectedProvider === "ramp" && (
                        <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mt: 0.5, p: 1, borderRadius: 1.5, bgcolor: alpha("#4caf50", 0.08) }}>
                            <Info sx={{ fontSize: 14, color: "success.main", mt: 0.2 }} />
                            <Typography variant="caption" color="success.main" sx={{ fontSize: "0.68rem", lineHeight: 1.4 }}>
                                {t("buy.rampNote")}
                            </Typography>
                        </Stack>
                    )}
                </Stack>
            </Paper>

            {/* ─── Buy Button ─── */}
            <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleBuy}
                disabled={!walletAddress || !fiatAmount || parseFloat(fiatAmount) <= 0}
                endIcon={purchased ? <CheckCircle /> : <OpenInNew />}
                sx={{
                    borderRadius: 3,
                    py: 1.5,
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    textTransform: "none",
                    color: "#eff6ff",
                    background: purchased
                        ? `linear-gradient(135deg, #10b981 0%, #059669 100%)`
                        : `linear-gradient(135deg, ${providerInfo.color} 0%, ${alpha(providerInfo.color, 0.8)} 100%)`,
                    boxShadow: `0 4px 14px ${alpha(providerInfo.color, 0.35)}`,
                    transition: "all 0.2s",
                    "&:hover": {
                        boxShadow: `0 8px 24px ${alpha(providerInfo.color, 0.4)}`,
                        transform: "translateY(-1px)",
                    },
                    "&.Mui-disabled": {
                        background: theme.palette.mode === "dark"
                            ? "linear-gradient(135deg, #0b1120 0%, #172554 100%)"
                            : "linear-gradient(135deg, #bfdbfe 0%, #dbeafe 100%)",
                        color: theme.palette.mode === "dark" ? "#1e3a8a" : "#3b82f6",
                        boxShadow: "none",
                    },
                }}
            >
                {purchased
                    ? t("common.success")
                    : `${t("buy.buyNow")} — ${fiatSymbol}${fiatAmount || "0"} ${cryptoCurrency}`
                }
            </Button>

            {/* ─── Redirect Note ─── */}
            <Fade in={!purchased}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", textAlign: "center", mt: 1.5, fontSize: "0.7rem" }}
                >
                    {t("buy.poweredBy", { provider: providerInfo.name })}
                </Typography>
            </Fade>
        </Box>
    );
}

// ─── Provider Selection Card ───────────────────────────────────────

function ProviderCard({
    provider,
    selected,
    onClick,
}: {
    provider: OnRampProviderInfo;
    selected: boolean;
    onClick: () => void;
}) {
    const theme = useTheme();

    return (
        <Paper
            elevation={0}
            onClick={onClick}
            sx={{
                p: 1.5,
                borderRadius: 2.5,
                border: "2px solid",
                borderColor: selected ? provider.color : "divider",
                bgcolor: selected ? alpha(provider.color, 0.06) : "transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                minWidth: 110,
                textAlign: "center",
                position: "relative",
                "&:hover": {
                    borderColor: alpha(provider.color, 0.6),
                    bgcolor: alpha(provider.color, 0.04),
                    transform: "translateY(-2px)",
                },
            }}
        >
            {selected && (
                <CheckCircle
                    sx={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        fontSize: 16,
                        color: provider.color,
                    }}
                />
            )}
            <Typography fontSize="1.6rem" sx={{ mb: 0.5 }}>
                {provider.logo}
            </Typography>
            <Typography fontWeight={700} fontSize={12} noWrap>
                {provider.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontSize={10}>
                {provider.fees}
            </Typography>
        </Paper>
    );
}
