# 🗺️ Kod Haritası

## Klasör Yapısı

```
ArfheWallet/
├── src/                        ← Ana kaynak kodu
│   ├── backend/               ← Core servisler
│   ├── pages/                 ← Route-level sayfalar
│   ├── components/            ← Yeniden kullanılabilir bileşenler
│   ├── hooks/                 ← Custom React hook'lar
│   ├── locales/               ← i18n dosyaları (en.json, tr.json)
│   ├── types/                 ← TypeScript tip tanımları
│   ├── App.tsx                ← Root component
│   ├── AppContext.ts          ← Global context
│   ├── WalletProvider.tsx     ← Auth guard + auto-lock
│   └── main.tsx               ← Entry point
├── contracts/                  ← Solidity kontratları (EVM/Fhenix)
│   ├── WrappedETH_V4.sol
│   └── WrappedUSDC_V3.sol
├── arfhe_confidential_vault/   ← Solana Anchor programı (Rust)
│   ├── Anchor.toml
│   ├── Cargo.toml
│   └── programs/arfhe_vault/src/lib.rs
├── extension/                  ← Chrome extension dosyaları
│   ├── manifest.json
│   ├── service-worker.js
│   ├── content-script.js
│   └── inpage.js
├── deploy/                     ← Hardhat deploy scripts + artifacts
├── dist/                       ← Build çıktısı (extension buradan yüklenir)
└── ArfheVault/                 ← Bu Obsidian vault!
```

---

## Backend Servisler (`src/backend/`)

### 🔑 IkaService.ts — IKA dWallet Entegrasyonu
**Amaç:** IKA SDK wrapper — dWallet oluşturma ve signing

| Metod | Durum | Açıklama |
|-------|-------|---------|
| `initializeIkaClient()` | ⚠️ Sorunlu | WASM yükleme wrapper'ı var ama hata veriyor |
| `generateUserShareKeys()` | ✅ | Ed25519 UserShareEncryptionKeys üretiyor |
| `getFundingStatus()` | ✅ | Sui testnet SUI+IKA bakiye sorgulama |
| `createDWallet()` | ⚠️ Kısmen | Gerçek DKG TX gönderiyor ama accept adımı eksik |
| `createArfheDWallet()` | ❌ Mock | IKA init başarısız olursa mock DKG'ye düşüyor |
| `signCrossChainTransaction()` | ❌ Mock | Presign TX gönderiyor, ama sign kısmı random bytes |
| `registerUserShareEncryptionKey()` | ✅ | Encryption key kayıt TX'i |

### 🔒 FheCofheService.ts — EVM FHE (Fhenix/Sepolia)
**Amaç:** cofhejs wrapper — Fhenix Sepolia'da şifreleme/çözme

| Metod | Durum | Açıklama |
|-------|-------|---------|
| `init(provider, signer)` | ✅ | cofhejs initialize ediyor |
| `isReadyForAccount()` | ✅ | Hesap/chain değişimini algılıyor |
| `encrypt()` | ✅ | TFHE ile sayı şifreleme |
| `unseal()` | ✅ | Sealed output'u decrypt etme |

### 🌐 SolanaDevnet.ts — Solana Ağ Katmanı
**Amaç:** Solana devnet işlemleri

| Metod | Durum | Açıklama |
|-------|-------|---------|
| `getBalance()` | ✅ | SOL bakiyesi |
| `getTokenBalances()` | ✅ | SPL/Token-2022 tokenları |
| `sendTransaction()` | ✅ | SOL ve SPL transfer |
| `sendSplToken()` | ✅ | `transferChecked` ile SPL transfer |
| `sendConfidentialPolicyTransfer()` | ❌ Mock | FHE vault'a gönderim simülasyonu |
| `getHistory()` | ✅ | Transaction geçmişi |

### 👤 AccountManager.ts — Hesap Yönetimi
**Amaç:** Cüzdan hesaplarını yönetir

Önemli metodlar:
- `CreateAccount()` — Yeni hesap (HD derivation)
- `ImportFromMnemonic()` — Seed phrase import
- `GetActive()` — Aktif hesap
- `setIkaSolanaDWallet()` — IKA dWallet verilerini sakla
- `signTransaction()` — Transaction imzalama

