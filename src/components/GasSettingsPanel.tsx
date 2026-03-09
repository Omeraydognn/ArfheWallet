/**
 * GasSettingsPanel.tsx — Advanced EIP-1559 Gas Controls
 *
 * Features:
 *  - Base Fee + Priority Fee separate controls
 *  - Gas estimation accuracy indicator
 *  - Network congestion real-time indicator
 *  - Preset modes: Slow / Standard / Fast / Custom
 */

import React, { useState, useEffect, useContext, useCallback } from "react";
import {
    Box,
    Typography,
    Stack,
    Slider,
    Chip,
    Paper,
    alpha,
    useTheme,
    LinearProgress,
    Collapse,
    IconButton,
    Tooltip,
    TextField,
    InputAdornment,
} from "@mui/material";
import {
    Speed,
    LocalGasStation,
    ExpandMore,
    ExpandLess,
    TrendingUp,
    TrendingDown,
    TrendingFlat,
    Warning,
} from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import { useTranslation } from "react-i18next";

// ─── Types ──────────────────────────────────────────────────────────

export type GasPreset = "slow" | "standard" | "fast" | "custom";

export interface GasSettings {
    preset: GasPreset;
    maxFeePerGas: number;       // in Gwei
    maxPriorityFee: number;     // in Gwei
    gasLimit: number;
}

export interface NetworkGasInfo {
    baseFee: number;            // in Gwei
    suggestedPriority: number;  // in Gwei
    congestionLevel: "low" | "medium" | "high" | "extreme";
    congestionPercent: number;  // 0-100
    blockNumber: number;
    pendingTxCount?: number;
}

// ─── Gas Presets ────────────────────────────────────────────────────

const PRESET_MULTIPLIERS: Record<Exclude<GasPreset, "custom">, { fee: number; priority: number; label: string; time: string }> = {
    slow:     { fee: 0.9,  priority: 0.8, label: "🐢", time: "~5 min" },
    standard: { fee: 1.0,  priority: 1.0, label: "⚡",  time: "~30 sec" },
    fast:     { fee: 1.3,  priority: 1.5, label: "🚀", time: "~10 sec" },
};

// ─── Component ──────────────────────────────────────────────────────

interface GasSettingsPanelProps {
    onChange?: (settings: GasSettings) => void;
    initialPreset?: GasPreset;
    compact?: boolean;
}

