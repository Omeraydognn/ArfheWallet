/**
 * FheEncryptingOverlay.tsx
 *
 * Full-page overlay shown during FHE confidential transfer operations.
 * Light theme design to match the wallet's white/light background.
 * Uses a React Portal to render over the entire viewport.
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Box, Typography, Fade } from "@mui/material";
import { Lock } from "@mui/icons-material";

interface FheEncryptingOverlayProps {
    visible: boolean;
    message?: string;
}

// Indigo/violet wallet theme
const THEME_PRIMARY = "#6366f1";
const THEME_SECONDARY = "#8b5cf6";

function MatrixRainCanvas() {
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
            // Light semi-transparent trail — works on a bright background
            ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = `${fontSize}px monospace`;

            for (let i = 0; i < drops.length; i++) {
                const text = CHARS[Math.floor(Math.random() * CHARS.length)];
                const opacity = Math.random() > 0.8 ? 0.7 : 0.2;
                ctx.fillStyle = `rgba(99, 102, 241, ${opacity})`;
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

function OverlayContent({ message }: { message: string }) {
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
                    // Light frosted glass look
                    background: "rgba(248, 248, 255, 0.88)",
                    backdropFilter: "blur(16px)",
                    overflow: "hidden",
                }}
            >
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
                            background: `rgba(99,102,241,0.08)`,
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
                </Box>
            </Box>
        </Fade>
    );
}

export default function FheEncryptingOverlay({
    visible,
    message = "Encrypting with FHE...",
}: FheEncryptingOverlayProps) {
    if (!visible) return null;
    // Render into document.body so it covers the full viewport
    return createPortal(
        <OverlayContent message={message} />,
        document.body
    );
}
