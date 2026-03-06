/**
 * DomainResolver.ts
 *
 * Resolves human-readable Web3 domain names to Ethereum wallet addresses.
 *
 * - ENS (.eth)          → resolved via ethers.js + public Ethereum Mainnet RPC
 * - Unstoppable Domains (.crypto, .nft, .polygon, .blockchain, .dao etc.)
 *                       → resolved via @unstoppabledomains/resolution SDK
 *
 * Resolution is ALWAYS done against Ethereum Mainnet, regardless of the
 * currently active network in the wallet (testnets don't have on-chain ENS data).
 *
 * IMPORTANT: This module should only be called after a debounce delay 
 * (500ms minimum) to protect RPC rate limits.
 */

import { JsonRpcProvider, isAddress } from "ethers";

// ------------------------------------------------------------------
// Supported domain suffixes
// ------------------------------------------------------------------

const ENS_SUFFIXES = [".eth"];

const UD_SUFFIXES = [
    ".crypto", ".nft", ".polygon", ".blockchain", ".bitcoin", ".wallet",
    ".dao", ".888", ".zil", ".x", ".klever", ".hi", ".kresus", ".unstoppable",
    ".pudgy", ".anime", ".go", ".altimist",
];

/**
 * Detect whether the given string is a domain name we can resolve.
 */
export function isDomainName(input: string): boolean {
    if (!input || input.startsWith("0x")) return false;
    const lower = input.toLowerCase().trim();
    return (
        ENS_SUFFIXES.some((suf) => lower.endsWith(suf)) ||
        UD_SUFFIXES.some((suf) => lower.endsWith(suf))
    );
}

export function isEnsDomain(input: string): boolean {
    return ENS_SUFFIXES.some((suf) => input.toLowerCase().trim().endsWith(suf));
}

export function isUdDomain(input: string): boolean {
    return UD_SUFFIXES.some((suf) => input.toLowerCase().trim().endsWith(suf));
}

// ------------------------------------------------------------------
// ENS Resolution (via ethers.js on Mainnet)
// ------------------------------------------------------------------

const ETH_MAINNET_RPC =
    (import.meta as any).env.VITE_ALCHEMY_MAINNET_API_KEY ||
    "https://cloudflare-eth.com"; // CORS-safe public fallback

let ensProvider: JsonRpcProvider | null = null;
function getEnsProvider(): JsonRpcProvider {
    if (!ensProvider) {
        ensProvider = new JsonRpcProvider(ETH_MAINNET_RPC);
    }
    return ensProvider;
}

async function resolveENS(name: string): Promise<string | null> {
    try {
        const provider = getEnsProvider();
        const resolved = await provider.resolveName(name);
        if (resolved && isAddress(resolved)) return resolved;
        return null;
    } catch (e) {
        console.warn(`[DomainResolver] ENS resolution failed for "${name}":`, e);
        return null;
    }
}

// ------------------------------------------------------------------
// Unstoppable Domains Resolution
// ------------------------------------------------------------------

let udResolution: any = null;

async function getUdResolution(): Promise<any> {
    if (udResolution) return udResolution;
    try {
        // Dynamic import so the heavy UD SDK doesn't block initial page load
        const { default: Resolution } = await import("@unstoppabledomains/resolution");
        udResolution = new Resolution();
        return udResolution;
    } catch (e) {
        console.error("[DomainResolver] Failed to load @unstoppabledomains/resolution:", e);
        return null;
    }
}

async function resolveUD(name: string): Promise<string | null> {
    try {
        const resolution = await getUdResolution();
        if (!resolution) return null;
        const address: string = await resolution.addr(name, "ETH");
        if (address && isAddress(address)) return address;
        return null;
    } catch (e: any) {
        // UD throws specific errors for unregistered or unsupported domains
        console.warn(`[DomainResolver] UD resolution failed for "${name}":`, e?.message ?? e);
        return null;
    }
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

export interface DomainResolutionResult {
    /** The resolved 0x address, or null if resolution failed */
    address: string | null;
    /** The method used: 'ens' | 'ud' | null */
    method: "ens" | "ud" | null;
    /** Human-readable error message if resolution failed */
    error: string | null;
}

/**
 * Resolve a human-readable domain name to an Ethereum address.
 *
 * Returns a structured result that includes the address, method, and any error.
 * This function should only be called after a debounce delay.
 */
export async function resolveDomain(
    input: string
): Promise<DomainResolutionResult> {
    const name = input.trim().toLowerCase();

    if (!name) {
        return { address: null, method: null, error: "Empty input" };
    }

    if (isEnsDomain(name)) {
        const address = await resolveENS(name);
        if (address) return { address, method: "ens", error: null };
        return {
            address: null,
            method: "ens",
            error: `Could not find an Ethereum address for "${input}". Make sure the ENS name is registered and has an ETH record set.`,
        };
    }

    if (isUdDomain(name)) {
        const address = await resolveUD(name);
        if (address) return { address, method: "ud", error: null };
        return {
            address: null,
            method: "ud",
            error: `Could not find an Ethereum address for "${input}". Make sure the domain is registered with an ETH record.`,
        };
    }

    return {
        address: null,
        method: null,
        error: "Unrecognized domain suffix.",
    };
}
