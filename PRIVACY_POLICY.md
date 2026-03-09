# Privacy Policy

**Arfhe Wallet** — Privacy-first FHE-powered Crypto Wallet  
**Effective Date:** March 8, 2026  
**Last Updated:** March 8, 2026

---

## 1. Introduction

Arfhe Wallet ("we", "our", "the Extension") is an open-source Chrome browser extension that provides a self-custodial cryptocurrency wallet with Fully Homomorphic Encryption (FHE) privacy features.

This Privacy Policy explains what data Arfhe Wallet collects, how it is used, and your rights regarding your information.

## 2. Data We Do NOT Collect

Arfhe Wallet is designed with privacy as a core principle:

- ❌ **No personal identification** — We do not collect names, emails, phone numbers, or any personally identifiable information (PII).
- ❌ **No analytics or tracking** — We do not use Google Analytics, Mixpanel, Sentry, or any third-party analytics service.
- ❌ **No telemetry** — We do not send usage statistics, crash reports, or behavioral data to any server.
- ❌ **No advertising** — We do not serve ads or share data with advertising networks.
- ❌ **No cookies** — The Extension does not set or read browser cookies.
- ❌ **No browsing history** — We do not monitor, collect, or transmit your browsing activity.

## 3. Data Stored Locally

All wallet data is stored **exclusively on your device** using the Chrome `storage.local` API:

| Data | Purpose | Storage |
|------|---------|---------|
| Encrypted private keys & mnemonics | Wallet access | AES-256-GCM encrypted, local only |
| Account addresses | Display & transaction building | Local only |
| Token balances & transaction history | UI display | Local cache, fetched from public blockchains |
| User preferences (theme, language, networks) | UI customization | Local only |
| Contact book entries | Address book | Local only |
| Auto-lock timer settings | Security | Local only |

**Important:** Your private keys and recovery phrases are encrypted with AES-256-GCM using a key derived from your password via PBKDF2 (100,000 iterations, SHA-256). They never leave your device in unencrypted form.

## 4. Network Communications

Arfhe Wallet communicates with the following external services **only to provide wallet functionality**:

### 4.1 Blockchain RPC Providers
- **Alchemy** (`*.alchemy.com`) — To read blockchain state and broadcast transactions
- **Public RPC endpoints** — For custom networks added by the user

**Data sent:** Wallet addresses, transaction data (when you initiate a transaction)  
**Purpose:** Core wallet operations (balance queries, transaction broadcasting)

### 4.2 Price & Token Data
- **CoinGecko API** — Token price data
- **Alchemy NFT API** — NFT metadata

**Data sent:** Token contract addresses, wallet addresses  
**Purpose:** Displaying portfolio values and NFT collections

### 4.3 WalletConnect (Optional)
- **WalletConnect relay servers** — Only when the user explicitly connects to a dApp

**Data sent:** Session metadata, transaction requests  
**Purpose:** dApp connectivity (user-initiated only)

### 4.4 Fhenix FHE Network (Optional)
- **Fhenix Sepolia RPC** — For FHE shield/unshield operations

**Data sent:** Encrypted transaction data  
**Purpose:** Fully Homomorphic Encryption operations

### 4.5 Phishing Protection
- **MetaMask phishing list** (fetched from GitHub) — Domain blocklist

**Data sent:** None (the list is downloaded, not your browsing data)  
**Purpose:** Protecting users from known phishing sites

## 5. Permissions

The Extension requests the following Chrome permissions:

| Permission | Reason |
|------------|--------|
| `storage` | Store encrypted wallet data locally |
| `notifications` | Transaction confirmations and security alerts |
| `alarms` | Auto-lock timer functionality |
| `scripting` | DApp interaction via content scripts |
| `host_permissions (http/https)` | Communicate with blockchain RPC providers |

## 6. Third-Party Services

We do not sell, rent, or share your data with any third party. The blockchain RPC providers listed in Section 4 may have their own privacy policies:

- [Alchemy Privacy Policy](https://www.alchemy.com/policies/privacy-policy)
- [CoinGecko Privacy Policy](https://www.coingecko.com/en/privacy)
- [WalletConnect Privacy Policy](https://walletconnect.com/privacy)

## 7. Data Retention & Deletion

- All data is stored locally on your device.
- You can delete all Extension data at any time by:
  1. Removing the Extension from Chrome, or
  2. Clearing Extension data from `chrome://extensions`
- There is no server-side data to delete because we do not collect any.

## 8. Children's Privacy

Arfhe Wallet is not intended for use by individuals under the age of 18. We do not knowingly collect data from minors.

## 9. Security

- Private keys are encrypted with **AES-256-GCM** (PBKDF2-derived key, 600,000 iterations)
- All sensitive operations require password authentication
- Auto-lock functionality secures the wallet after inactivity
- Open-source codebase for community audit
- See our [Security Policy](SECURITY.md) for vulnerability reporting

## 10. Open Source

Arfhe Wallet is open source under the MIT License. You can review the complete source code at:  
**https://github.com/arfdaodev/ArfheWallet**

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the "Last Updated" date above and published in the GitHub repository.

## 12. Contact

For privacy-related questions or concerns:

- **GitHub:** [github.com/arfdaodev/ArfheWallet](https://github.com/arfdaodev/ArfheWallet)
- **Email:** privacy@arfdao.dev
