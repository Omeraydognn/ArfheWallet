# 🏗️ Sistem Mimarisi

## Genel Mimari

```
┌────────────────────────────────────────────────────────────────┐
│                  ARFHE WALLET (Chrome Extension)               │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Frontend   │  │   Backend    │  │   Smart Contracts    │ │
│  │              │  │   Services   │  │                      │ │
│  │ React 19     │  │              │  │ arfhe_vault (Anchor) │ │
│  │ Material UI  │  │ IkaService   │  │ ConfidentialVault    │ │
│  │ TypeScript   │  │ FheCofhe     │  │ (Solana devnet)      │ │
│  │              │  │ SolanaDevnet │  │                      │ │
│  │ Pages:       │  │ AccountMgr   │  │ WrappedETH/USDC      │ │
│  │ - Home       │  │ StorageMgr   │  │ (Fhenix Sepolia)     │ │
│  │ - IkaDash    │  │ NetworkProv  │  └──────────────────────┘ │
│  │ - Privacy    │  │ WalletConn   │                           │
│  │ - History    │  └──────┬───────┘                           │
│  └──────┬───────┘         │                                   │
│         │                 │                                   │
└─────────┼─────────────────┼───────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────┐   ┌────────────────────────────────────────┐
│  Solana Devnet  │   │           Harici Ağlar                 │
│                 │   │                                        │
│ Encrypt.xyz     │   │  IKA / Sui Testnet                     │
│ Program ID:     │   │  ├─ SuiJsonRpcClient                   │
│ 4ebfzW...       │   │  ├─ IkaClient                          │
│                 │   │  └─ DKG / Presign / Sign               │
│ gRPC Executor:  │   │                                        │
│ pre-alpha-dev-1 │   │  Ethereum / Fhenix Sepolia             │
│ .encrypt.ika-   │   │  ├─ cofhejs (TFHE WASM)                │
│ network.net:443 │   │  └─ FHE Contracts (EVM)                │
└─────────────────┘   └────────────────────────────────────────┘
```

---

## Veri Akışı: Solana Gizli Transfer

```
Kullanıcı "Gizli Gönder" tıklar
         │
         ▼
SolanaDevnet.sendTransaction({ isShielded: true, ... })
         │
         ▼
sendConfidentialPolicyTransfer(account, recipient, amount)
         │
         ├─── [MOCK] AI Policy Check simülasyonu (1.5s bekleme)
         │
         ├─── [HEDEF] Encrypt.xyz TypeScript Client
         │    createEncryptClient().createInput({...})
         │    → ciphertext üretilir
         │
         ├─── [HEDEF] Anchor program çağrısı
         │    arfhe_vault::transfer_with_policy(encrypted_amount)
         │    → on-chain FHE işlemi
         │
         └─── [ŞU AN] Dummy 0-SOL TX atılıyor
              → explorer'da görünür ama gerçek FHE yok
```

---

## Veri Akışı: IKA dWallet Oluşturma

```
Kullanıcı "Oluştur" tıklar (IkaDashboard)
         │
         ▼
IkaService.createArfheDWallet('solana')
         │
         ├─── initializeIkaClient()
         │    ├─ SuiJsonRpcClient (testnet)
         │    ├─ IkaClient({ suiClient, config })
         │    └─ ikaClient.initialize() [← WASM yükleme sorunu]
         │
         ├─── [Başarılıysa] createDWallet({signer, seed, chain:'solana'})
         │    ├─ generateUserShareKeys(seed, Curve.ED25519)
         │    ├─ prepareDKGAsync(...)
         │    ├─ IkaTransaction.requestDWalletDKG(...)
         │    ├─ suiClient.signAndExecuteTransaction(...)
         │    ├─ getDWalletInParticularState(id, 'Active')
         │    └─ publicKeyFromDWalletOutput → Solana adresi
         │
         ├─── [Başarısızsa] DKG.generate() fallback
         │    └─ Random publicKey + mock userShare [← ŞU AN BURADA]
         │
         └─── AccountManager.setIkaSolanaDWallet(index, {...})
              → Veritabanına kaydedilir
```

---

## Chrome Extension Katmanları

```
manifest.json (V3)
├── service-worker.js       ← Background process, cüzdan state yöneticisi
├── content-script.js       ← Web sayfasıyla iletişim köprüsü
├── inpage.js               ← window.arfhe inject edilir (dApp API)
└── index.html              ← Popup UI
    └── dist/               ← Vite build çıktısı
        ├── index.js
        ├── assets/*.js     ← Code-split chunks
        ├── tfhe_bg.wasm    ← Fhenix TFHE WASM
        └── assets/dwallet_mpc_wasm*.wasm ← IKA WASM
```

---

## State Yönetimi

```
StorageManager (chrome.storage.local)
    │
    ├── accounts[]
    │   ├── name, address (Ethereum)
    │   ├── solana_address
    │   ├── ika_solana_dwallet    ← dWallet public key
    │   ├── ika_solana_mpc_id    ← MPC node ID
    │   ├── ika_user_share_keys  ← Şifreli user share (hex)
    │   └── encrypted_private_key (AES-256-GCM)
    │
    ├── selected_network_id
    ├── settings (theme, language, auto-lock)
    └── contacts[]
```

---

## Güvenlik Katmanları

```
Kullanıcı Parolası
       ↓
PBKDF2 (100k iter) → AES-256-GCM Key
       ↓
Private Key Şifreleme → chrome.storage.local
       ↓
Kilitleme → Bellek temizleme (JS heap wipe)
```

**IKA tarafında:** User share asla plaintext olarak storage'a yazılmaz. `ika_user_share_keys` aslında `UserShareEncryptionKeys.toShareEncryptionKeysBytes()` — user share'i kullanabilmek için encryption key gerekir, o da seed'den türetilir.

---

## WASM Yükleme Mimarisi

Chrome extension'da iki ayrı WASM dosyası yükleniyor:

| Dosya | Nereden | Ne İçin |
|-------|---------|---------|
| `tfhe_bg.wasm` | `dist/` (public) | cofhejs — Fhenix FHE |
| `dwallet_mpc_wasm_bg.wasm` | `dist/assets/` | IKA SDK — MPC |

Chrome extension'da `chrome-extension://` protokolü ile WASM fetch'i sorunlu olabiliyor. `vite.config.js`'de özel WASM plugin'leri kullanılıyor.

---

[[03 - Encrypt.xyz FHE Teknolojisi|← Encrypt.xyz]] | [[05 - Kod Haritası|→ Kod Haritası]]
