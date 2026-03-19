import { SignClient } from "@walletconnect/sign-client";
import { SessionTypes, ProposalTypes } from "@walletconnect/types";
import { getSdkError, buildApprovedNamespaces } from "@walletconnect/utils";
import Account from "./Account";
import type AccountManager from "./AccountManager";
import { PhishingDetector, PhishingCheckResult } from "./PhishingDetector";

// --- CONFIGURATION ---
const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "eb563a65765dfb07525fc699292aad02";

const METADATA = {
    name: "Arfhe Wallet",
    description: "Secure, Self-Custodial Arfhe Wallet",
    url: "https://arfhewallet.com",
    icons: ["https://avatars.githubusercontent.com/u/37784886"]
};

// Supported EIP-155 chains (testnet only)
const SUPPORTED_CHAINS = [
    "eip155:11155111", // Ethereum Sepolia
    "eip155:421614",  // Arbitrum Sepolia
    "eip155:84532",   // Base Sepolia
    "eip155:43113",   // Avalanche Fuji
    "eip155:10143",   // Monad Testnet
];

const SUPPORTED_METHODS = [
    "eth_sendTransaction",
    "eth_signTransaction",
    "eth_sign",
    "personal_sign",
    "eth_signTypedData",
    "eth_signTypedData_v4",
];

const SUPPORTED_EVENTS = ["chainChanged", "accountsChanged"];

export interface WalletConnectRequest {
    id: number;
    topic: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WC SDK dynamic params
    params: Record<string, any>;
    dApp: {
        name: string;
        url: string;
        icon: string;
    };
}

export interface WalletConnectProposal {
    id: number;
    params: ProposalTypes.Struct;
    dApp: {
        name: string;
        url: string;
        icon: string;
        description: string;
    };
    requiredChains: string[];
    optionalChains: string[];
    requiredMethods: string[];
    unsupportedChains: string[];
    isValid: boolean;
    /** Phishing detection result — populated asynchronously */
    phishingResult?: PhishingCheckResult;
}

