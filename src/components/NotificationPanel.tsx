/**
 * NotificationPanel.tsx — Notification Center for Arfhe Wallet
 *
 * Features:
 *  - Notification list with read/unread states
 *  - Notification preferences toggle
 *  - Badge count on ArfBar bell icon
 */

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    Stack,
    Paper,
    IconButton,
    Switch,
    Badge,
    Drawer,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Divider,
    Chip,
    alpha,
    useTheme,
    Tooltip,
    Button,
} from "@mui/material";
import {
    Notifications,
    NotificationsActive,
    CallReceived,
    CheckCircle,
    Error as ErrorIcon,
    Warning,
    DoneAll,
    DeleteSweep,
    Close,
    Circle,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { NotificationService, WalletNotification, NotificationPreferences } from "../backend/NotificationService.js";

// ─── Notification Icon Map ──────────────────────────────────────────

function getNotifIcon(type: WalletNotification["type"]) {
    switch (type) {
        case "incoming_tx": return <CallReceived sx={{ color: "#4caf50" }} />;
        case "tx_confirmed": return <CheckCircle sx={{ color: "#4caf50" }} />;
        case "tx_failed": return <ErrorIcon sx={{ color: "#f44336" }} />;
        case "approval_warning": return <Warning sx={{ color: "#ff9800" }} />;
        case "security": return <Warning sx={{ color: "#f44336" }} />;
        default: return <Notifications sx={{ color: "text.secondary" }} />;
    }
}

function formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────

function NotificationPanel() {
    const { t } = useTranslation();
    const theme = useTheme();

    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<WalletNotification[]>([]);
    const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showSettings, setShowSettings] = useState(false);

    const loadData = useCallback(async () => {
        const [notifs, preferences, count] = await Promise.all([
            NotificationService.getNotifications(),
            NotificationService.getPreferences(),
            NotificationService.getUnreadCount(),
        ]);
        setNotifications(notifs);
        setPrefs(preferences);
        setUnreadCount(count);
    }, []);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handleOpen = () => {
        setOpen(true);
        loadData();
    };

    const handleMarkAllRead = async () => {
        await NotificationService.markAllAsRead();
        await NotificationService.updateBadge();
        loadData();
    };

    const handleClearAll = async () => {
        await NotificationService.clearAll();
        await NotificationService.updateBadge();
        loadData();
    };

    const handleMarkRead = async (id: string) => {
        await NotificationService.markAsRead(id);
        await NotificationService.updateBadge();
        loadData();
    };

    const handleTogglePref = async (key: keyof NotificationPreferences) => {
        if (!prefs) return;
        const updated = { ...prefs, [key]: !prefs[key] };
        await NotificationService.savePreferences(updated);
        setPrefs(updated);
    };

    return (
        <>
            {/* ─── Bell Icon with Badge ─── */}
            <Tooltip title={t("notifications.title")}>
                <IconButton onClick={handleOpen} size="small" sx={{ color: "text.secondary" }} aria-label={t("notifications.title")}>
                    <Badge
                        badgeContent={unreadCount}
                        color="error"
                        max={99}
                        sx={{ "& .MuiBadge-badge": { fontSize: "0.6rem", minWidth: 16, height: 16 } }}
                    >
                        {unreadCount > 0 ? (
                            <NotificationsActive sx={{ fontSize: 20 }} />
                        ) : (
                            <Notifications sx={{ fontSize: 20 }} />
                        )}
                    </Badge>
                </IconButton>
            </Tooltip>

            {/* ─── Drawer ─── */}
            <Drawer
                anchor="right"
                open={open}
                onClose={() => setOpen(false)}
                aria-label={t("notifications.title")}
                PaperProps={{
                    sx: {
                        width: 360,
                        maxWidth: "100%",
                        bgcolor: "background.default",
                    },
                }}
            >
                {/* Header */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, pb: 1 }}>
                    <Typography variant="h6" fontWeight={700}>
                        {t("notifications.title")}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                        <Tooltip title={t("notifications.markAllRead")}>
                            <IconButton size="small" onClick={handleMarkAllRead} aria-label={t("notifications.markAllRead")}>
                                <DoneAll sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={t("notifications.clearAll")}>
                            <IconButton size="small" onClick={handleClearAll} aria-label={t("notifications.clearAll")}>
                                <DeleteSweep sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close notifications">
                            <Close sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Stack>
                </Stack>

                {/* Settings Toggle */}
                <Box sx={{ px: 2, pb: 1 }}>
                    <Button
                        size="small"
                        variant="text"
                        onClick={() => setShowSettings(!showSettings)}
                        sx={{ textTransform: "none", fontSize: "0.75rem", color: "text.secondary" }}
                    >
                        ⚙️ {showSettings ? "Hide Settings" : "Settings"}
                    </Button>
                </Box>

                {showSettings && prefs && (
                    <Paper elevation={0} sx={{ mx: 2, mb: 1, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                        <Stack spacing={1}>
                            {(["enabled", "incomingTx", "txConfirmation", "approvalWarnings"] as const).map((key) => (
                                <Stack key={key} direction="row" alignItems="center" justifyContent="space-between">
                                    <Typography variant="caption" fontWeight={600}>
                                        {t(`notifications.${key}`)}
                                    </Typography>
                                    <Switch
                                        size="small"
                                        checked={prefs[key]}
                                        onChange={() => handleTogglePref(key)}
                                    />
                                </Stack>
                            ))}
                        </Stack>
                    </Paper>
                )}

                <Divider />

                {/* Notification List */}
                {notifications.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: "center" }}>
                        <Notifications sx={{ fontSize: 36, color: "text.disabled", mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                            {t("notifications.noNotifications")}
                        </Typography>
                    </Box>
                ) : (
                    <List sx={{ p: 0, overflow: "auto", flex: 1 }}>
                        {notifications.map((notif) => (
                            <ListItem
                                key={notif.id}
                                onClick={() => handleMarkRead(notif.id)}
                                sx={{
                                    cursor: "pointer",
                                    bgcolor: notif.read ? "transparent" : alpha(theme.palette.primary.main, 0.04),
                                    borderLeft: notif.read ? "none" : `3px solid ${theme.palette.primary.main}`,
                                    "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    {getNotifIcon(notif.type)}
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <Typography variant="body2" fontWeight={notif.read ? 500 : 700} sx={{ fontSize: "0.8rem" }}>
                                                {notif.title}
                                            </Typography>
                                            {!notif.read && <Circle sx={{ fontSize: 8, color: "primary.main" }} />}
                                        </Stack>
                                    }
                                    secondary={
                                        <Stack spacing={0.25}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                                {notif.message}
                                            </Typography>
                                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6rem" }}>
                                                {formatTimeAgo(notif.timestamp)}
                                            </Typography>
                                        </Stack>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Drawer>
        </>
    );
}

export default React.memo(NotificationPanel);
