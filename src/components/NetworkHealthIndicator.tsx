/**
 * NetworkHealthIndicator.tsx — RPC Health & Network Status
 *
 * Features:
 *  - RPC connection status dot (green/yellow/red)
 *  - Latest block number
 *  - Current gas price
 *  - Network latency
 *  - Click to expand details
 */

import React, { useState, useEffect, useContext, useCallback } from "react";
import {
    Box,
    Typography,
    Stack,
    Tooltip,
    Popover,
    Paper,
    alpha,
    useTheme,
    Chip,
    Divider,
} from "@mui/material";
import {
    Circle,
    SignalCellularAlt,
    SignalCellularAlt1Bar,
    SignalCellularAlt2Bar,
} from "@mui/icons-material";
import { WalletContext } from "../AppContext.js";
import { useTranslation } from "react-i18next";

// ─── Types ──────────────────────────────────────────────────────────

interface NetworkHealth {
    status: "connected" | "slow" | "disconnected";
    latencyMs: number;
    blockNumber: number;
    gasPrice: string;         // in Gwei
    lastChecked: number;
    networkName: string;
    chainId?: number;
}

// ─── Component ──────────────────────────────────────────────────────

function NetworkHealthIndicator() {
    const { t } = useTranslation();
    const theme = useTheme();
    const context = useContext(WalletContext);

    const [health, setHealth] = useState<NetworkHealth | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const checkHealth = useCallback(async () => {
        const network = context?.networkProvider?.getActiveNetwork();
        if (!network || !network.rpc_url) {
            setHealth({
                status: "disconnected",
                latencyMs: 0,
                blockNumber: 0,
                gasPrice: "—",
                lastChecked: Date.now(),
                networkName: network?.network_name || "No Network",
            });
            return;
        }

        const rpcUrl = network.rpc_url;
        const isWs = rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://");

        async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
            if (isWs) {
                return new Promise((resolve, reject) => {
                    const ws = new WebSocket(rpcUrl);
                    const id = Date.now();
                    const timer = setTimeout(() => { ws.close(); reject(new Error("WS timeout")); }, 10000);
                    ws.onopen = () => ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
                    ws.onmessage = (e) => {
                        try {
                            const d = JSON.parse(e.data as string) as { id?: number; result?: unknown; error?: { message?: string } };
                            if (d.id !== id) return;
                            clearTimeout(timer); ws.close();
                            d.error ? reject(new Error(d.error.message)) : resolve(d.result);
                        } catch (err) { clearTimeout(timer); ws.close(); reject(err); }
                    };
                    ws.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket error")); };
                });
            }
            const res = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
            });
            const json = await res.json() as { result?: unknown; error?: { message?: string } };
            if (json.error) throw new Error(json.error.message || "RPC error");
            return json.result;
        }

        try {
            const startTime = performance.now();

            const [blockHex, feeHex] = await Promise.all([
                rpcCall("eth_blockNumber", []),
                rpcCall("eth_gasPrice", []).catch(() => null),
            ]);

            const latencyMs = Math.round(performance.now() - startTime);
            const blockNumber = parseInt(blockHex as string, 16);
            const gasPriceGwei = feeHex
                ? (Number(BigInt(feeHex as string)) / 1e9).toFixed(2)
                : "—";

            let status: NetworkHealth["status"] = "connected";
            if (latencyMs > 3000) status = "slow";

            setHealth({
                status,
                latencyMs,
                blockNumber,
                gasPrice: gasPriceGwei,
                lastChecked: Date.now(),
                networkName: network.network_name || "Unknown",
                chainId: network.network_id,
            });
        } catch (e) {
            setHealth({
                status: "disconnected",
                latencyMs: 0,
                blockNumber: 0,
                gasPrice: "—",
                lastChecked: Date.now(),
                networkName: network.network_name || "Unknown",
            });
        }
    }, [context]);

    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 15000); // Check every 15s
        return () => clearInterval(interval);
    }, [checkHealth]);

    // Status colors
    const statusConfig = {
        connected: { color: "#4caf50", label: t("networkHealth.connected"), Icon: SignalCellularAlt },
        slow: { color: "#ff9800", label: t("networkHealth.slow"), Icon: SignalCellularAlt2Bar },
        disconnected: { color: "#f44336", label: t("networkHealth.disconnected"), Icon: SignalCellularAlt1Bar },
    };

    const config = statusConfig[health?.status || "disconnected"];

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const open = Boolean(anchorEl);

    return (
        <>
            {/* Status Dot — clickable */}
            <Tooltip title={`${health?.networkName || "..."} — ${config.label}`}>
                <Box
                    onClick={handleClick}
                    role="button"
                    tabIndex={0}
                    aria-label={`Network status: ${config.label}`}
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e as unknown as React.MouseEvent<HTMLElement>); }}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                        gap: 0.5,
                        px: 0.5,
                        py: 0.25,
                        borderRadius: 2,
                        "&:hover": { bgcolor: alpha(config.color, 0.08) },
                    }}
                >
                    <Circle
                        sx={{
                            fontSize: 8,
                            color: config.color,
                            animation: health?.status === "connected" ? "none" : "pulse 2s infinite",
                            "@keyframes pulse": {
                                "0%, 100%": { opacity: 1 },
                                "50%": { opacity: 0.3 },
                            },
                        }}
                    />
                    {health && (
                        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", fontWeight: 600 }}>
                            {health.gasPrice !== "—" ? `${health.gasPrice} Gwei` : "—"}
                        </Typography>
                    )}
                </Box>
            </Tooltip>

            {/* Popover Details */}
            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                transformOrigin={{ vertical: "top", horizontal: "center" }}
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                        p: 2,
                        minWidth: 220,
                        border: "1px solid",
                        borderColor: alpha(config.color, 0.2),
                    },
                }}
            >
                {health && (
                    <Stack spacing={1.5}>
                        {/* Network Name & Status */}
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                            <Typography variant="subtitle2" fontWeight={700}>
                                {health.networkName}
                            </Typography>
                            <Chip
                                icon={<Circle sx={{ fontSize: 8 }} />}
                                label={config.label}
                                size="small"
                                sx={{
                                    height: 22,
                                    fontSize: "0.65rem",
                                    fontWeight: 700,
                                    bgcolor: alpha(config.color, 0.1),
                                    color: config.color,
                                    "& .MuiChip-icon": { color: config.color },
                                }}
                            />
                        </Stack>

                        <Divider />

                        {/* Stats */}
                        <Stack spacing={0.75}>
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" color="text.secondary">
                                    {t("networkHealth.blockNumber")}
                                </Typography>
                                <Typography variant="caption" fontWeight={700}>
                                    #{health.blockNumber.toLocaleString()}
                                </Typography>
                            </Stack>

                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" color="text.secondary">
                                    {t("networkHealth.gasPrice")}
                                </Typography>
                                <Typography variant="caption" fontWeight={700}>
                                    {health.gasPrice} Gwei
                                </Typography>
                            </Stack>

                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" color="text.secondary">
                                    {t("networkHealth.latency")}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    fontWeight={700}
                                    sx={{ color: health.latencyMs < 1000 ? "#4caf50" : health.latencyMs < 3000 ? "#ff9800" : "#f44336" }}
                                >
                                    {health.latencyMs}ms
                                </Typography>
                            </Stack>

                            {health.chainId && (
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography variant="caption" color="text.secondary">
                                        Chain ID
                                    </Typography>
                                    <Typography variant="caption" fontWeight={700}>
                                        {health.chainId}
                                    </Typography>
                                </Stack>
                            )}
                        </Stack>

                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6rem", textAlign: "right" }}>
                            {t("networkHealth.lastChecked")}: {new Date(health.lastChecked).toLocaleTimeString()}
                        </Typography>
                    </Stack>
                )}
            </Popover>
        </>
    );
}

export default React.memo(NetworkHealthIndicator);
