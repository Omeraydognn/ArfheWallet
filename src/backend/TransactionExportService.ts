/**
 * TransactionExportService.ts — Export Transaction History to CSV
 *
 * Converts TransactionHistory[] to a downloadable CSV file
 * suitable for tax reporting, accounting, and record-keeping.
 */

import { TransactionHistory } from "./NetworkTypes.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface ExportOptions {
    /** Which fields to include (default: all) */
    fields?: (keyof CsvRow)[];
    /** Filename without extension */
    filename?: string;
    /** Include header row */
    includeHeader?: boolean;
}

interface CsvRow {
    date: string;
    time: string;
    type: string;
    status: string;
    from: string;
    to: string;
    amount: string;
    token: string;
    txHash: string;
    explorerUrl: string;
    isConfidential: string;
    methodLabel: string;
}

// ─── CSV Builder ────────────────────────────────────────────────────

const DEFAULT_FIELDS: (keyof CsvRow)[] = [
    "date", "time", "type", "status", "from", "to",
    "amount", "token", "txHash", "explorerUrl", "isConfidential", "methodLabel"
];

const HEADER_LABELS: Record<keyof CsvRow, string> = {
    date: "Date",
    time: "Time",
    type: "Type (Send/Receive)",
    status: "Status",
    from: "From",
    to: "To",
    amount: "Amount",
    token: "Token",
    txHash: "Transaction Hash",
    explorerUrl: "Explorer URL",
    isConfidential: "Confidential (FHE)",
    methodLabel: "Method",
};

/** Escape a CSV field value (handle commas, quotes, newlines) */
function escapeCsv(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/** Convert a single transaction to a CSV row */
function txToCsvRow(tx: TransactionHistory, userAddress: string): CsvRow {
    const date = tx.timestamp ? new Date(tx.timestamp) : new Date();
    const isOutgoing = tx.from.toLowerCase() === userAddress.toLowerCase();

    return {
        date: date.toLocaleDateString("en-CA"), // YYYY-MM-DD format
        time: date.toLocaleTimeString("en-GB", { hour12: false }), // HH:MM:SS
        type: isOutgoing ? "Send" : "Receive",
        status: tx.status,
        from: tx.from,
        to: tx.to,
        amount: tx.value,
        token: tx.isNative ? "ETH" : (tx.contractAddress || "ERC20"),
        txHash: tx.hash,
        explorerUrl: tx.explorerUrl || "",
        isConfidential: tx.isShielded ? "Yes" : "No",
        methodLabel: tx.methodLabel || "Transfer",
    };
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Generate CSV string from transaction history.
 */
export function generateCsv(
    transactions: TransactionHistory[],
    userAddress: string,
    options?: ExportOptions
): string {
    const fields = options?.fields || DEFAULT_FIELDS;
    const includeHeader = options?.includeHeader !== false;

    const lines: string[] = [];

    // Header row
    if (includeHeader) {
        lines.push(fields.map(f => escapeCsv(HEADER_LABELS[f])).join(","));
    }

    // Data rows
    for (const tx of transactions) {
        const row = txToCsvRow(tx, userAddress);
        lines.push(fields.map(f => escapeCsv(row[f])).join(","));
    }

    return lines.join("\n");
}

/**
 * Download CSV as a file in the browser.
 */
export function downloadCsv(
    transactions: TransactionHistory[],
    userAddress: string,
    options?: ExportOptions
): void {
    const csv = generateCsv(transactions, userAddress, options);
    const filename = (options?.filename || `arfhe_tx_history_${new Date().toISOString().split("T")[0]}`) + ".csv";

    // BOM for UTF-8 Excel compatibility
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}