export class WalletConnectService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WC SignClient instance type
    public client: any;
    public session: SessionTypes.Struct | undefined;

    private onRequestCallback: ((req: WalletConnectRequest) => void) | null = null;
    private onSessionDeleteCallback: (() => void) | null = null;
    private onProposalCallback: ((proposal: WalletConnectProposal) => void) | null = null;
    private onSessionUpdateCallback: (() => void) | null = null;

    private accountManager: AccountManager;
    private isInitializing = false;

    // Deduplicate proposal events
    private processedProposalIds = new Set<number>();

    constructor(accountManager: AccountManager) {
        this.accountManager = accountManager;
    }

    async init() {
        if (this.client || this.isInitializing) return;
        this.isInitializing = true;

        try {
            // Use the declared production URL — window.location.origin returns
            // "chrome-extension://..." in extension context which WalletConnect rejects.
            this.client = await SignClient.init({
                projectId: PROJECT_ID,
                metadata: METADATA,
                logger: "error",
            });

            this.setupEventListeners();

            // Restore active session if any
            if (this.client.session.length) {
                this.session = this.client.session.values[this.client.session.length - 1];
            }
        } catch (e) {
            // Re-throw so callers (pair / handleWcConnect) can surface the error
            throw e;
        } finally {
            this.isInitializing = false;
        }
    }

    setupEventListeners() {
        if (!this.client) return;

        // Session Proposal (Connection Request) — deduplicated
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WC SDK event
        this.client.on("session_proposal", async (proposal: any) => {
            const { id, params } = proposal;

            // Dedup: skip already-processed proposals
            if (this.processedProposalIds.has(id)) {
                return;
            }
            this.processedProposalIds.add(id);

            const { proposer, requiredNamespaces, optionalNamespaces } = params;

            // Extract chain requirements
            const requiredChains = requiredNamespaces?.eip155?.chains || [];
            const optionalChains = optionalNamespaces?.eip155?.chains || [];
            const requiredMethods = requiredNamespaces?.eip155?.methods || [];

            // Validate chains
            const unsupportedChains = requiredChains.filter((c: string) => !SUPPORTED_CHAINS.includes(c));
            const isValid = unsupportedChains.length === 0;

            if (this.onProposalCallback) {
                // ── Phishing Detection ──
                // Run async check on dApp domain — don't block proposal display
                const dAppUrl = proposer.metadata.url || "";
                let phishingResult: PhishingCheckResult | undefined;

                try {
                    phishingResult = await PhishingDetector.checkDomain(dAppUrl);
                    if (phishingResult.isPhishing) {
                    } else if (phishingResult.riskLevel === "SUSPICIOUS") {
                    }
                } catch (e) {
                    // Continue without phishing result — don't block the proposal
                }

                this.onProposalCallback({
                    id,
                    params,
                    dApp: {
                        name: proposer.metadata.name,
                        url: proposer.metadata.url,
                        icon: proposer.metadata.icons?.[0] || "",
                        description: proposer.metadata.description || ""
                    },
                    requiredChains,
                    optionalChains,
                    requiredMethods,
                    unsupportedChains,
                    isValid,
                    phishingResult,
                });
            } else {
                await this.client.reject({
                    id,
                    reason: getSdkError("USER_REJECTED"),
                });
            }
        });

        // Session Request (Sign / Tx)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WC SDK event
        this.client.on("session_request", (event: any) => {
            const { topic, params, id } = event;
            const session = this.client?.session.get(topic);


            if (this.onRequestCallback && session) {
                this.onRequestCallback({
                    id,
                    topic,
                    params: params,
                    dApp: {
                        name: session.peer.metadata.name,
                        url: session.peer.metadata.url,
                        icon: session.peer.metadata.icons?.[0] || ""
                    }
                });
            }
        });

        // Session Delete
        this.client.on("session_delete", () => {
            this.session = undefined;
            if (this.onSessionDeleteCallback) this.onSessionDeleteCallback();
            if (this.onSessionUpdateCallback) this.onSessionUpdateCallback();
        });
    }

    // --- API ---

    public setOnRequest(callback: (req: WalletConnectRequest) => void) {
        this.onRequestCallback = callback;
    }

    public setOnSessionDelete(callback: () => void) {
        this.onSessionDeleteCallback = callback;
    }

    public setOnProposal(callback: (proposal: WalletConnectProposal) => void) {
        this.onProposalCallback = callback;
    }

    public setOnSessionUpdate(callback: () => void) {
        this.onSessionUpdateCallback = callback;
    }

    // --- Smart Pairing ---
    async pair(uri: string) {
        if (!this.client) await this.init();
        if (!this.client) throw new Error("Client not initialized");

        // Extract topic from WC URI
        const topic = uri.split("@")[0].replace("wc:", "");

        // Check for existing pairing with same topic
        try {
            const allPairings = this.client.pairing.getAll();
            const existing = allPairings.find((p: { topic: string }) => p.topic === topic);
            if (existing) {
                if (!existing.active) {
                    // Inactive/expired pairing → clean up and allow fresh pair
                    try {
                        await this.client.pairing.delete(topic, getSdkError("USER_DISCONNECTED"));
                    } catch { /* ignore deletion errors */ }
                } else {
                    // Active pairing exists — don't crash, inform user
                    throw new Error("ALREADY_PAIRED");
                }
            }
        } catch (e) {
            if (e instanceof Error && e.message === "ALREADY_PAIRED") throw e;
            // Other errors during pairing check → continue with pair attempt
        }


        try {
            await this.client.pair({ uri });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("Pairing already exists")) {
                throw new Error("ALREADY_PAIRED");
            }
            if (msg.includes("Expired")) {
                throw new Error("URI_EXPIRED");
            }
            throw e;
        }
    }

    async disconnect(topic?: string) {
        if (!this.client) return;
        const sessionTopic = topic || this.session?.topic;
        if (!sessionTopic) return;

        try {
            await this.client.disconnect({
                topic: sessionTopic,
                reason: getSdkError("USER_DISCONNECTED"),
            });
        } catch (e) {
        }

        if (this.session?.topic === sessionTopic) {
            this.session = undefined;
        }
        if (this.onSessionUpdateCallback) this.onSessionUpdateCallback();
    }

    async disconnectAll(): Promise<number> {
        if (!this.client) return 0;
        const sessions = this.client.session.getAll();
        const count = sessions.length;

        // Disconnect all sessions in parallel, silently
        await Promise.all(
            sessions.map((session: SessionTypes.Struct) =>
                this.client.disconnect({
                    topic: session.topic,
                    reason: getSdkError("USER_DISCONNECTED"),
                }).catch(() => { /* ignore individual errors */ })
            )
        );

        this.session = undefined;
        if (this.onSessionUpdateCallback) this.onSessionUpdateCallback();
        return count;
    }

    // --- Session Approval with Lifecycle Management ---

    async approveSession(proposal: WalletConnectProposal) {
        if (!this.client) return;

        try {
            const { id, params } = proposal;

            const activeAccount = this.accountManager.GetActive();
            if (!activeAccount) throw new Error("No active account found");
            const address = activeAccount.GetAddress();

            const supportedNamespaces = {
                eip155: {
                    chains: SUPPORTED_CHAINS,
                    methods: SUPPORTED_METHODS,
                    events: SUPPORTED_EVENTS,
                    accounts: SUPPORTED_CHAINS.map(chain => `${chain}:${address}`)
                }
            };

            const approvedNamespaces = buildApprovedNamespaces({
                proposal: params,
                supportedNamespaces,
            });

            const session = await this.client.approve({
                id,
                namespaces: approvedNamespaces
            });

            // Wait for peer acknowledgment with timeout
            try {
                await Promise.race([
                    session.acknowledged(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("ACK_TIMEOUT")), 10000)
                    )
                ]);
            } catch (ackErr) {
            }

            // Verify session is registered in the store
            const latestSession = this.client.session.get(session.topic);
            if (!latestSession) {
                throw new Error("SESSION_SYNC_FAILED");
            }
            this.session = latestSession;


            // Clear processed proposal ID
            this.processedProposalIds.delete(proposal.id);

            if (this.onSessionUpdateCallback) this.onSessionUpdateCallback();
        } catch (e) {
            this.processedProposalIds.delete(proposal.id);
            throw e;
        }
    }

    async rejectSession(proposal: WalletConnectProposal) {
        if (!this.client) return;

        await this.client.reject({
            id: proposal.id,
            reason: getSdkError("USER_REJECTED"),
        });

        this.processedProposalIds.delete(proposal.id);
    }

    // --- Active Sessions ---

    getActiveSessions(): SessionTypes.Struct[] {
        if (!this.client) return [];
        try {
            return this.client.session.getAll() || [];
        } catch {
            return [];
        }
    }

    // --- Request Response ---

    async approveRequest(account: Account, req: WalletConnectRequest, result: unknown) {
        if (!this.client) return;


        await this.client.respond({
            topic: req.topic,
            response: {
                id: req.id,
                jsonrpc: "2.0",
                result: result,
            },
        });
    }

    async rejectRequest(req: WalletConnectRequest) {
        if (!this.client) return;


        await this.client.respond({
            topic: req.topic,
            response: {
                id: req.id,
                jsonrpc: "2.0",
                error: getSdkError("USER_REJECTED_METHODS"),
            },
        });
    }
}
