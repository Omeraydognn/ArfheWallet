/**
 * DAppRegistry.ts — Curated dApp Directory for ArfheWallet Explore page
 * 
 * Provides a safe, categorized list of vetted dApps with WalletConnect 
 * deep-link support. No iframe injection — connections go through WC v2.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type DAppCategory = 'defi' | 'dex' | 'fhe' | 'nft' | 'bridge' | 'tools' | 'social' | 'game';

export interface DApp {
    id: string;
    name: string;
    description: string;
    url: string;
    icon: string;
    category: DAppCategory;
    chains: number[];          // Supported chain IDs
    tags: string[];
    featured?: boolean;
    wcProjectId?: string;      // WalletConnect project ID for deep linking
    /** If true, this dApp can be opened in a whitelisted iframe with postMessage proxy */
    whitelisted?: boolean;
}

export interface DAppCategoryInfo {
    id: DAppCategory;
    label: string;
    labelKey: string;          // i18n key
    icon: string;              // MUI icon name hint
    color: string;
}

// ─── Categories ─────────────────────────────────────────────────────

export const DAPP_CATEGORIES: DAppCategoryInfo[] = [
    { id: 'defi',   label: 'DeFi',          labelKey: 'explore.catDefi',   icon: 'AccountBalance', color: '#2563eb' },
    { id: 'dex',    label: 'DEX',           labelKey: 'explore.catDex',    icon: 'SwapHoriz',      color: '#525252' },
    { id: 'fhe',    label: 'FHE Ecosystem', labelKey: 'explore.catFhe',    icon: 'Shield',         color: '#10b981' },
    { id: 'nft',    label: 'NFTs',          labelKey: 'explore.catNft',    icon: 'Image',          color: '#f59e0b' },
    { id: 'bridge', label: 'Bridge',        labelKey: 'explore.catBridge', icon: 'CompareArrows',  color: '#3b82f6' },
    { id: 'tools',  label: 'Tools',         labelKey: 'explore.catTools',  icon: 'Build',          color: '#1e3a8a' },
    { id: 'social', label: 'Social',        labelKey: 'explore.catSocial', icon: 'People',         color: '#06b6d4' },
    { id: 'game',   label: 'Games',         labelKey: 'explore.catGame',   icon: 'SportsEsports',  color: '#9333ea' },
];

// ─── Curated dApp Registry ─────────────────────────────────────────

