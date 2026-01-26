import { SignClient } from "@walletconnect/sign-client";
import { SessionTypes } from "@walletconnect/types";
import { getSdkError, buildApprovedNamespaces } from "@walletconnect/utils";
import Account from "./Account";

// --- CONFIGURATION ---
// TODO: User must replace this with their own Project ID from Cloud.WalletConnect.com
const PROJECT_ID = "eb563a65765dfb07525fc699292aad02";

const METADATA = {
    name: "Arfhe Wallet",
    description: "Secure, Self-Custodial Arfhe Wallet",
    url: "https://arfhewallet.com", // Placeholder
    icons: ["https://avatars.githubusercontent.com/u/37784886"]
};

export interface WalletConnectRequest {
    id: number;
    topic: string;
    params: any;
    dApp: {
        name: string;
        url: string;
        icon: string;
    };
}

// New: Interface for Session Proposal
export interface WalletConnectProposal {
    id: number;
    params: any;
    dApp: {
        name: string;
        url: string;
        icon: string;
        description: string;
    };
}

export class WalletConnectService {
    public client: any;
    public session: SessionTypes.Struct | undefined;

    // Callbacks for UI updates
    private onRequestCallback: ((req: WalletConnectRequest) => void) | null = null;
    private onSessionDeleteCallback: (() => void) | null = null;

    // NEW: Callback for Connection Proposals
    private onProposalCallback: ((proposal: WalletConnectProposal) => void) | null = null;

    // Dependencies
    private accountManager: any; // AccountManager

    private isInitializing = false;

    constructor(accountManager: any) {
        this.accountManager = accountManager;
    }

    async init() {
        if (this.client || this.isInitializing) return;
        this.isInitializing = true;

        // --- CONSOLE SUPPRESSION ---
        // Hack: Filter out WalletConnect "Verify API" messages that spam console on localhost
        const originalError = console.error;
        const originalWarn = console.warn;

        console.error = (...args: any[]) => {
            const str = args.map(a => String(a)).join(" ");
            if (str.includes("verify-api") || str.includes("verify.walletconnect.org") || str.includes("404")) return;
            originalError.apply(console, args);
        };

        console.warn = (...args: any[]) => {
            const str = args.map(a => String(a)).join(" ");
            if (str.includes("verify-api") || str.includes("verify.walletconnect.org")) return;
            originalWarn.apply(console, args);
        };
        // ---------------------------

        try {
            const metadata = { ...METADATA, url: window.location.origin };

            this.client = await SignClient.init({
                projectId: PROJECT_ID,
                metadata: metadata,
                logger: "error", // Use error level, then filter it above
            });

            this.setupEventListeners();

            // Check if we have an active session restored
            if (this.client.session.length) {
                this.session = this.client.session.values[this.client.session.length - 1];
                console.log("[WC] Restored Session:", this.session?.peer.metadata.name);
            }
        } catch (e) {
            console.log("[WC] Init Error:", e);
        } finally {
            this.isInitializing = false;
        }
    }

    setupEventListeners() {
        if (!this.client) return;

        // 0. Session Proposal (Connection Request)
        // CHANGED: No longer auto-approves. Emits 'onProposalCallback'
        this.client.on("session_proposal", async (proposal: any) => {
            console.log("[WC] Session Proposal:", proposal);
            const { id, params } = proposal;
            const { proposer } = params;

            // Notify UI
            if (this.onProposalCallback) {
                this.onProposalCallback({
                    id,
                    params,
                    dApp: {
                        name: proposer.metadata.name,
                        url: proposer.metadata.url,
                        icon: proposer.metadata.icons[0] || "",
                        description: proposer.metadata.description
                    }
                });
            } else {
                console.warn("[WC] No UI listener for proposal. Auto-rejecting.");
                await this.client.reject({
                    id,
                    reason: getSdkError("USER_REJECTED"),
                });
            }
        });

        // 1. Session Request (The Guard Trigger)
        this.client.on("session_request", (event: any) => {
            const { topic, params, id } = event;
            const { request, chainId } = params;
            const session = this.client?.session.get(topic);

            console.log("[WC] Session Request:", event);

            if (this.onRequestCallback && session) {
                this.onRequestCallback({
                    id,
                    topic,
                    params: request,
                    dApp: {
                        name: session.peer.metadata.name,
                        url: session.peer.metadata.url,
                        icon: session.peer.metadata.icons[0] || ""
                    }
                });
            }
        });

        // 2. Session Delete
        this.client.on("session_delete", () => {
            console.log("[WC] Session Deleted");
            this.session = undefined;
            if (this.onSessionDeleteCallback) this.onSessionDeleteCallback();
        });
    }

