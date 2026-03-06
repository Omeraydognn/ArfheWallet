/**
 * NftGalleryCard.tsx
 *
 * Premium NFT card for the Home screen gallery grid.
 *
 * Features:
 * - Fetches tokenURI(0) via direct RPC eth_call and resolves metadata JSON
 * - Renders image (lazy-loaded) or video (autoplay/muted/loop)
 * - IPFS gateway passthrough (ipfs:// → cloudflare-ipfs.com)
 * - Gradient shimmer skeleton while loading
 * - Hover lift + shadow animation
 * - Bottom info strip: name, symbol, balance
 */

import React, { useState, useEffect } from "react";
import {
    Box,
    Typography,
    Skeleton,
    Chip,
    alpha,
} from "@mui/material";
import { BrokenImage, Shield } from "@mui/icons-material";

// ------------------------------------------------------------------
// IPFS helper
// ------------------------------------------------------------------
function resolveIpfs(url: string): string {
    if (!url) return "";
    if (url.startsWith("ipfs://")) {
        return url.replace("ipfs://", "https://cloudflare-ipfs.com/ipfs/");
    }
    return url;
}

// ------------------------------------------------------------------
// tokenURI fetcher via eth_call
// ------------------------------------------------------------------
async function fetchNftMetadata(
    rpcUrl: string,
    contractAddress: string
): Promise<{ image?: string; name?: string; description?: string } | null> {
    try {
        // tokenURI(uint256 tokenId) → tokenId = 1 as a best-effort default
        const data =
            "0xc87b56dd0000000000000000000000000000000000000000000000000000000000000001";

        const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [{ to: contractAddress, data }, "latest"],
            }),
        });
        const json = await res.json();
        const hex: string = json?.result ?? "";
        if (!hex || hex === "0x") return null;

        // Decode ABI-encoded string
        const bytes = hex.startsWith("0x") ? hex.slice(2) : hex;
        const offsetHex = bytes.slice(64, 128);
        const lengthHex = bytes.slice(
            128 + parseInt(offsetHex, 16) * 2,
            128 + parseInt(offsetHex, 16) * 2 + 64
        );
        const length = parseInt(lengthHex, 16) * 2;
        const strHex = bytes.slice(
            128 + parseInt(offsetHex, 16) * 2 + 64,
            128 + parseInt(offsetHex, 16) * 2 + 64 + length
        );
        let tokenUri = Buffer
            ? Buffer.from(strHex, "hex").toString("utf8")
            : decodeURIComponent(
                strHex.replace(/\s+/g, "").replace(/(..)/g, "%$1")
            );

        tokenUri = tokenUri.replace(/\0/g, "").trim();
        tokenUri = resolveIpfs(tokenUri);

        // Handle base64 data URIs
        if (tokenUri.startsWith("data:application/json;base64,")) {
            const b64 = tokenUri.split(",")[1];
            const meta = JSON.parse(atob(b64));
            return meta;
        }

        if (!tokenUri.startsWith("http")) return null;

        const metaRes = await fetch(tokenUri, { mode: "cors" });
        if (!metaRes.ok) return null;
        return await metaRes.json();
    } catch {
        return null;
    }
}

// ------------------------------------------------------------------
// Media renderer (image or video)
// ------------------------------------------------------------------
function NftMedia({ src, name }: { src: string; name: string }) {
    const [errored, setErrored] = useState(false);
    const isVideo =
        src.endsWith(".mp4") ||
        src.endsWith(".webm") ||
        src.endsWith(".mov") ||
        src.includes("video");

    if (!src || errored) {
        return (
            <Box
                sx={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 100%)",
                    borderRadius: "inherit",
                }}
            >
                <BrokenImage sx={{ fontSize: 36, color: "text.disabled" }} />
            </Box>
        );
    }

    if (isVideo) {
        return (
            <video
                src={src}
                autoPlay
                muted
                loop
                playsInline
                style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    borderRadius: "inherit",
                    display: "block",
                }}
                onError={() => setErrored(true)}
            />
        );
    }

    return (
        <Box
            component="img"
            src={src}
            alt={name}
            loading="lazy"
            onError={() => setErrored(true)}
            sx={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                borderRadius: "inherit",
                display: "block",
                transition: "transform 0.4s ease",
                "&:hover": { transform: "scale(1.04)" },
            }}
        />
    );
}

// ------------------------------------------------------------------
// Main card component
// ------------------------------------------------------------------
interface NftGalleryCardProps {
    contractAddress: string;
    symbol: string;
    name: string;
    balance?: number;
    isShielded?: boolean;
    rpcUrl?: string;
}

export default function NftGalleryCard({
    contractAddress,
    symbol,
    name,
    balance = 1,
    isShielded = false,
    rpcUrl,
}: NftGalleryCardProps) {
    const [imageUrl, setImageUrl] = useState<string>("");
    const [metaName, setMetaName] = useState<string>("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!rpcUrl || !contractAddress) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        fetchNftMetadata(rpcUrl, contractAddress)
            .then((meta) => {
                if (cancelled) return;
                if (meta?.image) setImageUrl(resolveIpfs(meta.image));
                if (meta?.name) setMetaName(meta.name);
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [contractAddress, rpcUrl]);

    const displayName = metaName || name || symbol;

    return (
        <Box
            sx={{
                borderRadius: 3,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                position: "relative",
                cursor: "pointer",
                transition: "transform 0.22s ease, box-shadow 0.22s ease",
                "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: (theme) =>
                        `0 12px 28px -8px ${alpha(theme.palette.primary.main, 0.25)}`,
                },
                "&:active": {
                    transform: "translateY(-2px) scale(0.985)",
                },
            }}
        >
            {/* Media area */}
            <Box sx={{ overflow: "hidden", borderRadius: "inherit" }}>
                {loading ? (
                    <Skeleton
                        variant="rectangular"
                        sx={{ width: "100%", aspectRatio: "1 / 1", borderRadius: "inherit" }}
                        animation="wave"
                    />
                ) : (
                    <NftMedia src={imageUrl} name={displayName} />
                )}
            </Box>

            {/* Shield badge */}
            {isShielded && (
                <Box
                    sx={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        bgcolor: "#10b981",
                        borderRadius: "50%",
                        width: 22,
                        height: 22,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 6px rgba(16,185,129,0.4)",
                    }}
                >
                    <Shield sx={{ fontSize: 12, color: "#fff" }} />
                </Box>
            )}

            {/* Info strip */}
            <Box sx={{ p: 1.25 }}>
                <Typography
                    variant="body2"
                    fontWeight={700}
                    noWrap
                    sx={{ lineHeight: 1.3, color: "text.primary", fontSize: "0.82rem" }}
                >
                    {displayName}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
                    <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", fontFamily: "monospace", fontSize: "0.65rem" }}
                    >
                        {contractAddress.slice(0, 6)}…{contractAddress.slice(-4)}
                    </Typography>
                    <Chip
                        label={`×${balance}`}
                        size="small"
                        sx={{
                            height: 17,
                            fontSize: "0.62rem",
                            fontWeight: 700,
                            bgcolor: "action.hover",
                            color: "text.secondary",
                            "& .MuiChip-label": { px: 0.75 },
                        }}
                    />
                </Box>
            </Box>
        </Box>
    );
}
