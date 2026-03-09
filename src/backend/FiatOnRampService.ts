/**
 * FiatOnRampService.ts — Fiat On-Ramp Provider Integration
 *
 * Supports three major on-ramp providers:
 *  - MoonPay   — moonpay.com
 *  - Transak   — transak.com
 *  - Ramp      — ramp.network
 *
 * Each provider generates a URL that opens in a new tab / embedded iframe.
 * The wallet address and preferred currency are pre-filled.
 */

// ─── API KEY CONFIG ─────────────────────────────────────────────────
//
//  ⬇️  API KEY'LERİNİZİ BURAYA YAZIN  ⬇️
//
//  Her provider'ın dashboard'undan alacağınız key'leri aşağıya koyun.
//  Key yoksa boş string bırakın — mevcut fallback modlar kullanılır.
//
//  MoonPay  → https://dashboard.moonpay.com → Developers → API Keys → Publishable Key (pk_live_...)
//  Transak  → https://dashboard.transak.com → Settings → API Key (production)
//  Ramp     → https://docs.ramp.network     → Dashboard → Host API Key
//
const MOONPAY_API_KEY  = '';   // pk_live_xxxxx  (yoksa MoonPay sayfasında kullanıcı kendi wallet adresini girer)
const TRANSAK_API_KEY  = '';   // xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  (yoksa staging key kullanılır)
const RAMP_API_KEY     = '';   // xxxxxxxx  (opsiyonel — key'siz de çalışır, limitler düşük olur)

// ─── Types ──────────────────────────────────────────────────────────

export type OnRampProvider = 'moonpay' | 'transak' | 'ramp';

export interface OnRampConfig {
    /** User's wallet address to receive crypto */
    walletAddress: string;
    /** Fiat currency code (USD, EUR, TRY, GBP…) */
    fiatCurrency?: string;
    /** Fiat amount to pre-fill */
    fiatAmount?: number;
    /** Crypto currency code to buy (ETH, USDC, USDT…) */
    cryptoCurrency?: string;
    /** Network name for provider context (ethereum, arbitrum, base) */
    network?: string;
    /** Chain ID for provider-specific network params */
    chainId?: number;
}

export interface OnRampProviderInfo {
    id: OnRampProvider;
    name: string;
    description: string;
    logo: string;          // emoji or URL
    supportedFiat: string[];
    supportedCrypto: string[];
    fees: string;           // human-readable fee range
    color: string;          // brand color for UI
}

// ─── Provider Metadata ─────────────────────────────────────────────

export const ONRAMP_PROVIDERS: OnRampProviderInfo[] = [
    {
        id: 'moonpay',
        name: 'MoonPay',
        description: 'Buy crypto with card, bank transfer, Apple Pay',
        logo: '🌙',
        supportedFiat: ['USD', 'EUR', 'GBP', 'TRY', 'AUD', 'CAD', 'CHF', 'JPY', 'KRW', 'BRL'],
        supportedCrypto: ['ETH', 'USDC', 'USDT', 'DAI', 'MATIC', 'BNB', 'AVAX', 'ARB'],
        fees: '1.5% – 4.5%',
        color: '#1e40af',
    },
    {
        id: 'transak',
        name: 'Transak',
        description: 'Card, bank transfer, and local payment methods',
        logo: '💳',
        supportedFiat: ['USD', 'EUR', 'GBP', 'TRY', 'INR', 'BRL', 'ARS', 'MXN', 'PHP', 'VND'],
        supportedCrypto: ['ETH', 'USDC', 'USDT', 'DAI', 'MATIC', 'ARB', 'BNB'],
        fees: '1% – 5%',
        color: '#0364FF',
    },
    {
        id: 'ramp',
        name: 'Ramp Network',
        description: 'Instant crypto with cards and open banking',
        logo: '⚡',
        supportedFiat: ['USD', 'EUR', 'GBP', 'PLN', 'SEK', 'CHF', 'AUD', 'BRL'],
        supportedCrypto: ['ETH', 'USDC', 'USDT', 'DAI', 'MATIC'],
        fees: '0.49% – 2.49%',
        color: '#21BF73',
    },
];

// ─── Network → Provider chain key mapping ───────────────────────────