    // --- API ---

    public setOnRequest(callback: (req: WalletConnectRequest) => void) {
        this.onRequestCallback = callback;
    }

    public setOnSessionDelete(callback: () => void) {
        this.onSessionDeleteCallback = callback;
    }

    // NEW: API for Proposal Listener
    public setOnProposal(callback: (proposal: WalletConnectProposal) => void) {
        this.onProposalCallback = callback;
    }

    async pair(uri: string) {
        if (!this.client) await this.init();
        if (!this.client) throw new Error("Client not initialized");

        console.log("[WC] Pairing with URI:", uri);
        await this.client.pair({ uri });
        // We wait for 'session_proposal' event now.
    }

    async disconnect() {
        if (!this.client || !this.session) return;
        await this.client.disconnect({
            topic: this.session.topic,
            reason: getSdkError("USER_DISCONNECTED"),
        });
        this.session = undefined;
    }

    async disconnectAll() {
        if (!this.client) return;
        const sessions = this.client.session.values;
        for (const session of sessions) {
            console.log("[WC] Disconnecting session:", session.topic);
            try {
                await this.client.disconnect({
                    topic: session.topic,
                    reason: getSdkError("USER_DISCONNECTED"),
                });
            } catch (e) {
                console.warn("[WC] Failed to disconnect session:", session.topic);
            }
        }
        this.session = undefined;
    }

    // --- NEW: Session Approval Logic ---

    async approveSession(proposal: WalletConnectProposal) {
        if (!this.client) return;

        try {
            console.log("[WC] Approving Session Proposal:", proposal.id);
            const { id, params } = proposal;

            const activeAccount = this.accountManager.GetActive();
            if (!activeAccount) throw new Error("No active account found");
            const address = activeAccount.GetAddress();

            const supportedNamespaces = {
                eip155: {
                    chains: ["eip155:1", "eip155:11155111"],
                    methods: [
                        "eth_sendTransaction",
                        "eth_signTransaction",
                        "eth_sign",
                        "personal_sign",
                        "eth_signTypedData",
                    ],
                    events: ["chainChanged", "accountsChanged"],
                    accounts: [
                        `eip155:1:${address}`,
                        `eip155:11155111:${address}`
                    ]
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
            this.session = session;
            console.log("[WC] Session Approved:", session);
        } catch (e) {
            console.error("[WC] Session Approval Failed:", e);
            throw e;
        }
    }

    async rejectSession(proposal: WalletConnectProposal) {
        if (!this.client) return;
        console.log("[WC] Rejecting Session Proposal:", proposal.id);

        await this.client.reject({
            id: proposal.id,
            reason: getSdkError("USER_REJECTED"),
        });
    }


    // --- VAULT: Response Logic ---

    async approveRequest(account: Account, req: WalletConnectRequest, result: any) {
        if (!this.client) return;

        console.log("[WC] Approving Request:", req.id);

        await this.client.respond({
            topic: req.topic,
            response: {
                id: req.id,
                jsonrpc: "2.0",
                result: result, // Signature or Tx Hash
            },
        });
    }

    async rejectRequest(req: WalletConnectRequest) {
        if (!this.client) return;

        console.log("[WC] Rejecting Request:", req.id);

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
