/**
 * FheEncryptingOverlay.tsx
 *
 * Full-page overlay shown during FHE confidential transfer operations.
 * Light theme design to match the wallet's white/light background.
 * Uses a React Portal to render over the entire viewport.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Typography, Fade, Button, IconButton, useTheme } from "@mui/material";
import { Lock, Close, OpenInNew } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useToast } from "./ToastProvider";

interface FheEncryptingOverlayProps {
    visible: boolean;
    message?: string;
}

// Cool blue-steel wallet theme
const THEME_PRIMARY = "#2563eb";
const THEME_SECONDARY = "#1e3a8a";

function MatrixRainCanvas() {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const fontSize = 13;
        const cols = Math.floor(canvas.width / fontSize);
        const drops: number[] = Array(cols).fill(1);

        const CHARS = "0123456789ABCDEF FHE 01 1A 2B C3 D4 AB CD EF";

        let animFrameId: number;

        const draw = () => {
            // Adjust trail color based on theme
            ctx.fillStyle = isDark ? "rgba(18, 18, 18, 0.07)" : "rgba(255, 255, 255, 0.07)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = `${fontSize}px monospace`;

            for (let i = 0; i < drops.length; i++) {
                const text = CHARS[Math.floor(Math.random() * CHARS.length)];
                const opacity = Math.random() > 0.8 ? 0.7 : 0.2;
                ctx.fillStyle = `rgba(37, 99, 235, ${opacity})`;
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }

            animFrameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animFrameId);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0.5,
                borderRadius: "inherit",
            }}
        />
    );
}

function OverlayContent({ message, onDismiss, t }: { message: string, onDismiss: () => void, t: any }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Fade in timeout={400}>
            <Box
                sx={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2.5,
                    // Dynamic frosted glass look based on theme
                    background: isDark ? "rgba(18, 18, 18, 0.88)" : "rgba(248, 248, 255, 0.88)",
                    backdropFilter: "blur(16px)",
                    overflow: "hidden",
                }}
            >
                {/* Close Button in top right */}
                <IconButton 
                    onClick={onDismiss}
                    sx={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        zIndex: 10,
                        color: 'text.secondary',
                        bgcolor: 'background.paper',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        '&:hover': { bgcolor: 'background.paper', transform: 'scale(1.05)' }
                    }}
                >
                    <Close />
                </IconButton>

                {/* Hex rain canvas */}
                <MatrixRainCanvas />

                {/* Central content — above canvas */}
                <Box
                    sx={{
                        position: "relative",
                        zIndex: 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                    }}
                >
                    {/* Pulsing lock icon */}
                    <Box
                        sx={{
                            width: 80,
                            height: 80,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: `rgba(37,99,235,0.06)`,
                            border: `2px solid ${THEME_PRIMARY}60`,
                            animation: "fhe-pulse 1.6s ease-in-out infinite",
                            "@keyframes fhe-pulse": {
                                "0%, 100%": {
                                    boxShadow: `0 0 0 0 ${THEME_PRIMARY}35`,
                                    borderColor: `${THEME_PRIMARY}60`,
                                },
                                "50%": {
                                    boxShadow: `0 0 0 18px ${THEME_PRIMARY}00`,
                                    borderColor: THEME_PRIMARY,
                                },
                            },
                        }}
                    >
                        <Lock sx={{ fontSize: 36, color: THEME_PRIMARY }} />
                    </Box>

                    <Typography
                        variant="subtitle1"
                        fontWeight={800}
                        sx={{
                            color: THEME_PRIMARY,
                            letterSpacing: 2,
                            textTransform: "uppercase",
                            fontSize: "0.72rem",
                            fontFamily: "monospace",
                        }}
                    >
                        FHE Encryption Active
                    </Typography>

                    <Typography
                        variant="body2"
                        sx={{
                            color: "text.secondary",
                            fontFamily: "monospace",
                            textAlign: "center",
                            maxWidth: 260,
                            lineHeight: 1.7,
                        }}
                    >
                        {message}
                    </Typography>

                    {/* Animated dots */}
                    <Box sx={{ display: "flex", gap: 1 }}>
                        {[0, 1, 2].map((i) => (
                            <Box
                                key={i}
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    bgcolor: THEME_SECONDARY,
                                    animation: "fhe-dot 1.2s ease-in-out infinite",
                                    animationDelay: `${i * 0.2}s`,
                                    "@keyframes fhe-dot": {
                                        "0%, 80%, 100%": { opacity: 0.2, transform: "scale(0.8)" },
                                        "40%": { opacity: 1, transform: "scale(1.2)" },
                                    },
                                }}
                            />
                        ))}
                    </Box>

                    <Button 
                        variant="outlined" 
                        size="small"
                        onClick={onDismiss}
                        endIcon={<OpenInNew />}
                        sx={{ 
                            mt: 4, 
                            borderRadius: 4, 
                            textTransform: 'none',
                            fontWeight: 600,
                            borderColor: `${THEME_PRIMARY}50`,
                            color: THEME_PRIMARY,
                            '&:hover': {
                                borderColor: THEME_PRIMARY,
                                bgcolor: `${THEME_PRIMARY}10`
                            }
                        }}
                    >
                        {t ? t("runInBackground", "Run in Background") : "Run in Background"}
                    </Button>
                </Box>
            </Box>
        </Fade>
    );
}

export default function FheEncryptingOverlay({
    visible,
    message = "Encrypting with FHE...",
}: FheEncryptingOverlayProps) {
    const [dismissed, setDismissed] = useState(false);
    const { showToast } = useToast();
    const { t } = useTranslation();

    // Reset dismissed state when it becomes visible again
    useEffect(() => {
        if (visible) {
            setDismissed(false);
        }
    }, [visible]);

    const handleDismiss = () => {
        setDismissed(true);
        showToast(
            t("backgroundTxInfo", "Transaction running in background. You can track it in the History tab."), 
            "info"
        );
    };

    if (!visible || dismissed) return null;

    // Render into document.body so it covers the full viewport
    return createPortal(
        <OverlayContent message={message} onDismiss={handleDismiss} t={t} />,
        document.body
    );
}
