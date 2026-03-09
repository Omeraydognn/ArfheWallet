import StorageManager from './StorageManager';

export interface Contact {
    id: string;
    name: string;
    address: string;
    createdAt: number;
}

export interface RecentAddress {
    address: string;
    label?: string;       // Auto-resolved label from contacts or known contracts
    lastUsed: number;     // Unix ms timestamp
}

// ─── Known Contract Labels ──────────────────────────────────────────
// Well-known smart contracts with human-readable labels.
// Lowercase addresses → label map, keyed by chain.
// "all" applies to all networks.

const KNOWN_CONTRACTS: Record<string, Record<string, string>> = {
    // ── Cross-chain (common across networks) ──
    all: {},
    // ── Ethereum Mainnet (chainId 1) ──
    "1": {
        "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
        "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
        "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router",
        "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 2",
        "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "SushiSwap Router",
        "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch V5 Router",
        "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
        "0x00000000006c3852cbef3e08e8df289169ede581": "OpenSea Seaport 1.1",
        "0x00000000000001ad428e4906ae43d8f9852d0dd6": "OpenSea Seaport 1.5",
        "0x00000000000000adc04c56bf30ac9d3c0aaf14dc": "OpenSea Seaport 1.6",
        "0x7f268357a8c2552623316e2562d90e642bb538e5": "OpenSea Wyvern V2",
        "0x7be8076f4ea4a4ad08075c2508e481d6c946d12b": "OpenSea Wyvern V1",
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
        "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
        "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
        "0x7a16ff8270133f063aab6c9977183d9e72835428": "ENS Registrar Controller",
        "0xc36442b4a4522e871399cd717abdd847ab11fe88": "Uniswap V3 Positions NFT",
        "0x881d40237659c251811cec9c364ef91dc08d300c": "MetaMask Swap Router",
        "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "Lido stETH",
        "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": "AAVE Token",
        "0xba12222222228d8ba445958a75a0704d566bf2c8": "Balancer Vault",
    },
    // ── Arbitrum One (chainId 42161) ──
    "42161": {
        "0x5e325eda8064b456f4781070c0738d849c824258": "Uniswap Universal Router",
        "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
        "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": "SushiSwap Router",
        "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch V5 Router",
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH (Arbitrum)",
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC (Arbitrum)",
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT (Arbitrum)",
        "0x912ce59144191c1204e64559fe8253a0e49e6548": "ARB Token",
    },
    // ── Base (chainId 8453) ──
    "8453": {
        "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router",
        "0x2626664c2603336e57b271c5c0b26f421741e481": "Uniswap V3 Router",
        "0x4200000000000000000000000000000000000006": "WETH (Base)",
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC (Base)",
    },
};

/**
 * Resolve a known contract label by address + chainId.
 * Returns label or undefined if not found.
 */
export function getKnownContractLabel(address: string, chainId?: number): string | undefined {
    const lower = address.toLowerCase();
    // Check chain-specific first
    if (chainId) {
        const chainMap = KNOWN_CONTRACTS[String(chainId)];
        if (chainMap?.[lower]) return chainMap[lower];
    }
    // Then check cross-chain
    if (KNOWN_CONTRACTS.all[lower]) return KNOWN_CONTRACTS.all[lower];
    // Check Ethereum mainnet as universal fallback (many contracts are on same address cross-chain)
    if (KNOWN_CONTRACTS["1"]?.[lower]) return KNOWN_CONTRACTS["1"][lower];
    return undefined;
}

export class ContactManager {
    private storageManager: StorageManager;
    private CONTACTS_KEY = "arfhe_contacts";
    private RECENT_KEY = "arfhe_recent_addresses";
    private MAX_RECENT = 10;

    constructor(storageManager: StorageManager) {
        this.storageManager = storageManager;
    }

    // ─── Contacts ──────────────────────────────────────────────────

    getContacts(): Contact[] {
        const contacts = this.storageManager.getLocal<Contact[]>(this.CONTACTS_KEY);
        return contacts || [];
    }

    addContact(name: string, address: string): Contact {
        const contacts = this.getContacts();

        // Check if address already exists
        const existing = contacts.find(c => c.address.toLowerCase() === address.toLowerCase());
        if (existing) {
            throw new Error("A contact with this address already exists.");
        }

        const newContact: Contact = {
            id: crypto.randomUUID(),
            name,
            address,
            createdAt: Date.now()
        };

        contacts.push(newContact);
        this.storageManager.setLocal(this.CONTACTS_KEY, contacts);
        return newContact;
    }

    updateContact(id: string, name: string, address: string): void {
        const contacts = this.getContacts();
        const index = contacts.findIndex(c => c.id === id);
        if (index === -1) throw new Error("Contact not found.");

        contacts[index].name = name;
        contacts[index].address = address;
        this.storageManager.setLocal(this.CONTACTS_KEY, contacts);
    }

    removeContact(id: string): void {
        const contacts = this.getContacts();
        const newContacts = contacts.filter(c => c.id !== id);
        this.storageManager.setLocal(this.CONTACTS_KEY, newContacts);
    }

    /**
     * Find contact name by address. Returns undefined if not a saved contact.
     */
    getContactByAddress(address: string): Contact | undefined {
        return this.getContacts().find(
            c => c.address.toLowerCase() === address.toLowerCase()
        );
    }

    // ─── Recent Addresses ──────────────────────────────────────────

    /**
     * Get recent addresses sorted by most recent first.
     * Optionally enriched with contact names and known contract labels.
     */
    getRecentAddresses(chainId?: number): RecentAddress[] {
        const recents = this.storageManager.getLocal<RecentAddress[]>(this.RECENT_KEY) || [];

        // Enrich with labels
        return recents
            .sort((a, b) => b.lastUsed - a.lastUsed)
            .map(r => {
                const contact = this.getContactByAddress(r.address);
                const knownLabel = getKnownContractLabel(r.address, chainId);
                return {
                    ...r,
                    label: contact?.name ?? knownLabel ?? r.label,
                };
            });
    }

    /**
     * Record an address as recently used (for send/swap/approve).
     * Keeps most recent N entries, deduplicates by address.
     */
    addRecentAddress(address: string, label?: string): void {
        let recents = this.storageManager.getLocal<RecentAddress[]>(this.RECENT_KEY) || [];

        // Remove existing entry for this address
        recents = recents.filter(r => r.address.toLowerCase() !== address.toLowerCase());

        // Add to front
        recents.unshift({
            address,
            label,
            lastUsed: Date.now(),
        });

        // Trim to max size
        if (recents.length > this.MAX_RECENT) {
            recents = recents.slice(0, this.MAX_RECENT);
        }

        this.storageManager.setLocal(this.RECENT_KEY, recents);
    }

    /**
     * Clear all recent addresses.
     */
    clearRecentAddresses(): void {
        this.storageManager.removeLocal(this.RECENT_KEY);
    }

    // ─── Resolve Address Label ─────────────────────────────────────

    /**
     * Resolve a human-readable label for any address.
     * Priority: Contact name → Known contract → short address
     */
    resolveLabel(address: string, chainId?: number): string {
        const contact = this.getContactByAddress(address);
        if (contact) return contact.name;

        const known = getKnownContractLabel(address, chainId);
        if (known) return known;

        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
}
