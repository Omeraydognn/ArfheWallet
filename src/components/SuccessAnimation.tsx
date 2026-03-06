/**
 * SuccessAnimation.tsx
 *
 * A pure CSS + SVG animated checkmark shown after successful transactions.
 * No external dependencies — keeps the bundle lean.
 *
 * Usage:
 *   <SuccessAnimation label="Transaction sent!" />
 */

import React from "react";
import { Box, Typography, Fade } from "@mui/material";

interface SuccessAnimationProps {
    label?: string;
    size?: number;
}

export default function SuccessAnimation({
    label = "Success!",
    size = 72,
}: SuccessAnimationProps) {
    return (
        <Fade in timeout={400}>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 1.5,
                    py: 2,
                }}
            >
                {/* Animated circle + tick */}
                <Box
                    sx={{
                        width: size,
                        height: size,
                        position: "relative",
                    }}
                >
                    <svg
                        viewBox="0 0 72 72"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ width: "100%", height: "100%", overflow: "visible" }}
                    >
                        {/* Background circle — scales in */}
                        <circle
                            cx="36"
                            cy="36"
                            r="34"
                            fill="rgba(99,102,241,0.1)"
                            stroke="#6366f1"
                            strokeWidth="2"
                            style={{
                                transformOrigin: "36px 36px",
                                animation: "sc-circle-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                            }}
                        />
                        {/* Checkmark path — draws itself */}
                        <path
                            d="M20 37 L30 48 L52 25"
                            stroke="#6366f1"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            style={{
                                strokeDasharray: 50,
                                strokeDashoffset: 50,
                                animation: "sc-tick-draw 0.45s ease 0.25s forwards",
                            }}
                        />
                    </svg>
                </Box>

                {label && (
                    <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{
                            color: "text.primary",
                            animation: "sc-fade-up 0.4s ease 0.35s both",
                        }}
                    >
                        {label}
                    </Typography>
                )}

                {/* Keyframe styles injected as a global style tag */}
                <style>{`
          @keyframes sc-circle-in {
            from { transform: scale(0); opacity: 0; }
            to   { transform: scale(1); opacity: 1; }
          }
          @keyframes sc-tick-draw {
            to { stroke-dashoffset: 0; }
          }
          @keyframes sc-fade-up {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
            </Box>
        </Fade>
    );
}
