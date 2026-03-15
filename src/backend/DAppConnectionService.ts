/**
 * DAppConnectionService.ts — Handles dApp connection flow for ArfheWallet
 * 
 * Architecture:
 * 1. Primary: Opens dApp in new tab → user connects via WalletConnect QR/paste
 * 2. Fallback: For whitelisted internal dApps, uses postMessage proxy in iframe
 * 3. FHE Security Guard: Blocks dangerous FHE method calls from external dApps
 */

import { DApp } from './DAppRegistry';

// ─── FHE Security Guard ────────────────────────────────────────────
//
// These selectors/method signatures are NEVER allowed to be triggered
// directly by external dApps. They must go through our native approval UI.

/** 
 * Contract method selectors that touch FHE encrypted state.
 * External dApps must NEVER be allowed to auto-call these.
 */
const FHE_BLOCKED_SELECTORS = [
    '0x1249c58b',  // wrap() — wrapping plaintext into FHE ciphertext
    '0x2e1a7d4d',  // unwrap(uint256)
    '0xa9059cbb',  // transfer(address,uint256) — safe, but flagged for FHE tokens
    '0xde0e9a3e',  // unseal / decrypt
    '0x7fcf532c',  // withdraw (WETH-style)
];

/**
 * RPC methods that require explicit user approval via our native MUI Dialog.
 * WalletConnect session_request events with these methods trigger DAppApprovalModal.
 */
export const APPROVAL_REQUIRED_METHODS = [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
];

/**
 * Analyze a transaction request for FHE-sensitive operations.
 * Returns risk level and details for the approval modal.
 */
export interface FheRiskAnalysis {
    isFheSensitive: boolean;
    riskLevel: 'safe' | 'warning' | 'critical';
    reason: string;
    blockedSelector?: string;
}

export function analyzeFheRisk(txData: string | undefined, toAddress: string | undefined): FheRiskAnalysis {
    if (!txData || txData === '0x' || txData.length < 10) {
        return { isFheSensitive: false, riskLevel: 'safe', reason: 'Simple ETH transfer' };
    }

    const selector = txData.slice(0, 10).toLowerCase();

    for (const blocked of FHE_BLOCKED_SELECTORS) {
        if (selector === blocked) {
            return {
                isFheSensitive: true,
                riskLevel: 'critical',
                reason: `This transaction calls an FHE-sensitive function (${blocked}). Manual review required.`,
                blockedSelector: blocked,
            };
        }
    }

    // Generic contract interaction — warn
    return {
        isFheSensitive: false,
        riskLevel: 'warning',
        reason: 'Contract interaction detected. Review details carefully.',
    };
}

// ─── Connection Service ────────────────────────────────────────────

export type ConnectionMode = 'walletconnect' | 'external' | 'iframe';

export interface ConnectionResult {
    mode: ConnectionMode;
    url?: string;
    wcUri?: string;
}

/**
 * Determine the best connection strategy for a dApp.
 * 
 * Priority:
 * 1. Whitelisted dApps → can use iframe with postMessage proxy (internal tools only)
 * 2. WalletConnect-supported dApps → open externally, connect via WC v2
 * 3. Default → open in new tab, user pastes WC URI manually
 */
export function getConnectionStrategy(dApp: DApp): ConnectionMode {
    if (dApp.whitelisted) return 'iframe';
    return 'external';  // All external dApps open in new tab
}

/**
 * Open a dApp and initiate connection.
 * Returns the connection mode used.
 */
export function openDApp(dApp: DApp): ConnectionResult {
    const mode = getConnectionStrategy(dApp);

    if (mode === 'external') {
        // Open dApp in new tab — user will connect via WalletConnect from there
        window.open(dApp.url, '_blank', 'noopener,noreferrer');
        return { mode: 'external', url: dApp.url };
    }

    // iframe mode for whitelisted dApps (currently none)
    return { mode: 'iframe', url: dApp.url };
}

// ─── postMessage Proxy (for whitelisted iframe dApps) ──────────────
//
// This creates a simulated window.ethereum provider that forwards
// RPC calls from the iframe to our wallet via postMessage.
// Currently unused — reserved for future internal tools.

export interface ProxyMessage {
    type: 'arfhe-rpc-request' | 'arfhe-rpc-response';
    id: number;
    method: string;
    params?: unknown[];
    result?: unknown;
    error?: string;
}

/**
 * Validate an incoming postMessage from a whitelisted iframe.
 * Rejects messages from unknown origins.
 */
export function validateProxyMessage(event: MessageEvent, allowedOrigins: string[]): ProxyMessage | null {
    if (!allowedOrigins.includes(event.origin)) {
        return null;
    }

    const data = event.data as ProxyMessage;
    if (!data || data.type !== 'arfhe-rpc-request' || typeof data.id !== 'number') {
        return null;
    }

    // Block dangerous methods
    if (APPROVAL_REQUIRED_METHODS.includes(data.method)) {
        // These will be routed to DAppApprovalModal instead of auto-responding
        return data;
    }

    // Allow safe read-only methods
    const SAFE_METHODS = [
        'eth_chainId',
        'eth_accounts',
        'eth_blockNumber',
        'eth_getBalance',
        'eth_call',
        'eth_estimateGas',
        'eth_gasPrice',
        'eth_getCode',
        'eth_getTransactionReceipt',
        'eth_getTransactionByHash',
        'net_version',
    ];

    if (!SAFE_METHODS.includes(data.method) && !APPROVAL_REQUIRED_METHODS.includes(data.method)) {
        return null;
    }

    return data;
}

/**
 * Format a list of recent dApp connections for the UI.
 * Checks WalletConnect active sessions.
 */
export interface ActiveDAppConnection {
    name: string;
    url: string;
    icon: string;
    topic: string;
    connectedAt: number;
}

export function getRecentConnections(): ActiveDAppConnection[] {
    try {
        const raw = localStorage.getItem('arfhe_recent_dapps');
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

export function addRecentConnection(conn: Omit<ActiveDAppConnection, 'connectedAt'>): void {
    const recents = getRecentConnections();
    const filtered = recents.filter(r => r.url !== conn.url);
    filtered.unshift({ ...conn, connectedAt: Date.now() });
    // Keep max 10 recent connections
    localStorage.setItem('arfhe_recent_dapps', JSON.stringify(filtered.slice(0, 10)));
}

export function clearRecentConnections(): void {
    localStorage.removeItem('arfhe_recent_dapps');
}