const MOONPAY_CHAINS: Record<number, string> = {
    1: 'ethereum',
    42161: 'arbitrum',
    8453: 'base',
    11155111: 'ethereum',  // Sepolia → default to ethereum
};

const TRANSAK_CHAINS: Record<number, string> = {
    1: 'ethereum',
    42161: 'arbitrum',
    8453: 'base',
    137: 'polygon',
};

const RAMP_CHAINS: Record<number, string> = {
    1: 'ETH',
    42161: 'ARBITRUM',
    8453: 'BASE',
    137: 'MATIC',
};

// ─── Currency code helpers ──────────────────────────────────────────

/** Map crypto code to MoonPay currency code with chain suffix */
function moonpayCurrencyCode(crypto: string, chainId?: number): string {
    const base = crypto.toLowerCase();
    // MoonPay uses suffixes like _arbitrum, _base for L2
    if (chainId && chainId !== 1) {
        const chain = MOONPAY_CHAINS[chainId];
        if (chain && chain !== 'ethereum') {
            return `${base}_${chain}`;
        }
    }
    return base;
}

/** Map crypto code to Transak currency code */
function transakCurrencyCode(crypto: string): string {
    return crypto.toUpperCase();
}

// ─── URL Builders ──────────────────────────────────────────────────

/**
 * Build MoonPay widget URL
 * Docs: https://dev.moonpay.com/docs
 *
 * API key varsa: tam widget entegrasyonu, walletAddress otomatik doldurulur.
 * API key yoksa: MoonPay sayfası açılır, kullanıcı kendi adresini girer.
 *   Ama currency ve amount yine de pre-fill edilir.
 */
function buildMoonPayUrl(config: OnRampConfig): string {
    const base = MOONPAY_API_KEY
        ? 'https://buy.moonpay.com'
        : 'https://www.moonpay.com/buy';

    const params = new URLSearchParams();

    if (MOONPAY_API_KEY) {
        // Partner entegrasyonu — tüm parametreler çalışır
        params.set('apiKey', MOONPAY_API_KEY);
        params.set('walletAddress', config.walletAddress);
        params.set('currencyCode', moonpayCurrencyCode(config.cryptoCurrency || 'ETH', config.chainId));
        if (config.fiatCurrency) {
            params.set('baseCurrencyCode', config.fiatCurrency.toLowerCase());
        }
        if (config.fiatAmount && config.fiatAmount > 0) {
            params.set('baseCurrencyAmount', String(config.fiatAmount));
        }
        params.set('colorCode', '#2563eb');
        params.set('theme', 'dark');
    } else {
        // Key yok — MoonPay'in genel sayfasına yönlendir
        // moonpay.com/buy sayfası currencyCode ile pre-select destekler
        const crypto = config.cryptoCurrency?.toLowerCase() || 'eth';
        params.set('currencyCode', crypto);
        if (config.fiatCurrency) {
            params.set('baseCurrencyCode', config.fiatCurrency.toLowerCase());
        }
        if (config.fiatAmount && config.fiatAmount > 0) {
            params.set('baseCurrencyAmount', String(config.fiatAmount));
        }
    }

    return `${base}?${params.toString()}`;
}

/**
 * Build Transak widget URL
 * Docs: https://docs.transak.com/docs/query-parameters
 *
 * Transak, apiKey + referrerDomain zorunlu tutuyor.
 * Production key varsa: production URL kullanılır.
 * Key yoksa: staging ortamı kullanılır (gerçek işlem yapılamaz, sadece test).
 */
function buildTransakUrl(config: OnRampConfig): string {
    const hasProductionKey = !!TRANSAK_API_KEY;
    const base = hasProductionKey
        ? 'https://global.transak.com'
        : 'https://global-stg.transak.com';
    const apiKey = hasProductionKey
        ? TRANSAK_API_KEY
        : '4fcd6904-706b-4aff-bd9d-77422813bbb7';  // Transak public staging key

    const params = new URLSearchParams();

    params.set('apiKey', apiKey);
    params.set('walletAddress', config.walletAddress);
    params.set('defaultCryptoCurrency', transakCurrencyCode(config.cryptoCurrency || 'ETH'));

    if (config.fiatCurrency) {
        params.set('fiatCurrency', config.fiatCurrency.toUpperCase());
    }
    if (config.fiatAmount && config.fiatAmount > 0) {
        params.set('fiatAmount', String(config.fiatAmount));
    }
    if (config.chainId) {
        const network = TRANSAK_CHAINS[config.chainId];
        if (network) params.set('network', network);
    }

    // UI customization
    params.set('themeColor', '4f46e5');
    params.set('hideMenu', 'true');
    params.set('productsAvailed', 'BUY');

    return `${base}?${params.toString()}`;
}