function GasSettingsPanel({
    onChange,
    initialPreset = "standard",
    compact = false,
}: GasSettingsPanelProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const context = useContext(WalletContext);

    const [expanded, setExpanded] = useState(!compact);
    const [preset, setPreset] = useState<GasPreset>(initialPreset);
    const [gasInfo, setGasInfo] = useState<NetworkGasInfo | null>(null);
    const [customMaxFee, setCustomMaxFee] = useState<string>("");
    const [customPriority, setCustomPriority] = useState<string>("");
    const [customGasLimit, setCustomGasLimit] = useState<string>("21000");

    // Fetch live gas data
    const fetchGasInfo = useCallback(async () => {
        const network = context?.networkProvider?.getActiveNetwork();
        if (!network) return;

        try {
            const { JsonRpcProvider } = await import("ethers");
            const provider = new JsonRpcProvider(network.rpc_url);

            const [feeData, block] = await Promise.all([
                provider.getFeeData(),
                provider.getBlock("latest"),
            ]);

            const baseFeeWei = block?.baseFeePerGas || feeData.maxFeePerGas || 0n;
            const baseFeeGwei = Number(baseFeeWei) / 1e9;

            const suggestedPriorityWei = feeData.maxPriorityFeePerGas || 1500000000n; // 1.5 gwei default
            const suggestedPriorityGwei = Number(suggestedPriorityWei) / 1e9;

            // Calculate congestion based on gas used ratio
            const gasUsed = block?.gasUsed || 0n;
            const gasLimit = block?.gasLimit || 30000000n;
            const utilizationPercent = Number((gasUsed * 100n) / gasLimit);

            let congestionLevel: NetworkGasInfo["congestionLevel"] = "low";
            if (utilizationPercent > 90) congestionLevel = "extreme";
            else if (utilizationPercent > 70) congestionLevel = "high";
            else if (utilizationPercent > 40) congestionLevel = "medium";

            setGasInfo({
                baseFee: baseFeeGwei,
                suggestedPriority: suggestedPriorityGwei,
                congestionLevel,
                congestionPercent: utilizationPercent,
                blockNumber: block?.number || 0,
            });

            // Set custom defaults from live data
            if (!customMaxFee) {
                setCustomMaxFee((baseFeeGwei + suggestedPriorityGwei).toFixed(2));
            }
            if (!customPriority) {
                setCustomPriority(suggestedPriorityGwei.toFixed(2));
            }
        } catch (e) {
        }
    }, [context]);

    useEffect(() => {
        fetchGasInfo();
        const interval = setInterval(fetchGasInfo, 12000); // Refresh every ~1 block
        return () => clearInterval(interval);
    }, [fetchGasInfo]);

    // Calculate active gas settings
    const getActiveSettings = useCallback((): GasSettings => {
        if (!gasInfo) {
            return { preset, maxFeePerGas: 30, maxPriorityFee: 1.5, gasLimit: 21000 };
        }

        if (preset === "custom") {
            return {
                preset: "custom",
                maxFeePerGas: parseFloat(customMaxFee) || gasInfo.baseFee + gasInfo.suggestedPriority,
                maxPriorityFee: parseFloat(customPriority) || gasInfo.suggestedPriority,
                gasLimit: parseInt(customGasLimit) || 21000,
            };
        }

        const mult = PRESET_MULTIPLIERS[preset];
        return {
            preset,
            maxFeePerGas: parseFloat(((gasInfo.baseFee + gasInfo.suggestedPriority) * mult.fee).toFixed(4)),
            maxPriorityFee: parseFloat((gasInfo.suggestedPriority * mult.priority).toFixed(4)),
            gasLimit: parseInt(customGasLimit) || 21000,
        };
    }, [preset, gasInfo, customMaxFee, customPriority, customGasLimit]);

    // Notify parent of changes
    useEffect(() => {
        onChange?.(getActiveSettings());
    }, [preset, gasInfo, customMaxFee, customPriority, customGasLimit]);

    const settings = getActiveSettings();

    // Congestion color & icon
    const congestionColors: Record<string, string> = {
        low: "#4caf50",
        medium: "#ff9800",
        high: "#f44336",
        extreme: "#d32f2f",
    };

    const CongestionIcon = gasInfo?.congestionLevel === "low"
        ? TrendingDown
        : gasInfo?.congestionLevel === "extreme" || gasInfo?.congestionLevel === "high"
            ? TrendingUp
            : TrendingFlat;

    const congestionColor = congestionColors[gasInfo?.congestionLevel || "low"];

    return (
        <Paper
            elevation={0}
            sx={{
                borderRadius: 3,
                border: "1px solid",
                borderColor: alpha(theme.palette.primary.main, 0.15),
                overflow: "hidden",
            }}
        >
            {/* ─── Header ─── */}
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1.5, cursor: compact ? "pointer" : undefined }}
                onClick={compact ? () => setExpanded(!expanded) : undefined}
            >
                <Stack direction="row" alignItems="center" spacing={1}>
                    <LocalGasStation sx={{ fontSize: 18, color: "primary.main" }} />
                    <Typography variant="subtitle2" fontWeight={700}>
                        {t("gas.title")}
                    </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" spacing={1}>
                    {/* Network congestion badge */}
                    {gasInfo && (
                        <Chip
                            icon={<CongestionIcon sx={{ fontSize: 14 }} />}
                            label={t(`gas.congestion.${gasInfo.congestionLevel}`)}
                            size="small"
                            sx={{
                                height: 24,
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                bgcolor: alpha(congestionColor, 0.12),
                                color: congestionColor,
                                "& .MuiChip-icon": { color: congestionColor },
                            }}
                        />
                    )}

                    {/* Estimated fee */}
                    <Typography variant="caption" fontWeight={600} color="text.secondary">
                        ~{settings.maxFeePerGas.toFixed(1)} Gwei
                    </Typography>

                    {compact && (
                        <IconButton size="small" aria-label={expanded ? "Collapse gas settings" : "Expand gas settings"}>
                            {expanded ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
                        </IconButton>
                    )}
                </Stack>
            </Stack>

            <Collapse in={expanded}>
                <Box sx={{ px: 2, pb: 2 }}>
                    {/* ─── Network Congestion Bar ─── */}
                    {gasInfo && (
                        <Box sx={{ mb: 2 }}>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t("gas.networkLoad")}
                                </Typography>
                                <Typography variant="caption" fontWeight={700} sx={{ color: congestionColor }}>
                                    {gasInfo.congestionPercent}%
                                </Typography>
                            </Stack>
                            <LinearProgress
                                variant="determinate"
                                value={gasInfo.congestionPercent}
                                sx={{
                                    height: 6,
                                    borderRadius: 3,
                                    bgcolor: alpha(congestionColor, 0.1),
                                    "& .MuiLinearProgress-bar": {
                                        bgcolor: congestionColor,
                                        borderRadius: 3,
                                    },
                                }}
                            />
                            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                                    Base Fee: {gasInfo.baseFee.toFixed(2)} Gwei
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                                    Block #{gasInfo.blockNumber.toLocaleString()}
                                </Typography>
                            </Stack>
                        </Box>
                    )}

                    {/* ─── Preset Selection ─── */}
                    <Stack direction="row" spacing={0.75} sx={{ mb: 2 }}>
                        {(["slow", "standard", "fast", "custom"] as GasPreset[]).map((p) => {
                            const isActive = preset === p;
                            const info = p !== "custom" ? PRESET_MULTIPLIERS[p] : null;
                            return (
                                <Chip
                                    key={p}
                                    label={
                                        <Stack alignItems="center" spacing={0}>
                                            <Typography fontSize="0.85rem">
                                                {info ? info.label : "⚙️"}
                                            </Typography>
                                            <Typography fontSize="0.6rem" fontWeight={600}>
                                                {t(`gas.preset.${p}`)}
                                            </Typography>
                                            {info && (
                                                <Typography fontSize="0.55rem" color="text.secondary">
                                                    {info.time}
                                                </Typography>
                                            )}
                                        </Stack>
                                    }
                                    clickable
                                    onClick={() => setPreset(p)}
                                    color={isActive ? "primary" : "default"}
                                    variant={isActive ? "filled" : "outlined"}
                                    sx={{
                                        flex: 1,
                                        height: "auto",
                                        py: 0.75,
                                        fontWeight: isActive ? 700 : 500,
                                        "& .MuiChip-label": { px: 0.5 },
                                    }}
                                />
                            );
                        })}
                    </Stack>

                    {/* ─── Custom Controls ─── */}
                    {preset === "custom" && (
                        <Stack spacing={1.5}>
                            <TextField
                                label={t("gas.maxFee")}
                                value={customMaxFee}
                                onChange={(e) => setCustomMaxFee(e.target.value.replace(/[^0-9.]/g, ""))}
                                size="small"
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">Gwei</InputAdornment>,
                                }}
                            />
                            <TextField
                                label={t("gas.priorityFee")}
                                value={customPriority}
                                onChange={(e) => setCustomPriority(e.target.value.replace(/[^0-9.]/g, ""))}
                                size="small"
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">Gwei</InputAdornment>,
                                }}
                            />
                            <TextField
                                label={t("gas.gasLimit")}
                                value={customGasLimit}
                                onChange={(e) => setCustomGasLimit(e.target.value.replace(/[^0-9]/g, ""))}
                                size="small"
                            />
                        </Stack>
                    )}

                    {/* ─── Summary ─── */}
                    <Paper
                        elevation={0}
                        sx={{
                            mt: 2,
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: alpha(theme.palette.primary.main, 0.04),
                            border: "1px solid",
                            borderColor: alpha(theme.palette.primary.main, 0.1),
                        }}
                    >
                        <Stack direction="row" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">
                                {t("gas.maxFee")}
                            </Typography>
                            <Typography variant="caption" fontWeight={700}>
                                {settings.maxFeePerGas.toFixed(2)} Gwei
                            </Typography>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">
                                {t("gas.priorityFee")}
                            </Typography>
                            <Typography variant="caption" fontWeight={700}>
                                {settings.maxPriorityFee.toFixed(2)} Gwei
                            </Typography>
                        </Stack>
                        {gasInfo && (
                            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5, pt: 0.5, borderTop: "1px dashed", borderColor: "divider" }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t("gas.estimatedCost")}
                                </Typography>
                                <Typography variant="caption" fontWeight={700} color="primary.main">
                                    ~{((settings.maxFeePerGas * parseInt(customGasLimit || "21000")) / 1e9).toFixed(6)} ETH
                                </Typography>
                            </Stack>
                        )}
                    </Paper>
                </Box>
            </Collapse>
        </Paper>
    );
}

export default React.memo(GasSettingsPanel);
