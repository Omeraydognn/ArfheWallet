# Security Policy

## Reporting a Vulnerability

The Arfhe Wallet team takes security issues seriously. We appreciate your efforts to responsibly disclose your findings.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email:** Send a detailed report to **security@arfdao.dev**
2. **Subject line:** `[SECURITY] ArfheWallet — Brief description`
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)

### What to Expect

| Step | Timeline |
|------|----------|
| Acknowledgement | Within **48 hours** |
| Initial triage & severity assessment | Within **5 business days** |
| Status update with remediation plan | Within **10 business days** |
| Patch release (critical/high) | Within **30 days** |
| Public disclosure (coordinated) | After patch is released |

### Severity Classification

| Level | Description | Example |
|-------|-------------|---------|
| **Critical** | Direct loss of funds or private keys | Mnemonic/private key exposure, unsigned transaction injection |
| **High** | Significant security bypass | Auth bypass, encryption downgrade, CSP violation |
| **Medium** | Limited impact or requires user interaction | XSS in dApp browser, phishing vector via WalletConnect |
| **Low** | Minor issues, defense-in-depth | Information disclosure in console logs, UI spoofing |

## Scope

### In Scope

- **Extension source code** — `src/`, `service-worker.js`, `manifest.json`
- **FHE cryptographic operations** — `FheCofheService.ts`, shield/unshield flows
- **Key management** — `AccountManager.ts`, `StorageManager.ts` (AES-GCM encryption, PBKDF2)
- **Smart contracts** — `contracts/Wrapped*.sol`
- **DApp communication** — `WalletConnectService.ts`, `DAppConnectionService.ts`
- **Phishing/spam protection** — `PhishingDetector.ts`, `SpamFilter.ts`
- **Transaction simulation** — `TransactionSimulator.ts`

### Out of Scope

- Third-party dependencies (report upstream: ethers.js, Web3Auth, WalletConnect, cofhe.js)
- Browser-level vulnerabilities (report to Chromium/Firefox)
- Social engineering attacks that don't exploit a software vulnerability
- Denial-of-service attacks against public RPC endpoints
- Issues in the `deploy/` Hardhat tooling (test environment only)

## Supported Versions

| Version | Status | Security Updates |
|---------|--------|------------------|
| 1.x (current) | ✅ Active | Full support |
| 0.x (pre-release) | ❌ EOL | No patches — please upgrade |

## Security Architecture

Arfhe Wallet implements the following security measures:

- **AES-256-GCM** encryption for all sensitive data at rest (private keys, mnemonics)
- **PBKDF2** key derivation (100k iterations) from user password
- **Auto-lock** with configurable idle timeout and tab-visibility detection
- **Memory wipe** on lock — all sensitive data cleared from JS heap
- **FHE (Fully Homomorphic Encryption)** for on-chain transaction privacy via Fhenix/cofhe
- **Manifest V3** Chrome extension with `wasm-unsafe-eval` CSP (required for TFHE WASM)
- **Phishing detection** via MetaMask community blocklist + Levenshtein fuzzy matching
- **Transaction simulation** before signing — warns users of risky operations
- **No remote code execution** — all logic is bundled, no eval/Function constructors

## Acknowledgements

We gratefully acknowledge security researchers who help keep Arfhe Wallet safe. Responsible disclosures will be credited here (with permission).

---

*This policy follows industry best practices inspired by the [GitHub Security Policy template](https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository).*