/**
 * Build Ramp Network widget URL
 * Docs: https://docs.ramp.network/configuration
 *
 * Production key varsa: app.ramp.network kullanılır.
 * Key yoksa: app.demo.rampnetwork.com (demo mode, test ortamı) kullanılır.
 *
 * Not: swapAsset deprecated oldu, yeni API: enabledCryptoAssets, inAsset, outAsset
 */
function buildRampUrl(config: OnRampConfig): string {
    const hasKey = !!RAMP_API_KEY;
    const base = hasKey
        ? 'https://app.ramp.network'
        : 'https://app.demo.rampnetwork.com';

    const params = new URLSearchParams();

    if (hasKey) {
        params.set('hostApiKey', RAMP_API_KEY);
    }
    params.set('hostAppName', 'ArfheWallet');
    params.set('userAddress', config.walletAddress);
    params.set('enabledFlows', 'ONRAMP');
    params.set('defaultFlow', 'ONRAMP');

    // Yeni unified parametreler
    const chain = config.chainId ? RAMP_CHAINS[config.chainId] : 'ETH';
    const crypto = config.cryptoCurrency?.toUpperCase() || 'ETH';
    const cryptoAsset = `${chain || 'ETH'}_${crypto}`;
    params.set('enabledCryptoAssets', `${chain || 'ETH'}_*`);
    params.set('defaultAsset', cryptoAsset);

    if (config.fiatCurrency) {
        params.set('fiatCurrency', config.fiatCurrency.toUpperCase());
    }
    if (config.fiatAmount && config.fiatAmount > 0) {
        params.set('fiatValue', String(config.fiatAmount));
    }

    params.set('variant', 'hosted');

    return `${base}?${params.toString()}`;
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Get the on-ramp URL for a given provider.
 */
export function getOnRampUrl(provider: OnRampProvider, config: OnRampConfig): string {
    switch (provider) {
        case 'moonpay':
            return buildMoonPayUrl(config);
        case 'transak':
            return buildTransakUrl(config);
        case 'ramp':
            return buildRampUrl(config);
        default:
            throw new Error(`Unknown on-ramp provider: ${provider}`);
    }
}

/**
 * Open the on-ramp widget in a new browser tab.
 */
export function openOnRamp(provider: OnRampProvider, config: OnRampConfig): void {
    const url = getOnRampUrl(provider, config);
    window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Get provider info by id.
 */
export function getProviderInfo(provider: OnRampProvider): OnRampProviderInfo | undefined {
    return ONRAMP_PROVIDERS.find(p => p.id === provider);
}

// ─── Fiat currencies ───────────────────────────────────────────────

export const SUPPORTED_FIAT_CURRENCIES = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'KRW', symbol: '₩', name: 'Korean Won' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
];

/** Detect user's likely fiat currency from browser locale */
export function detectFiatCurrency(): string {
    try {
        const locale = navigator.language || 'en-US';
        const region = locale.split('-')[1]?.toUpperCase();
        const regionMap: Record<string, string> = {
            US: 'USD', GB: 'GBP', TR: 'TRY', JP: 'JPY',
            KR: 'KRW', BR: 'BRL', AU: 'AUD', CA: 'CAD',
            CH: 'CHF', IN: 'INR', DE: 'EUR', FR: 'EUR',
            IT: 'EUR', ES: 'EUR', NL: 'EUR', PT: 'EUR',
            AT: 'EUR', BE: 'EUR', IE: 'EUR', FI: 'EUR',
        };
        return regionMap[region || ''] || 'USD';
    } catch {
        return 'USD';
    }
}