export const DAPP_REGISTRY: DApp[] = [
    // ── DeFi ──
    {
        id: 'aave-v3',
        name: 'Aave V3',
        description: 'Decentralized lending & borrowing protocol',
        url: 'https://app.aave.com',
        icon: 'https://app.aave.com/favicon.ico',
        category: 'defi',
        chains: [1, 42161, 8453],
        tags: ['lending', 'borrowing', 'flash-loans'],
        featured: true,
    },
    {
        id: 'compound',
        name: 'Compound',
        description: 'Algorithmic money market protocol',
        url: 'https://app.compound.finance',
        icon: 'https://app.compound.finance/images/compound-192.png',
        category: 'defi',
        chains: [1, 42161, 8453],
        tags: ['lending', 'interest'],
    },
    {
        id: 'lido',
        name: 'Lido',
        description: 'Liquid staking for Ethereum',
        url: 'https://stake.lido.fi',
        icon: 'https://stake.lido.fi/favicon.ico',
        category: 'defi',
        chains: [1],
        tags: ['staking', 'liquid-staking'],
        featured: true,
    },
    {
        id: 'eigenlayer',
        name: 'EigenLayer',
        description: 'Restaking protocol for Ethereum security',
        url: 'https://app.eigenlayer.xyz',
        icon: 'https://app.eigenlayer.xyz/favicon.ico',
        category: 'defi',
        chains: [1],
        tags: ['restaking', 'security'],
    },
    {
        id: 'maker',
        name: 'MakerDAO (Sky)',
        description: 'Decentralized stablecoin & lending',
        url: 'https://app.sky.money',
        icon: 'https://app.sky.money/favicon.ico',
        category: 'defi',
        chains: [1],
        tags: ['stablecoin', 'dai', 'lending'],
    },

    // ── DEX ──
    {
        id: 'uniswap',
        name: 'Uniswap',
        description: 'The largest decentralized exchange',
        url: 'https://app.uniswap.org',
        icon: 'https://app.uniswap.org/favicon.png',
        category: 'dex',
        chains: [1, 42161, 8453],
        tags: ['swap', 'amm', 'liquidity'],
        featured: true,
    },
    {
        id: '1inch',
        name: '1inch',
        description: 'DEX aggregator for best swap rates',
        url: 'https://app.1inch.io',
        icon: 'https://app.1inch.io/assets/images/favicon.png',
        category: 'dex',
        chains: [1, 42161, 8453],
        tags: ['aggregator', 'swap'],
        featured: true,
    },
    {
        id: 'sushiswap',
        name: 'SushiSwap',
        description: 'Multi-chain decentralized exchange',
        url: 'https://www.sushi.com/swap',
        icon: 'https://www.sushi.com/favicon.ico',
        category: 'dex',
        chains: [1, 42161],
        tags: ['swap', 'amm'],
    },
    {
        id: 'curve',
        name: 'Curve Finance',
        description: 'Stablecoin-focused DEX with low slippage',
        url: 'https://curve.fi',
        icon: 'https://curve.fi/favicon.ico',
        category: 'dex',
        chains: [1, 42161],
        tags: ['stablecoin', 'swap', 'low-slippage'],
    },
    {
        id: 'balancer',
        name: 'Balancer',
        description: 'Programmable liquidity protocol',
        url: 'https://app.balancer.fi',
        icon: 'https://app.balancer.fi/favicon.ico',
        category: 'dex',
        chains: [1, 42161, 8453],
        tags: ['amm', 'liquidity', 'weighted-pools'],
    },

    // ── FHE Ecosystem ──
    {
        id: 'fhenix-explorer',
        name: 'Fhenix Explorer',
        description: 'Block explorer for Fhenix FHE network',
        url: 'https://explorer.helium.fhenix.zone',
        icon: 'https://www.fhenix.io/favicon.ico',
        category: 'fhe',
        chains: [8008135],
        tags: ['explorer', 'fhenix', 'fhe'],
        featured: true,
    },
    {
        id: 'fhenix-docs',
        name: 'Fhenix Docs',
        description: 'Official Fhenix documentation & guides',
        url: 'https://docs.fhenix.zone',
        icon: 'https://www.fhenix.io/favicon.ico',
        category: 'fhe',
        chains: [8008135],
        tags: ['docs', 'fhenix'],
    },
    {
        id: 'inco-network',
        name: 'Inco Network',
        description: 'Confidential computing chain using FHE',
        url: 'https://www.inco.org',
        icon: 'https://www.inco.org/favicon.ico',
        category: 'fhe',
        chains: [1],
        tags: ['fhe', 'confidential', 'privacy'],
        featured: true,
    },
    {
        id: 'zama',
        name: 'Zama',
        description: 'FHE tooling & TFHE library provider',
        url: 'https://www.zama.ai',
        icon: 'https://www.zama.ai/favicon.ico',
        category: 'fhe',
        chains: [],
        tags: ['fhe', 'tfhe', 'tooling'],
    },

    // ── NFT ──
    {
        id: 'opensea',
        name: 'OpenSea',
        description: 'The largest NFT marketplace',
        url: 'https://opensea.io',
        icon: 'https://opensea.io/favicon.ico',
        category: 'nft',
        chains: [1, 42161, 8453],
        tags: ['marketplace', 'nft'],
        featured: true,
    },
    {
        id: 'blur',
        name: 'Blur',
        description: 'Pro NFT marketplace with rewards',
        url: 'https://blur.io',
        icon: 'https://blur.io/favicon.ico',
        category: 'nft',
        chains: [1],
        tags: ['marketplace', 'nft', 'pro'],
    },
    {
        id: 'zora',
        name: 'Zora',
        description: 'Create, collect, and earn on Zora',
        url: 'https://zora.co',
        icon: 'https://zora.co/favicon.ico',
        category: 'nft',
        chains: [1, 8453],
        tags: ['mint', 'nft', 'creator'],
    },

    // ── Bridge ──
    {
        id: 'stargate',
        name: 'Stargate',
        description: 'Cross-chain bridge by LayerZero',
        url: 'https://stargate.finance',
        icon: 'https://stargate.finance/favicon.ico',
        category: 'bridge',
        chains: [1, 42161, 8453],
        tags: ['bridge', 'cross-chain'],
        featured: true,
    },
    {
        id: 'hop-protocol',
        name: 'Hop Protocol',
        description: 'Fast bridge between L2s and Ethereum',
        url: 'https://app.hop.exchange',
        icon: 'https://app.hop.exchange/favicon.ico',
        category: 'bridge',
        chains: [1, 42161, 8453],
        tags: ['bridge', 'l2'],
    },
    {
        id: 'across',
        name: 'Across Protocol',
        description: 'Optimistic bridge for fast transfers',
        url: 'https://app.across.to',
        icon: 'https://app.across.to/favicon.ico',
        category: 'bridge',
        chains: [1, 42161, 8453],
        tags: ['bridge', 'optimistic'],
    },

    // ── Tools ──
    {
        id: 'etherscan',
        name: 'Etherscan',
        description: 'Ethereum blockchain explorer',
        url: 'https://etherscan.io',
        icon: 'https://etherscan.io/images/favicon3.ico',
        category: 'tools',
        chains: [1, 11155111],
        tags: ['explorer', 'analytics'],
    },
    {
        id: 'revoke-cash',
        name: 'Revoke.cash',
        description: 'Check and revoke token approvals',
        url: 'https://revoke.cash',
        icon: 'https://revoke.cash/favicon.ico',
        category: 'tools',
        chains: [1, 42161, 8453],
        tags: ['security', 'approvals'],
    },
    {
        id: 'dexscreener',
        name: 'DEX Screener',
        description: 'Real-time DEX analytics and charts',
        url: 'https://dexscreener.com',
        icon: 'https://dexscreener.com/favicon.ico',
        category: 'tools',
        chains: [1, 42161, 8453],
        tags: ['analytics', 'charts', 'tracking'],
    },
    {
        id: 'debank',
        name: 'DeBank',
        description: 'Portfolio tracker & DeFi dashboard',
        url: 'https://debank.com',
        icon: 'https://debank.com/favicon.ico',
        category: 'tools',
        chains: [1, 42161, 8453],
        tags: ['portfolio', 'tracker'],
    },

    // ── Social ──
    {
        id: 'ens',
        name: 'ENS Domains',
        description: 'Decentralized naming system for Ethereum',
        url: 'https://app.ens.domains',
        icon: 'https://app.ens.domains/favicon.ico',
        category: 'social',
        chains: [1],
        tags: ['names', 'identity', 'ens'],
        featured: true,
    },
    {
        id: 'snapshot',
        name: 'Snapshot',
        description: 'Off-chain governance voting platform',
        url: 'https://snapshot.org',
        icon: 'https://snapshot.org/favicon.ico',
        category: 'social',
        chains: [1],
        tags: ['governance', 'voting', 'dao'],
    },

    // ── Game ──
    {
        id: 'a2-saga',
        name: 'A2 Saga',
        description: 'Turkish Mythology MOBA Strategy Game',
        url: 'https://a2saga.me/',
        icon: 'https://a2saga.me/assets/logo-oXpWOEJi.webp',
        category: 'game',
        chains: [1],
        tags: ['game', 'moba', 'strategy', 'web3'],
        featured: true,
    },
];

// ─── Helper Functions ───────────────────────────────────────────────

export function getDAppsByCategory(category: DAppCategory): DApp[] {
    return DAPP_REGISTRY.filter(d => d.category === category);
}

export function getFeaturedDApps(): DApp[] {
    return DAPP_REGISTRY.filter(d => d.featured);
}

export function searchDApps(query: string): DApp[] {
    const q = query.toLowerCase().trim();
    if (!q) return DAPP_REGISTRY;
    return DAPP_REGISTRY.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.tags.some(t => t.includes(q)) ||
        d.category.includes(q)
    );
}

export function getDAppById(id: string): DApp | undefined {
    return DAPP_REGISTRY.find(d => d.id === id);
}

/** Filter dApps compatible with a given chain ID */
export function getDAppsForChain(chainId: number): DApp[] {
    return DAPP_REGISTRY.filter(d => d.chains.length === 0 || d.chains.includes(chainId));
}
