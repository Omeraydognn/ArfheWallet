/**
 * QrScannerModal.tsx — Camera QR Code Scanner
 *
 * Features:
 *  - Camera access for QR code scanning
 *  - Supports ETH addresses, WalletConnect URIs, and EIP-681 payment links
 *  - Manual paste fallback
 *  - Flash toggle, front/back camera switch
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    Box,
    Typography,
    Stack,
    IconButton,
    Button,
    TextField,
    Alert,
    alpha,
    useTheme,
    Chip,
} from "@mui/material";
import {
    Close,
    CameraAlt,
    FlipCameraAndroid,
    ContentPaste,
    QrCode,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

// ─── Types ──────────────────────────────────────────────────────────

export interface QrScanResult {
    type: "address" | "walletconnect" | "eip681" | "unknown";
    raw: string;
    address?: string;
    chainId?: string;
    amount?: string;
    wcUri?: string;
}

// ─── Parser ─────────────────────────────────────────────────────────

export function parseQrContent(content: string): QrScanResult {
    const trimmed = content.trim();

    // WalletConnect URI
    if (trimmed.startsWith("wc:")) {
        return { type: "walletconnect", raw: trimmed, wcUri: trimmed };
    }

    // EIP-681 payment request: ethereum:0x...@chainId/transfer?...
    if (trimmed.startsWith("ethereum:")) {
        const withoutPrefix = trimmed.slice(9);
        const atIndex = withoutPrefix.indexOf("@");
        const slashIndex = withoutPrefix.indexOf("/");
        const qIndex = withoutPrefix.indexOf("?");

        let address = withoutPrefix;
        let chainId: string | undefined;
        let amount: string | undefined;

        if (atIndex > 0) {
            address = withoutPrefix.slice(0, atIndex);
            const rest = withoutPrefix.slice(atIndex + 1);
            chainId = rest.split(/[/?]/)[0];
        } else if (slashIndex > 0) {
            address = withoutPrefix.slice(0, slashIndex);
        } else if (qIndex > 0) {
            address = withoutPrefix.slice(0, qIndex);
        }

        // Parse query params for amount
        if (qIndex > 0) {
            const queryStr = withoutPrefix.slice(qIndex + 1);
            const params = new URLSearchParams(queryStr);
            amount = params.get("value") || params.get("amount") || undefined;
        }

        return { type: "eip681", raw: trimmed, address, chainId, amount };
    }

    // Plain Ethereum address
    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        return { type: "address", raw: trimmed, address: trimmed };
    }

    // ENS name
    if (trimmed.endsWith(".eth")) {
        return { type: "address", raw: trimmed, address: trimmed };
    }

    return { type: "unknown", raw: trimmed };
}

// ─── Component ──────────────────────────────────────────────────────

interface QrScannerModalProps {
    open: boolean;
    onClose: () => void;
    onResult: (result: QrScanResult) => void;
}

export default function QrScannerModal({ open, onClose, onResult }: QrScannerModalProps) {
    const { t } = useTranslation();
    const theme = useTheme();

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number>(0);

    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
    const [manualInput, setManualInput] = useState("");
    const [showManual, setShowManual] = useState(false);
    const [scanStatus, setScanStatus] = useState<"scanning" | "found" | "idle">("idle");

    // Start camera
    const startCamera = useCallback(async () => {
        setCameraError("");
        try {
            const constraints: MediaStreamConstraints = {
                video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setCameraActive(true);
                setScanStatus("scanning");
            }
        } catch (e) {
            setCameraError(t("qrScanner.cameraError"));
            setShowManual(true);
        }
    }, [facingMode, t]);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
        }
        setCameraActive(false);
        setScanStatus("idle");
    }, []);

    // Scan loop — use BarcodeDetector API if available, otherwise fallback
    const scanFrame = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || !cameraActive) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
            animFrameRef.current = requestAnimationFrame(scanFrame);
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        try {
            // Use BarcodeDetector API (Chrome 83+)
            if ("BarcodeDetector" in window) {
                const detector = new BarcodeDetector({ formats: ["qr_code"] });
                const barcodes = await detector.detect(canvas);
                if (barcodes.length > 0) {
                    const result = parseQrContent(barcodes[0].rawValue);
                    setScanStatus("found");
                    stopCamera();
                    onResult(result);
                    onClose();
                    return;
                }
            }
        } catch (e) {
            // BarcodeDetector may not be available
        }

        animFrameRef.current = requestAnimationFrame(scanFrame);
    }, [cameraActive, onResult, onClose, stopCamera]);

    useEffect(() => {
        if (cameraActive) {
            animFrameRef.current = requestAnimationFrame(scanFrame);
        }
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [cameraActive, scanFrame]);

    // Auto start camera on open
    useEffect(() => {
        if (open) {
            startCamera();
        } else {
            stopCamera();
            setManualInput("");
            setShowManual(false);
            setScanStatus("idle");
        }
        return () => stopCamera();
    }, [open]);

    // Switch camera
    const handleFlipCamera = () => {
        stopCamera();
        setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
        setTimeout(startCamera, 300);
    };

    // Manual paste handler
    const handleManualSubmit = () => {
        if (!manualInput.trim()) return;
        const result = parseQrContent(manualInput);
        onResult(result);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={() => { stopCamera(); onClose(); }}
            fullWidth
            maxWidth="xs"
            aria-labelledby="qr-scanner-title"
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    overflow: "hidden",
                    bgcolor: "background.default",
                },
            }}
        >
            <DialogTitle id="qr-scanner-title" sx={{ py: 1.5, px: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <QrCode sx={{ fontSize: 20, color: "primary.main" }} />
                        <Typography variant="subtitle1" fontWeight={700}>
                            {t("qrScanner.title")}
                        </Typography>
                    </Stack>
                    <IconButton size="small" onClick={() => { stopCamera(); onClose(); }} aria-label="Close QR scanner">
                        <Close sx={{ fontSize: 18 }} />
                    </IconButton>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{ p: 0 }}>
                {/* Camera View */}
                <Box sx={{ position: "relative", width: "100%", aspectRatio: "1/1", bgcolor: "#000", overflow: "hidden" }}>
                    <video
                        ref={videoRef}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        playsInline
                        muted
                    />
                    <canvas ref={canvasRef} style={{ display: "none" }} />

                    {/* Scan overlay */}
                    {cameraActive && (
                        <Box
                            sx={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                width: 200,
                                height: 200,
                                border: "2px solid",
                                borderColor: scanStatus === "found" ? "#4caf50" : "primary.main",
                                borderRadius: 3,
                                boxShadow: `0 0 0 1000px ${alpha("#000", 0.5)}`,
                            }}
                        />
                    )}

                    {/* Camera controls */}
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)" }}
                    >
                        <Chip
                            icon={<FlipCameraAndroid sx={{ fontSize: 16 }} />}
                            label={t("qrScanner.flipCamera")}
                            size="small"
                            onClick={handleFlipCamera}
                            sx={{ bgcolor: alpha("#fff", 0.2), color: "#fff", backdropFilter: "blur(8px)", fontSize: "0.7rem" }}
                        />
                        <Chip
                            icon={<ContentPaste sx={{ fontSize: 16 }} />}
                            label={t("qrScanner.paste")}
                            size="small"
                            onClick={() => setShowManual(!showManual)}
                            sx={{ bgcolor: alpha("#fff", 0.2), color: "#fff", backdropFilter: "blur(8px)", fontSize: "0.7rem" }}
                        />
                    </Stack>

                    {/* Scanning indicator */}
                    {cameraActive && scanStatus === "scanning" && (
                        <Typography
                            variant="caption"
                            sx={{
                                position: "absolute",
                                top: 12,
                                left: "50%",
                                transform: "translateX(-50%)",
                                color: "#fff",
                                bgcolor: alpha("#000", 0.5),
                                px: 2,
                                py: 0.5,
                                borderRadius: 2,
                                backdropFilter: "blur(4px)",
                            }}
                        >
                            {t("qrScanner.scanning")}
                        </Typography>
                    )}

                    {/* Camera error */}
                    {cameraError && (
                        <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", p: 3 }}>
                            <CameraAlt sx={{ fontSize: 48, color: "#fff", opacity: 0.5, mb: 1 }} />
                            <Typography variant="body2" color="#fff" sx={{ opacity: 0.8 }}>
                                {cameraError}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Manual Input */}
                {showManual && (
                    <Box sx={{ p: 2 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: "block" }}>
                            {t("qrScanner.manualInput")}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="0x... / wc:... / ethereum:..."
                                value={manualInput}
                                onChange={(e) => setManualInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                            />
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleManualSubmit}
                                disabled={!manualInput.trim()}
                                sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, minWidth: 70 }}
                            >
                                {t("common.confirm")}
                            </Button>
                        </Stack>
                    </Box>
                )}

                {/* Supported formats */}
                <Box sx={{ p: 2, pt: showManual ? 0 : 2 }}>
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                        {t("qrScanner.supportedFormats")}
                    </Typography>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