### 💾 StorageManager.ts — Kalıcı Depolama
**Amaç:** chrome.storage.local wrapper

- AES-256-GCM ile private key şifreleme
- PBKDF2 key derivation
- Account state, settings, network config

### 🌍 NetworkProvider.ts — Ağ Yönetimi
**Amaç:** Çoklu ağ desteği

Desteklenen ağlar:
- `Mainnet.ts`, `Sepolia.ts`, `FhenixSepolia.ts`
- `ArbitrumOne.ts`, `ArbitrumSepolia.ts`
- `BaseMainnet.ts`, `BaseSepolia.ts`
- `SolanaDevnet.ts` ← Bizim için kritik
- `MonadTestnet.ts`, `Optimism.ts`, `Polygon.ts`, `Sei.ts` vb.

---

## Frontend Sayfaları (`src/pages/`)

| Sayfa | Açıklama | Durum |
|-------|---------|-------|
| `Home.tsx` | Ana sayfa — bakiye, hızlı işlemler | ✅ Çalışıyor |
| `IkaDashboard.tsx` | dWallet yönetimi | ⚠️ UI var, backend mock |
| `Privacy.tsx` | FHE gizlilik paneli | ⚠️ EVM'de çalışıyor, Solana'da göstermiyor |
| `History.tsx` | Transaction geçmişi | ✅ Çalışıyor |
| `Portfolio.tsx` | Portföy grafikleri | ✅ Çalışıyor |
| `Settings.tsx` | Ayarlar | ✅ Çalışıyor |
| `SettingsSecurity.tsx` | Güvenlik ayarları | ✅ Çalışıyor |
| `Auth.tsx` | Login/kilit açma | ✅ Çalışıyor |
| `Explore.tsx` | dApp tarayıcı | ✅ Çalışıyor |
| `GraphExplorer.tsx` | On-chain graph görselleştirme | ✅ Çalışıyor |
| `Revoke.tsx` | Token approval iptal | ✅ Çalışıyor |
| `TokenDetail.tsx` | Token detay sayfası | ✅ Çalışıyor |
| `Splash.tsx` | Açılış ekranı | ✅ Çalışıyor |

---

## Akıllı Kontratlar

### Solana — `arfhe_confidential_vault/`
```
programs/arfhe_vault/src/lib.rs
```
- Anchor framework
- `ConfidentialVault` account (owner + AI authority + IKA authority + encrypted_balance)
- `initialize_vault`, `deposit`, `transfer_with_policy` instruction'ları
- **Durum:** Derlenmedi, deploy edilmedi ❌

### EVM — `contracts/`
```
contracts/WrappedETH_V4.sol
contracts/WrappedUSDC_V3.sol
```
- Fhenix cofhe protokolüyle şifreli wrap/unwrap
- **Durum:** Fhenix Sepolia'da deploy edilmiş ✅ (eski versiyonlar)

---

## Kritik Config Dosyaları

### `vite.config.js`
- WASM plugin'leri (`vite-plugin-wasm`, `vite-plugin-top-level-await`)
- 13 chunk'lık manuel code splitting
- Chrome extension için static copy
- Node.js polyfill'ler (Buffer, process vb.)

### `extension/manifest.json`
- Manifest V3
- `wasm-unsafe-eval` CSP (TFHE için gerekli)
- Service worker kaydı
- Content script injection

### `tsconfig.json`
- Strict mode aktif
- ES2022 target

### `pnpm-workspace.yaml`
- Monorepo yapısı (kök + `arfhewalletsolana/` workspace)

---

## Test Yapısı

```
src/__tests__/
src/backend/__tests__/
    AccountManager.test.ts
    StorageManager.test.ts
    ... (273 test toplam)
```

```bash
pnpm test              # Hepsini çalıştır (Vitest)
pnpm test:coverage     # Coverage raporu
```

---

[[04 - Sistem Mimarisi|← Sistem Mimarisi]] | [[06 - Mevcut Durum ve Sorunlar|→ Sorunlar]]
