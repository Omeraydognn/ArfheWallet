/**
 * Shared component prop types
 * Used across various UI components
 */

import type { Theme } from "@mui/material/styles";
import type { NetworkId } from "../backend/NetworkTypes.js";
import type { Dispatch, SetStateAction, SyntheticEvent, ReactNode } from "react";

// ─── ArfBar Props ─────────────────────────────────────────────────

export interface ArfBarProps {
  network: number;
  setNetwork: Dispatch<SetStateAction<number>>;
}

// ─── Privacy Page ─────────────────────────────────────────────────

export interface PrivacyOptionProps {
  label: string;
  active: boolean;
  color: "error" | "warning" | "success";
  icon: ReactNode;
  onClick: () => void;
}

// ─── GraphExplorer DataCard ───────────────────────────────────────

export interface DataCardProps {
  label: string;
  value: string | number;
  copyable?: boolean;
  highlight?: boolean;
}

// ─── Chart Tooltip (Recharts) ─────────────────────────────────────

export interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; payload?: Record<string, unknown> }>;
  label?: string;
}

// ─── DApp Approval Modal ──────────────────────────────────────────

export interface DAppApprovalParams {
  origin: string;
  method: string;
  params: unknown[];
  favicon?: string;
}

// ─── WalletConnect Manager ────────────────────────────────────────

/** WC Session display info for Revoke/Explore pages */
export interface WCSessionInfo {
  topic: string;
  peer: {
    metadata: {
      name: string;
      url: string;
      icons: string[];
      description?: string;
    };
  };
  namespaces: Record<string, WCNamespace>;
  expiry: number;
}

export interface WCNamespace {
  chains?: string[];
  accounts?: string[];
  methods?: string[];
  events?: string[];
}

// ─── Image Error Handler ──────────────────────────────────────────

/** Type for img onError event handler */
export type ImageErrorEvent = SyntheticEvent<HTMLImageElement, Event>;

// ─── Theme helper ─────────────────────────────────────────────────

/** MUI Theme type for sx helper functions */
export type MuiTheme = Theme;
