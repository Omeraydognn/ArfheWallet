<p align="center">
  <img src="public/images/vector/arfhe-logo.svg" alt="Arfhe Wallet" width="80" />
</p>

<h1 align="center">Arfhe Wallet</h1>

<p align="center">
  <strong>Privacy-first crypto wallet powered by Fully Homomorphic Encryption (FHE)</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#development">Development</a> •
  <a href="#security">Security</a> •
  <a href="#license">License</a>
</p>

---

## Overview

Arfhe Wallet is a **Chrome extension** (Manifest V3) that brings on-chain privacy to Ethereum and EVM-compatible networks using **Fully Homomorphic Encryption**. Shield your token balances and transfer amounts so they remain encrypted on-chain — only you can decrypt them.

## Features

### 🔐 FHE Privacy
- **Shield / Unshield** tokens via Fhenix cofhe protocol
- Encrypted on-chain balances — invisible to block explorers
- Confidential transfers between shielded accounts

### 💳 Full Wallet
- Create or import wallets (mnemonic / private key / Web3Auth social login)
- Multi-account support with HD derivation
- Send, receive, and swap tokens
- ERC-20 & NFT management with spam filtering

### 🌐 Multi-Network
- Ethereum, Arbitrum, Base (mainnet + testnet)
- Fhenix Sepolia (FHE testnet)
- Custom EVM network support

### 🔗 dApp Connectivity
- **WalletConnect v2** — connect to any dApp
- Built-in dApp browser with curated registry
- Transaction simulation before signing
- FHE-sensitive function warnings

### 🛡️ Security
- AES-256-GCM encryption at rest (PBKDF2 key derivation)
- Configurable auto-lock (idle + tab visibility)
- Biometric authentication (WebAuthn)
- Phishing detection (MetaMask community blocklist + fuzzy matching)
- Memory wipe on lock — no keys persist in JS heap

### 📊 Analytics & Tools
- Portfolio overview with asset allocation charts
- On-chain graph explorer (Cytoscape.js)
- Transaction history with CSV export
- Gas settings panel with network congestion indicator
- Fiat on-ramp (MoonPay, Transak, Ramp)

### 🌍 Internationalization
- English & Turkish — easily extensible via `src/locales/`

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Chrome Extension                │
│                  (Manifest V3)                   │
├──────────┬──────────┬──────────┬────────────────┤
│  Pages   │Components│  Hooks   │    Backend      │
│          │          │          │                  │
│ Home     │ ArfBar   │ useToast │ AccountManager   │
│ Send     │ ArfMenu  │ useTheme │ StorageManager   │
│ Privacy  │ GasPanel │          │ NetworkProvider  │
│ Explore  │ WCMgr    │          │ FheCofheService  │
│ History  │ NFTCard  │          │ TokenCache       │
│ Settings │ DAppModal│          │ PhishingDetector │
│ Portfolio│ Toast    │          │ SwapService      │
│ Auth     │ Charts   │          │ WalletConnect    │
└──────────┴──────────┴──────────┴────────────────┘
         │                              │
         ▼                              ▼
   React 19 + MUI 7              ethers.js 6.x
   Vite 6 + TypeScript           cofhejs + TFHE WASM
```

### Key Technologies

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19, Material UI 7 |
| Language | TypeScript |
| Build | Vite 6, Rollup (13-chunk manual splitting) |
| Blockchain | ethers.js 6, Alchemy SDK |
| FHE | cofhejs 0.3, TFHE 0.11 (WASM) |
| dApp Connect | WalletConnect v2, Web3Auth |
| Graphs | Cytoscape.js, Recharts |
| Testing | Vitest (273 tests) |
| i18n | i18next + react-i18next |
| Package Manager | pnpm |

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 8
- Chrome or Chromium-based browser

### Installation

```bash
# Clone the repository
git clone https://github.com/arfdaodev/ArfheWallet.git
cd ArfheWallet

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Load as Chrome Extension

1. Run `pnpm build`
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `dist/` folder

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_ALCHEMY_API_KEY=your_alchemy_key
VITE_WALLETCONNECT_PROJECT_ID=your_wc_project_id
```

## Development

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Production build → `dist/` |
| `pnpm test` | Run Vitest test suite (273 tests) |
| `pnpm preview` | Preview production build |

### Project Structure

```
src/
├── backend/          # Core services (accounts, networks, crypto, caching)
├── components/       # Reusable React components
├── hooks/            # Custom React hooks
├── locales/          # i18n translation files (en.json, tr.json)
├── pages/            # Route-level page components
├── types/            # Shared TypeScript type definitions
├── App.tsx           # Root component
├── AppContext.ts     # Global context (AccountManager, NetworkProvider, etc.)
├── WalletProvider.tsx# Auth guard, auto-lock, context provider
├── i18n.ts           # i18next configuration
└── main.jsx          # Entry point
contracts/            # Solidity smart contracts (WrappedETH, WrappedUSDC)
deploy/               # Hardhat deployment scripts
public/               # Static assets, manifest overrides
```

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test -- src/backend/__tests__/AccountManager.test.ts
```

### Smart Contract Deployment

See `deploy/` directory and [FHE_COMPLETE_GUIDE.md](./FHE_COMPLETE_GUIDE.md) for detailed deployment instructions.

## Security

Please see [SECURITY.md](./SECURITY.md) for our security policy, vulnerability reporting process, and architecture details.

**Key security measures:**
- All private keys encrypted with AES-256-GCM before storage
- PBKDF2 (100k iterations) password-based key derivation
- Auto-lock on idle and tab switch
- Memory wipe on lock — sensitive data cleared from JS heap
- Manifest V3 CSP — no remote code, `wasm-unsafe-eval` only for TFHE

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with tests
4. Ensure all tests pass: `pnpm test`
5. Ensure build succeeds: `pnpm build`
6. Submit a pull request

### Code Guidelines

- TypeScript strict mode — avoid `any` (use `unknown` + type guards)
- All user-facing strings must use i18n (`t('namespace.key')`)
- New features should include Vitest tests
- Follow existing code patterns and component structure

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

## Acknowledgements

- [Fhenix](https://fhenix.io) — FHE infrastructure and cofhe protocol
- [Zama](https://zama.ai) — TFHE library
- [MetaMask](https://metamask.io) — Phishing detection blocklist
- [WalletConnect](https://walletconnect.com) — dApp connectivity protocol
- [Alchemy](https://alchemy.com) — RPC and token APIs

---

<p align="center">
  Built with ❤️ by the <a href="https://github.com/arfdaodev">Arf DAO</a> team
</p>
