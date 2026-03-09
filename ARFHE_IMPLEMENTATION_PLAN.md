# ArFHE — Bağımsız FHE Altyapısı Implementation Plan

> **Proje:** ArFHE (Arf Fully Homomorphic Encryption)
> **Amaç:** Fhenix/CoFHE'ye bağımlılığı tamamen kaldırıp, kendi FHE altyapımızı oluşturarak herhangi bir EVM zincirinde (Ethereum, Arbitrum, Base, vb.) gizli bakiye ve gizli transfer yapabilmek.
> **Tarih:** Mart 2026
> **Repo:** Yeni repo — `arfdaodev/arfhe`

---

## İÇİNDEKİLER

1. [Mevcut Sistemin Tam Analizi](#1-mevcut-sistemin-tam-analizi)
2. [Hedef Mimari](#2-hedef-mimari)
3. [Repo Yapısı](#3-repo-yapısı)
4. [Bileşen 1: TFHE Key Management Servisi](#4-bileşen-1-arfhe-key-server)
5. [Bileşen 2: Verifier Servisi](#5-bileşen-2-arfhe-verifier)
6. [Bileşen 3: TaskManager Kontratı (On-Chain)](#6-bileşen-3-taskmanager-kontratı)
7. [Bileşen 4: FHE Backend (Compute Engine)](#7-bileşen-4-fhe-backend-compute-engine)
8. [Bileşen 5: Client Kütüphanesi (arfhe-js)](#8-bileşen-5-client-kütüphanesi-arfhe-js)
9. [Bileşen 6: Wrapper Kontratları](#9-bileşen-6-wrapper-kontratları)
10. [Güvenlik Mimarisi](#10-güvenlik-mimarisi)
11. [Deploy ve Operasyon](#11-deploy-ve-operasyon)
12. [Test Stratejisi](#12-test-stratejisi)
13. [Faz Planı ve Timeline](#13-faz-planı-ve-timeline)
14. [Risk Analizi](#14-risk-analizi)

---

## 1. MEVCUT SİSTEMİN TAM ANALİZİ

### 1.1 Fhenix/CoFHE Nasıl Çalışıyor (Atom Seviyesi)

Mevcut sistemi tamamen reverse-engineer ettik. İşte olan her şey:

#### Kullanılan Kütüphaneler
- **tfhe** `0.11.1` — Zama'nın TFHE (Torus Fully Homomorphic Encryption) WASM kütüphanesi
- **tweetnacl** `^1.0.3` — Sealing (symmetric encryption) için NaCl box
- **ethers** `6.x` — Blockchain etkileşimi
- **zustand** — State management (SDK store)
- **idb-keyval** — IndexedDB (tarayıcıda key cache)

#### Encrypt Akışı (cofhejs.encrypt → on-chain'e kadar)

```
Adım 1: initTfhe()
  - tfhe WASM modülü yüklenir (tarayıcıda ~2MB)
  - init() + init_panic_hook() çağrılır

Adım 2: _store_initialize()
  - Provider'dan chainId alınır
  - checkIsTestnet() — MockZkVerifier kontratı var mı kontrol edilir
  - Testnet DEĞİLSE:
    a) POST ${coFheUrl}/GetNetworkPublicKey { securityZone: 0 }
       → FHE Public Key (hex string, min 15000 karakter) alınır
       → TfheCompactPublicKey.deserialize(buff) ile deserialize edilir
    b) POST ${coFheUrl}/GetCrs { securityZone: 0 }
       → CRS (Common Reference String) alınır
       → CompactPkeCrs.deserialize(buff) ile deserialize edilir
    c) Her ikisi de IndexedDB'ye cache'lenir (cofhejs-keys store)
  - Verifier signer adresi doğrulanır: GET ${verifierUrl}/signerAddress

Adım 3: cofhejs.encrypt([Encryptable.uint64(value)])
  a) encryptExtract() — EncryptableItem'ları çıkarır
     → { data: bigint, utype: 5 } (uint64 için utype=5)
  b) zkPack() — TFHE compact ciphertext listesi oluşturur
     → ProvenCompactCiphertextList.builder(publicKey)
     → builder.push_u64(bigint_value) (FheTypes.Uint64 için)
  c) zkProve() — Zero-Knowledge Proof of Knowledge üretir
     → metadata = [securityZone(1 byte) | accountAddress(20 bytes) | chainId(32 bytes)]
     → builder.build_with_proof_packed(crs, metadata, ZkComputeLoad.Verify)
     → Bu işlem CPU-yoğun, setTimeout(0) ile event loop'a bırakılır
  d) zkVerify() — Kanıt CoFHE Verifier'a gönderilir
     → POST ${verifierUrl}/verify
     → Body: {
         packed_list: hex(compactList.serialize()),
         account_addr: "0x...",
         security_zone: 0,
         chain_id: 11155111
       }
     → Response: { status: "success", data: [{ ct_hash: "0x...", signature: "0x...", recid: 0 }] }
     → signature = signature + (recid + 27).toString(16).padStart(2, "0")
  e) encryptReplace() — Orijinal input'ları encrypted karşılıklarıyla değiştirir
     → Sonuç: { ctHash: BigInt, securityZone: 0, utype: 5, signature: "0x..." }
     → Bu InEuint64 struct'ı olarak kontrata gönderilir
```

#### On-Chain İşlem Akışı (FHE.sol + TaskManager)

```
Kontrat: FHE.asEuint64(encryptedInput)
  → Utils.inputFromEuint64(input) — InEuint64 → EncryptedInput dönüşümü
  → Impl.verifyInput(encryptedInput) 
  → ITaskManager(0xeA30...D9).verifyInput(input, msg.sender)
  → TaskManager signature'ı doğrular, ctHash'i kabul eder
  → ctHash döner (uint256, euint64 type'a wrap edilir)

Kontrat: FHE.add(euint64 a, euint64 b)
  → Impl.mathOp(EUINT64_TFHE=5, unwrap(a), unwrap(b), FunctionId.add=8)
  → ITaskManager.createTask(5, 8, [ctHash_a, ctHash_b], [])
  → TaskManager "add" task'ı oluşturur, event emit eder
  → Off-chain engine bu event'i dinler
  → Engine: ciphertext_a + ciphertext_b = ciphertext_result (homomorfik)
  → Engine: sonucu yeni ctHash olarak on-chain'e yazar
  → Yeni ctHash döner

Kontrat: FHE.sub(euint64 a, euint64 b) — aynı mekanizma, FunctionId.sub=7
Kontrat: FHE.allow(euint64, address) 
  → ITaskManager.allow(ctHash, account) — ACL'e ekle
Kontrat: FHE.allowThis(euint64)
  → ITaskManager.allow(ctHash, address(this)) — kontratın kendisine erişim ver
```

#### Unseal/Decrypt Akışı

```
cofhejs.unseal(ctHash, FheTypes.Uint64):
  1. Permit alınır (EIP-712 signed typed data)
     → Permission struct: {
         issuer: address,
         expiration: uint64,
         recipient: address,
         validatorId: uint256,
         validatorContract: address,
         sealingKey: bytes32 (nacl public key),
         issuerSignature: bytes,
         recipientSignature: bytes
       }
  2. POST ${thresholdNetworkUrl}/sealoutput
     → Body: {
         ct_tempkey: ctHash.toString(16).padStart(64, "0"),
         host_chain_id: chainId (number),
         permit: Permission
       }
     → Server:
       a) Permit'i doğrular (imza kontrolü)
       b) ACL kontrolü (bu ctHash'e bu adres erişebilir mi?)
       c) Ciphertext'i decrypt eder (secret key ile)
       d) Plaintext'i sealingKey (nacl public key) ile şifreler
       e) Response: { sealed: { data: Uint8Array, public_key: Uint8Array, nonce: Uint8Array } }
  3. Client tarafında permit.unseal(sealed):
     → nacl.box.open(data, nonce, ephemPublicKey, privateKey)
     → Plaintext BigInt döner
```

#### Sealing (Symmetric Encryption) Detayı

```
SealingKey üretimi:
  → nacl.box.keyPair() — X25519 key pair
  → privateKey: 64 hex char (32 bytes)
  → publicKey: 64 hex char (32 bytes)

SealingKey.seal(value, publicKey):
  → Ephemeral key pair üret: nacl.box.keyPair()
  → nonce: nacl.randomBytes(24)
  → encrypted = nacl.box(toBeArray(value), nonce, fromHex(publicKey), ephemeralSecretKey)
  → Return: { data, public_key: ephemeralPublicKey, nonce }

SealingKey.unseal(sealedData):
  → nacl.box.open(data, nonce, ephemPublicKey, fromHex(privateKey))
  → toBigInt(decrypted) döner
```

### 1.2 TaskManager Kontrat Adresi ve Fonksiyonları

```
Adres: 0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9 (tüm testnet'lerde aynı)

Interface (ICofhe.sol):
  - createTask(uint8 returnType, FunctionId funcId, uint256[] encryptedInputs, uint256[] extraInputs) → uint256
  - createRandomTask(uint8 returnType, uint256 seed, int32 securityZone) → uint256
  - createDecryptTask(uint256 ctHash, address requestor)
  - verifyInput(EncryptedInput input, address sender) → uint256
  - allow(uint256 ctHash, address account)
  - isAllowed(uint256 ctHash, address account) → bool
  - allowGlobal(uint256 ctHash)
  - allowTransient(uint256 ctHash, address account)
  - getDecryptResult(uint256 ctHash) → uint256
  - getDecryptResultSafe(uint256 ctHash) → (uint256, bool)

FunctionId enum (32 tane):
  0: GetNetworkKey, 1: Verify, 2: cast, 3: sealoutput, 4: select,
  5: req, 6: decrypt, 7: sub, 8: add, 9: xor, 10: and, 11: or,
  12: not, 13: div, 14: rem, 15: mul, 16: shl, 17: shr, 18: gte,
  19: lte, 20: lt, 21: gt, 22: min, 23: max, 24: eq, 25: ne,
  26: trivialEncrypt, 27: random, 28: rol, 29: ror, 30: square

Type constants:
  EBOOL_TFHE = 0, EUINT8_TFHE = 2, EUINT16_TFHE = 3, EUINT32_TFHE = 4,
  EUINT64_TFHE = 5, EUINT128_TFHE = 6, EADDRESS_TFHE = 7, EUINT256_TFHE = 8
```

### 1.3 Mevcut Kontratlarımız (WrappedETH_V4, WrappedUSDC_V3)

Her iki kontrat da aynı pattern'ı kullanıyor:

```solidity
// Kullanılan FHE fonksiyonları:
FHE.asEuint64(uint64 value)      → euint64  // Plaintext → encrypted (trivialEncrypt)
FHE.asEuint64(InEuint64 input)   → euint64  // Client encrypted → on-chain (verifyInput)
FHE.add(euint64, euint64)        → euint64  // Homomorfik toplama
FHE.sub(euint64, euint64)        → euint64  // Homomorfik çıkarma (underflow'da revert)
FHE.allow(euint64, address)                 // ACL: adrese okuma izni ver
FHE.allowThis(euint64)                      // ACL: kontrata okuma izni ver
Common.isInitialized(euint64)    → bool     // ctHash != 0 mı?
```

---

## 2. HEDEF MİMARİ

### 2.1 Genel Bakış

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser/Extension)               │
│                                                              │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐                │
│  │ arfhe-js │  │ tfhe WASM │  │ nacl       │                │
│  │ (SDK)    │  │ (encrypt) │  │ (sealing)  │                │
│  └────┬─────┘  └─────┬─────┘  └──────┬─────┘                │
│       │              │               │                       │
└───────┼──────────────┼───────────────┼───────────────────────┘
        │              │               │
        ▼              ▼               ▼
┌───────────────────────────────────────────────────────────────┐
│                    ArFHE BACKEND CLUSTER                       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Key Server   │  │ Verifier     │  │ Compute Engine   │    │
│  │ (Rust)       │  │ (Rust)       │  │ (Rust)           │    │
│  │              │  │              │  │                   │    │
│  │ GET /pubkey  │  │ POST /verify │  │ Blockchain event │    │
│  │ GET /crs     │  │              │  │ listener +       │    │
│  │              │  │ ZK proof     │  │ homomorfik ops   │    │
│  │ FHE key pair │  │ doğrulama +  │  │ + sealoutput     │    │
│  │ üretimi      │  │ ctHash       │  │ + decrypt        │    │
│  │              │  │ imzalama     │  │                   │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘   │
│         │                 │                    │              │
│         └─────────────────┼────────────────────┘              │
│                           │                                   │
│                    ┌──────┴──────┐                            │
│                    │ Shared      │                            │
│                    │ Secret Key  │                            │
│                    │ (HSM/Vault) │                            │
│                    └─────────────┘                            │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN (EVM)                            │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ ArFHE        │  │ WrappedETH   │  │ WrappedUSDC      │    │
│  │ TaskManager  │  │ (cETH)       │  │ (cUSDC)          │    │
│  │              │  │              │  │                   │    │
│  │ Task queue   │  │ import       │  │ import            │    │
│  │ ACL mgmt    │  │ ArFHE.sol    │  │ ArFHE.sol         │    │
│  │ Verify sig  │  │              │  │                   │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Fhenix'ten Ne Alıyoruz, Ne Değiştiriyoruz

| Bileşen | Fhenix'te | ArFHE'de | Değişiklik |
|---------|-----------|----------|------------|
| TFHE WASM | Zama tfhe 0.11.1 | **Aynı** — Zama tfhe 0.11.1 | Değişiklik yok |
| NaCl Sealing | tweetnacl | **Aynı** — tweetnacl | Değişiklik yok |
| CoFHE Key Server | Fhenix proprietary | **Kendi Rust servisimiz** | Yeni yazılacak |
| Verifier | Fhenix proprietary | **Kendi Rust servisimiz** | Yeni yazılacak |
| TaskManager | Fhenix kontratı | **Kendi Solidity kontratımız** | Yeni yazılacak |
| Threshold Network | Fhenix 3-node MPC | **Tek sunucu (Faz 1)** | Basitleştirilmiş |
| cofhejs | Fhenix npm paketi | **arfhe-js** (kendi SDK) | Fork + modifiye |
| FHE.sol | @fhenixprotocol/cofhe-contracts | **ArFHE.sol** (kendi) | Fork + modifiye |

---

## 3. REPO YAPISI

```
arfhe/
├── README.md
├── LICENSE
├── .github/
│   └── workflows/
│       ├── test-backend.yml          # Rust backend CI
│       ├── test-contracts.yml        # Solidity CI
│       └── test-sdk.yml              # JS SDK CI
│
├── backend/                          # Rust workspace (tüm backend servisleri)
│   ├── Cargo.toml                    # workspace root
│   ├── Cargo.lock
│   │
│   ├── arfhe-common/                 # Shared types, config, utilities
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── config.rs             # Config loading (env/yaml)
│   │       ├── types.rs              # Shared types (CtHash, FheType, etc.)
│   │       ├── crypto.rs             # Sealing, signature helpers
│   │       └── error.rs              # Custom error types
│   │
│   ├── arfhe-keys/                   # Bileşen 1: Key Server
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs               # Actix-web / Axum server
│   │       ├── keygen.rs             # TFHE key pair generation
│   │       ├── routes.rs             # GET /publickey, GET /crs
│   │       └── storage.rs            # Key storage (file/HSM interface)
│   │
│   ├── arfhe-verifier/               # Bileşen 2: Verifier
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs               # HTTP server
│   │       ├── routes.rs             # POST /verify, GET /signerAddress
│   │       ├── verify.rs             # ZK proof verification logic
│   │       ├── signer.rs             # ECDSA signing (ctHash imzalama)
│   │       └── storage.rs            # ctHash → ciphertext storage
│   │
│   ├── arfhe-engine/                 # Bileşen 4: Compute Engine + Sealoutput
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs               # Server + event listener
│   │       ├── listener.rs           # Blockchain event listener
│   │       ├── compute.rs            # Homomorfik operasyonlar (add, sub, mul, ...)
│   │       ├── routes.rs             # POST /sealoutput, POST /decrypt
│   │       ├── acl.rs                # Permission/ACL doğrulama
│   │       ├── task_processor.rs     # Task kuyruğu işleme
│   │       └── storage.rs            # ctHash → ciphertext database
│   │
│   └── arfhe-cli/                    # CLI araçları (keygen, deploy helper, vb.)
│       ├── Cargo.toml
│       └── src/
│           └── main.rs
│
├── contracts/                        # Solidity kontratları
│   ├── hardhat.config.js
│   ├── package.json
│   ├── foundry.toml                  # Opsiyonel: Foundry desteği
│   │
│   ├── src/
│   │   ├── ArFHE.sol                 # Ana FHE library (FHE.sol yerine)
│   │   ├── IArFHETaskManager.sol     # TaskManager interface
│   │   ├── ArFHETaskManager.sol      # TaskManager implementation
│   │   ├── ArFHETypes.sol            # Shared types (euint64, InEuint64, vb.)
│   │   ├── ArFHEACL.sol              # Access Control List kontratı
│   │   ├── WrappedETH.sol            # cETH kontratı
│   │   └── WrappedUSDC.sol           # cUSDC kontratı
│   │
│   ├── test/
│   │   ├── ArFHETaskManager.t.sol
│   │   ├── WrappedETH.t.sol
│   │   └── WrappedUSDC.t.sol
│   │
│   └── scripts/
│       ├── deploy-taskmanager.js
│       ├── deploy-wrappers.js
│       └── deploy-all.js
│
├── sdk/                              # Bileşen 5: JavaScript/TypeScript SDK
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   │
│   └── src/
│       ├── index.ts                  # Public API exports
│       ├── arfhe.ts                  # Ana SDK sınıfı (cofhejs karşılığı)
│       ├── init.ts                   # TFHE WASM initialization
│       ├── encrypt.ts                # Encryption logic
│       ├── unseal.ts                 # Unseal/decrypt logic
│       ├── permit.ts                 # Permit management
│       ├── sealing.ts                # NaCl sealing key management
│       ├── types.ts                  # TypeScript types
│       ├── store.ts                  # Zustand state store
│       ├── config.ts                 # SDK configuration
│       └── utils/
│           ├── zkPoK.ts              # ZK proof helpers
│           ├── consts.ts             # Constants
│           └── helpers.ts            # Utility functions
│
├── docs/                             # Dokümantasyon
│   ├── architecture.md
│   ├── security.md
│   ├── deployment-guide.md
│   ├── sdk-guide.md
│   └── api-reference.md
│
├── docker/                           # Docker deployment
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── Dockerfile.keys
│   ├── Dockerfile.verifier
│   └── Dockerfile.engine
│
└── scripts/                          # Yardımcı scriptler
    ├── generate-keys.sh              # FHE key pair üretimi
    ├── setup-dev.sh                  # Development ortamı kurulumu
    └── deploy-testnet.sh             # Testnet deploy scripti
```

---

## 4. BİLEŞEN 1: ArFHE KEY SERVER

### 4.1 Görev

FHE key pair'i üretir ve public key + CRS'i client'lara dağıtır.

### 4.2 Detaylı Tasarım

#### Key Generation (Başlangıçta Bir Kez)

```rust
// backend/arfhe-keys/src/keygen.rs

use tfhe::{
    generate_keys, set_server_key,
    ClientKey, ServerKey, CompactPublicKey,
    shortint::parameters::PARAM_MESSAGE_2_CARRY_2_COMPACT_PK_KS_PBS,
    // veya daha spesifik:
    // shortint::parameters::compact_public_key_only::p_fail_2_minus_64::ks_pbs::PARAM_MESSAGE_2_CARRY_2_COMPACT_PK,
};

pub struct ArFHEKeys {
    pub client_key: ClientKey,        // SECRET — sadece backend'de
    pub server_key: ServerKey,        // Backend compute engine için
    pub compact_public_key: CompactPublicKey,  // Client'lara dağıtılacak
}

pub fn generate_arfhe_keys() -> ArFHEKeys {
    // Key generation — BU İŞLEM UZUN SÜRER (1-5 dakika)
    // Sadece bir kez yapılır, sonra kaydedilir
    let config = ConfigBuilder::default()
        .build();
    
    let (client_key, server_key) = generate_keys(config);
    let compact_public_key = CompactPublicKey::new(&client_key);
    
    ArFHEKeys {
        client_key,
        server_key,
        compact_public_key,
    }
}
```

**NOT:** Zama'nın `tfhe-rs` Rust crate'i ile `tfhe` npm (WASM) paketi aynı alt yapıyı kullanır. Rust'ta üretilen key'ler WASM'da deserialize edilebilir, çünkü serialization formatı aynıdır.

#### CRS (Common Reference String) Generation

```rust
// CRS, ZK proof'lar için gerekli. tfhe-rs'ın CompactPkeCrs'i ile üretilir.
use tfhe::CompactPkeCrs;

pub fn generate_crs(max_elements: usize) -> CompactPkeCrs {
    // CRS parametreleri — client'ın encrypt edebileceği max eleman sayısı
    CompactPkeCrs::from_shortint_params(
        PARAM_MESSAGE_2_CARRY_2_COMPACT_PK_KS_PBS,
        max_elements,
    )
}
```

#### REST API Endpoints

```
GET /GetNetworkPublicKey
  Request Body: { securityZone: 0 }
  Response: { publicKey: "0x04a3b5c7..." }  (hex-encoded serialized CompactPublicKey)
  
  Implementasyon:
    1. Kaydedilmiş public key'i oku
    2. Serialize et → hex string
    3. Dön

GET /GetCrs  
  Request Body: { securityZone: 0 }
  Response: { crs: "0x01f2e3..." }  (hex-encoded serialized CRS)

GET /signerAddress
  Response: { address: "0x..." }  (verifier'ın ECDSA public address'i)
  Not: cofhejs store.ts'de initialization sırasında bu endpoint çağrılıyor

GET /health
  Response: { status: "ok", version: "0.1.0" }
```

#### Key Storage

```
İlk aşama (Faz 1): Dosya sistemi
  - /var/arfhe/keys/client_key.bin  (SECRET — chmod 600)
  - /var/arfhe/keys/server_key.bin
  - /var/arfhe/keys/public_key.bin
  - /var/arfhe/keys/crs.bin

İleri aşama (Faz 2): HSM veya HashiCorp Vault
  - Client key HSM'de saklanır
  - Server key Vault'ta encrypted
```

#### Rust Bağımlılıklar (Cargo.toml)

```toml
[package]
name = "arfhe-keys"
version = "0.1.0"
edition = "2021"

[dependencies]
arfhe-common = { path = "../arfhe-common" }
tfhe = { version = "0.11", features = ["integer", "x86_64-unix"] }  # veya aarch64-unix macOS için
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
hex = "0.4"
tracing = "0.1"
tracing-subscriber = "0.3"
```

**ÖNEMLİ:** `tfhe` Rust crate'i platform-spesifik feature'lar gerektirir:
- Linux x86_64: `features = ["x86_64-unix"]`
- macOS ARM: `features = ["aarch64-unix"]`
- macOS x86_64: `features = ["x86_64-unix"]`

---

## 5. BİLEŞEN 2: ArFHE VERIFIER

### 5.1 Görev

Client'tan gelen ZK proof'ları doğrular, her ciphertext için benzersiz ctHash üretir ve ECDSA ile imzalar. Bu imza, on-chain TaskManager tarafından doğrulanır.

### 5.2 Detaylı Tasarım

#### ZK Proof Verification

```rust
// backend/arfhe-verifier/src/verify.rs

use tfhe::{
    CompactPublicKey, CompactPkeCrs,
    ProvenCompactCiphertextList,
};

pub struct VerifyRequest {
    pub packed_list: String,       // Hex-encoded proven compact ciphertext list
    pub account_addr: String,      // "0x..." — encrypt eden kullanıcı adresi
    pub security_zone: u8,         // Genellikle 0
    pub chain_id: u64,             // Zincir ID
}

pub struct VerifyResult {
    pub ct_hash: String,           // "0x..." — ctHash (keccak256)
    pub signature: String,         // "0x..." — ECDSA signature
    pub recid: u8,                 // Recovery ID (0 veya 1)
}

pub fn verify_and_sign(
    request: VerifyRequest,
    public_key: &CompactPublicKey,
    crs: &CompactPkeCrs,
    signing_key: &secp256k1::SecretKey,
) -> Result<Vec<VerifyResult>, VerifyError> {
    // 1. Packed list'i deserialize et
    let list_bytes = hex::decode(&request.packed_list)?;
    let proven_list = ProvenCompactCiphertextList::deserialize(&list_bytes)?;
    
    // 2. ZK proof'u doğrula
    // Metadata'yı reconstruct et: [securityZone(1) | address(20) | chainId(32)]
    let metadata = construct_metadata(
        request.security_zone,
        &request.account_addr,
        request.chain_id,
    );
    
    // 3. Proof'u public key ve CRS ile verify et
    let verified = proven_list.verify(crs, public_key, &metadata)?;
    
    // 4. Her ciphertext için ctHash üret
    let ciphertexts = verified.expand()?;
    let mut results = Vec::new();
    
    for (i, ct) in ciphertexts.iter().enumerate() {
        // ctHash = keccak256(serialized_ciphertext || account || securityZone || chainId)
        let ct_bytes = ct.serialize();
        let ct_hash = compute_ct_hash(&ct_bytes, &request.account_addr, request.security_zone, request.chain_id);
        
        // 5. ctHash'i ECDSA ile imzala
        let (signature, recid) = sign_ct_hash(&ct_hash, signing_key);
        
        // 6. Ciphertext'i storage'a kaydet (ctHash → ciphertext mapping)
        store_ciphertext(&ct_hash, &ct_bytes)?;
        
        results.push(VerifyResult {
            ct_hash: format!("0x{}", hex::encode(&ct_hash)),
            signature: format!("0x{}", hex::encode(&signature)),
            recid,
        });
    }
    
    Ok(results)
}

fn compute_ct_hash(
    ct_bytes: &[u8], 
    account: &str, 
    security_zone: u8, 
    chain_id: u64
) -> [u8; 32] {
    // Fhenix'in tam ctHash hesaplama algoritması:
    // Bu, TaskManager'ın on-chain'de de aynı şekilde hesaplamasını sağlar
    use tiny_keccak::{Keccak, Hasher};
    let mut hasher = Keccak::v256();
    hasher.update(ct_bytes);
    hasher.update(&hex::decode(&account[2..]).unwrap());
    hasher.update(&[security_zone]);
    hasher.update(&chain_id.to_be_bytes());
    let mut output = [0u8; 32];
    hasher.finalize(&mut output);
    output
}

fn sign_ct_hash(hash: &[u8; 32], key: &secp256k1::SecretKey) -> (Vec<u8>, u8) {
    use secp256k1::{Secp256k1, Message};
    let secp = Secp256k1::new();
    let msg = Message::from_digest(*hash);
    let (recid, sig) = secp.sign_ecdsa_recoverable(&msg, key).serialize_compact();
    (sig.to_vec(), recid.to_i32() as u8)
}
```

#### REST API

```
POST /verify
  Request: {
    packed_list: "0x...",           // Proven compact ciphertext list (hex)
    account_addr: "0x1234...",     // User address
    security_zone: 0,
    chain_id: 11155111
  }
  Response: {
    status: "success",
    data: [
      { ct_hash: "0x...", signature: "0x...", recid: 0 }
    ]
  }

GET /signerAddress
  Response: { address: "0xABCD..." }  
  // Verifier'ın ECDSA public key'inden türetilmiş Ethereum adresi
  // TaskManager bu adresi "authorized verifier" olarak tanır
```

#### ECDSA Signing Key

```
- Verifier'ın ECDSA private key'i (secp256k1)
- Bu key, ctHash imzalamak için kullanılır
- TaskManager kontratında bu key'in public address'i "authorized signer" olarak kayıtlıdır
- Bu sayede sadece bizim verifier'ımızın imzaladığı ctHash'ler kabul edilir
- Key storage: Dosya sistemi (Faz 1) → HSM (Faz 2)
```

#### Ciphertext Storage

```
İlk aşama: PostgreSQL
  Table: ciphertexts
    - ct_hash: BYTEA PRIMARY KEY (32 bytes)
    - ciphertext: BYTEA (variable size, genellikle 10-50 KB)
    - account: VARCHAR(42)
    - security_zone: SMALLINT
    - chain_id: BIGINT
    - utype: SMALLINT (0=bool, 2=uint8, 3=uint16, 4=uint32, 5=uint64, 6=uint128)
    - created_at: TIMESTAMPTZ
    
  Table: acl (Access Control List)
    - ct_hash: BYTEA
    - account: VARCHAR(42)
    - PRIMARY KEY (ct_hash, account)

İleri aşama: Redis cache + PostgreSQL
  - Hot data (son 24 saat): Redis
  - Cold data: PostgreSQL
```

#### Rust Bağımlılıklar

```toml
[dependencies]
arfhe-common = { path = "../arfhe-common" }
tfhe = { version = "0.11", features = ["integer", "x86_64-unix"] }
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
hex = "0.4"
secp256k1 = { version = "0.29", features = ["recovery"] }
tiny-keccak = { version = "2", features = ["keccak"] }
sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres"] }
tracing = "0.1"
```

---

## 6. BİLEŞEN 3: TASKMANAGER KONTRATI

### 6.1 Görev

On-chain FHE task kuyruğu. Client'tan gelen encrypted input'ları doğrular, FHE operasyonlarını kuyruğa alır, ACL yönetimi yapar.

### 6.2 Detaylı Solidity Kodu

```solidity
// contracts/src/ArFHETypes.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Encrypted type wrappers — aslında uint256 (ctHash) tutarlar
type ebool is uint256;
type euint8 is uint256;
type euint16 is uint256;
type euint32 is uint256;
type euint64 is uint256;
type euint128 is uint256;
type eaddress is uint256;

struct EncryptedInput {
    uint256 ctHash;
    uint8 securityZone;
    uint8 utype;
    bytes signature;        // Verifier'ın ECDSA imzası
}

struct InEuint64 {
    uint256 ctHash;
    uint8 securityZone;
    uint8 utype;            // Değeri 5 olmalı (EUINT64)
    bytes signature;
}

// ... diğer InE* struct'ları da aynı formatta

enum FunctionId {
    GetNetworkKey,    // 0
    Verify,           // 1
    Cast,             // 2
    SealOutput,       // 3
    Select,           // 4
    Req,              // 5
    Decrypt,          // 6
    Sub,              // 7
    Add,              // 8
    Xor,              // 9
    And,              // 10
    Or,               // 11
    Not,              // 12
    Div,              // 13
    Rem,              // 14
    Mul,              // 15
    Shl,              // 16
    Shr,              // 17
    Gte,              // 18
    Lte,              // 19
    Lt,               // 20
    Gt,               // 21
    Min,              // 22
    Max,              // 23
    Eq,               // 24
    Ne,               // 25
    TrivialEncrypt,   // 26
    Random,           // 27
    Rol,              // 28
    Ror,              // 29
    Square            // 30
}

library TypeConstants {
    uint8 constant EBOOL = 0;
    uint8 constant EUINT8 = 2;
    uint8 constant EUINT16 = 3;
    uint8 constant EUINT32 = 4;
    uint8 constant EUINT64 = 5;
    uint8 constant EUINT128 = 6;
    uint8 constant EADDRESS = 7;
    uint8 constant EUINT256 = 8;
}
```

```solidity
// contracts/src/IArFHETaskManager.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ArFHETypes.sol";

interface IArFHETaskManager {
    // Task oluşturma (FHE operasyonu kuyruğa alma)
    function createTask(
        uint8 returnType,
        FunctionId funcId,
        uint256[] memory encryptedInputs,
        uint256[] memory extraInputs
    ) external returns (uint256 resultCtHash);

    // Encrypted input doğrulama (verifier signature check)
    function verifyInput(
        EncryptedInput memory input,
        address sender
    ) external returns (uint256 ctHash);

    // Decrypt task oluşturma
    function createDecryptTask(uint256 ctHash, address requestor) external;
    
    // Random task
    function createRandomTask(
        uint8 returnType,
        uint256 seed,
        int32 securityZone
    ) external returns (uint256);

    // ACL
    function allow(uint256 ctHash, address account) external;
    function isAllowed(uint256 ctHash, address account) external view returns (bool);
    function allowGlobal(uint256 ctHash) external;
    function allowTransient(uint256 ctHash, address account) external;

    // Decrypt sonuçları
    function getDecryptResult(uint256 ctHash) external view returns (uint256);
    function getDecryptResultSafe(uint256 ctHash) external view returns (uint256, bool);

    // Events
    event TaskCreated(
        uint256 indexed resultCtHash,
        uint8 returnType,
        FunctionId funcId,
        uint256[] encryptedInputs,
        uint256[] extraInputs
    );
    event InputVerified(uint256 indexed ctHash, address indexed sender);
    event DecryptRequested(uint256 indexed ctHash, address indexed requestor);
    event DecryptResultStored(uint256 indexed ctHash, uint256 result);
    event ACLUpdated(uint256 indexed ctHash, address indexed account, bool allowed);
}
```

```solidity
// contracts/src/ArFHETaskManager.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IArFHETaskManager.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract ArFHETaskManager is IArFHETaskManager, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Authorized verifier address (ECDSA public key'den türetilmiş)
    address public verifierAddress;
    
    // Authorized compute engine address (task sonuçlarını yazabilir)
    address public engineAddress;

    // ACL: ctHash → account → allowed
    mapping(uint256 => mapping(address => bool)) private _acl;
    
    // Decrypt results: ctHash → plaintext value
    mapping(uint256 => uint256) private _decryptResults;
    mapping(uint256 => bool) private _decryptCompleted;

    // Task counter for deterministic result ctHash generation
    uint256 private _taskNonce;

    constructor(address _verifier, address _engine) Ownable(msg.sender) {
        verifierAddress = _verifier;
        engineAddress = _engine;
    }

    // === ADMIN ===

    function setVerifierAddress(address _verifier) external onlyOwner {
        verifierAddress = _verifier;
    }

    function setEngineAddress(address _engine) external onlyOwner {
        engineAddress = _engine;
    }

    // === VERIFY INPUT ===

    function verifyInput(
        EncryptedInput memory input,
        address sender
    ) external returns (uint256) {
        // 1. Signature'ı doğrula — verifier'ın imzaladığını kontrol et
        bytes32 messageHash = keccak256(
            abi.encodePacked(input.ctHash, input.securityZone, input.utype)
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recoveredSigner = ethSignedHash.recover(input.signature);
        
        require(recoveredSigner == verifierAddress, "Invalid verifier signature");

        // 2. ACL: sender ve kontrat erişimi ver
        _acl[input.ctHash][sender] = true;
        _acl[input.ctHash][msg.sender] = true;  // çağıran kontrat

        emit InputVerified(input.ctHash, sender);
        return input.ctHash;
    }

    // === CREATE TASK ===

    function createTask(
        uint8 returnType,
        FunctionId funcId,
        uint256[] memory encryptedInputs,
        uint256[] memory extraInputs
    ) external returns (uint256) {
        // Deterministic result ctHash üret
        _taskNonce++;
        uint256 resultCtHash = uint256(keccak256(
            abi.encodePacked(block.chainid, address(this), _taskNonce, returnType, funcId)
        ));

        // ACL: çağıran kontrata sonuç erişimi ver
        _acl[resultCtHash][msg.sender] = true;

        emit TaskCreated(resultCtHash, returnType, funcId, encryptedInputs, extraInputs);
        return resultCtHash;
    }

    // === TRIVIAL ENCRYPT (plaintext → ctHash) ===
    // Bu, kontrat içinden çağrılan FHE.asEuint64(uint64_value) için
    
    function trivialEncrypt(
        uint256 value,
        uint8 toType,
        uint256 securityZone
    ) external returns (uint256) {
        _taskNonce++;
        uint256 resultCtHash = uint256(keccak256(
            abi.encodePacked(block.chainid, address(this), _taskNonce, "trivial", value, toType)
        ));
        
        _acl[resultCtHash][msg.sender] = true;
        
        emit TaskCreated(
            resultCtHash,
            toType,
            FunctionId.TrivialEncrypt,
            new uint256[](0),
            _createInputs(value, toType, securityZone)
        );
        
        return resultCtHash;
    }

    // === DECRYPT ===

    function createDecryptTask(uint256 ctHash, address requestor) external {
        emit DecryptRequested(ctHash, requestor);
    }

    // Engine tarafından çağrılır — decrypt sonucunu yazar
    function storeDecryptResult(uint256 ctHash, uint256 result) external {
        require(msg.sender == engineAddress, "Only engine can store results");
        _decryptResults[ctHash] = result;
        _decryptCompleted[ctHash] = true;
        emit DecryptResultStored(ctHash, result);
    }

    // Engine tarafından çağrılır — task sonucu (yeni ctHash → ACL mapping)
    function storeTaskResult(
        uint256 originalResultCtHash,
        uint256 actualCtHash,
        address[] memory allowedAddresses
    ) external {
        require(msg.sender == engineAddress, "Only engine can store results");
        
        // Orijinal ctHash'in ACL'ini kopyala + yeni adresler ekle
        for (uint i = 0; i < allowedAddresses.length; i++) {
            _acl[actualCtHash][allowedAddresses[i]] = true;
        }
    }

    function getDecryptResult(uint256 ctHash) external view returns (uint256) {
        require(_decryptCompleted[ctHash], "Decrypt not completed");
        return _decryptResults[ctHash];
    }

    function getDecryptResultSafe(uint256 ctHash) external view returns (uint256, bool) {
        return (_decryptResults[ctHash], _decryptCompleted[ctHash]);
    }

    // === ACL ===

    function allow(uint256 ctHash, address account) external {
        // Sadece ctHash'e erişimi olan kontrat ACL güncelleyebilir
        require(_acl[ctHash][msg.sender], "Caller not allowed for this ctHash");
        _acl[ctHash][account] = true;
        emit ACLUpdated(ctHash, account, true);
    }

    function isAllowed(uint256 ctHash, address account) external view returns (bool) {
        return _acl[ctHash][account];
    }

    function allowGlobal(uint256 ctHash) external {
        require(_acl[ctHash][msg.sender], "Caller not allowed");
        // Global flag — special address
        _acl[ctHash][address(0)] = true;
    }

    function allowTransient(uint256 ctHash, address account) external {
        require(_acl[ctHash][msg.sender], "Caller not allowed");
        _acl[ctHash][account] = true;
    }

    // === RANDOM ===

    function createRandomTask(
        uint8 returnType,
        uint256 seed,
        int32 securityZone
    ) external returns (uint256) {
        _taskNonce++;
        uint256 resultCtHash = uint256(keccak256(
            abi.encodePacked(block.chainid, address(this), _taskNonce, "random", seed)
        ));
        
        _acl[resultCtHash][msg.sender] = true;
        
        uint256[] memory extraInputs = new uint256[](3);
        extraInputs[0] = seed;
        extraInputs[1] = returnType;
        extraInputs[2] = uint256(int256(securityZone));
        
        emit TaskCreated(resultCtHash, returnType, FunctionId.Random, new uint256[](0), extraInputs);
        return resultCtHash;
    }

    // === INTERNAL ===

    function _createInputs(uint256 a, uint256 b, uint256 c) private pure returns (uint256[] memory) {
        uint256[] memory inputs = new uint256[](3);
        inputs[0] = a;
        inputs[1] = b;
        inputs[2] = c;
        return inputs;
    }
}
```

```solidity
// contracts/src/ArFHE.sol — FHE.sol karşılığı
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ArFHETypes.sol";
import "./IArFHETaskManager.sol";

// ====================================
// TaskManager adresi — deploy sonrası güncelle
// ====================================
address constant ARFHE_TASK_MANAGER = 0x0000000000000000000000000000000000000000; // DEPLOY SONRASI SET ET

library Common {
    function isInitialized(uint256 hash) internal pure returns (bool) {
        return hash != 0;
    }
    function isInitialized(ebool v) internal pure returns (bool) { return isInitialized(ebool.unwrap(v)); }
    function isInitialized(euint8 v) internal pure returns (bool) { return isInitialized(euint8.unwrap(v)); }
    function isInitialized(euint16 v) internal pure returns (bool) { return isInitialized(euint16.unwrap(v)); }
    function isInitialized(euint32 v) internal pure returns (bool) { return isInitialized(euint32.unwrap(v)); }
    function isInitialized(euint64 v) internal pure returns (bool) { return isInitialized(euint64.unwrap(v)); }
    function isInitialized(euint128 v) internal pure returns (bool) { return isInitialized(euint128.unwrap(v)); }
    function isInitialized(eaddress v) internal pure returns (bool) { return isInitialized(eaddress.unwrap(v)); }
}

library Impl {
    function trivialEncrypt(uint256 value, uint8 toType, int32 securityZone) internal returns (uint256) {
        uint256[] memory extraInputs = new uint256[](3);
        extraInputs[0] = value;
        extraInputs[1] = toType;
        extraInputs[2] = uint256(int256(securityZone));
        return IArFHETaskManager(ARFHE_TASK_MANAGER).createTask(
            toType, FunctionId.TrivialEncrypt, new uint256[](0), extraInputs
        );
    }

    function mathOp(uint8 returnType, uint256 lhs, uint256 rhs, FunctionId functionId) internal returns (uint256) {
        uint256[] memory inputs = new uint256[](2);
        inputs[0] = lhs;
        inputs[1] = rhs;
        return IArFHETaskManager(ARFHE_TASK_MANAGER).createTask(
            returnType, functionId, inputs, new uint256[](0)
        );
    }

    function verifyInput(EncryptedInput memory input) internal returns (uint256) {
        return IArFHETaskManager(ARFHE_TASK_MANAGER).verifyInput(input, msg.sender);
    }
}

library ArFHE {
    // === asEuint64 (plaintext → encrypted) ===
    function asEuint64(uint256 value) internal returns (euint64) {
        return euint64.wrap(Impl.trivialEncrypt(value, TypeConstants.EUINT64, 0));
    }

    // === asEuint64 (client encrypted → on-chain) ===
    function asEuint64(InEuint64 memory input) internal returns (euint64) {
        require(input.utype == TypeConstants.EUINT64, "Invalid type for euint64");
        return euint64.wrap(Impl.verifyInput(EncryptedInput({
            ctHash: input.ctHash,
            securityZone: input.securityZone,
            utype: input.utype,
            signature: input.signature
        })));
    }

    // === add ===
    function add(euint64 lhs, euint64 rhs) internal returns (euint64) {
        if (!Common.isInitialized(lhs)) lhs = asEuint64(0);
        if (!Common.isInitialized(rhs)) rhs = asEuint64(0);
        return euint64.wrap(Impl.mathOp(
            TypeConstants.EUINT64, euint64.unwrap(lhs), euint64.unwrap(rhs), FunctionId.Add
        ));
    }

    // === sub ===
    function sub(euint64 lhs, euint64 rhs) internal returns (euint64) {
        if (!Common.isInitialized(lhs)) lhs = asEuint64(0);
        if (!Common.isInitialized(rhs)) rhs = asEuint64(0);
        return euint64.wrap(Impl.mathOp(
            TypeConstants.EUINT64, euint64.unwrap(lhs), euint64.unwrap(rhs), FunctionId.Sub
        ));
    }

    // === ACL ===
    function allow(euint64 value, address account) internal {
        IArFHETaskManager(ARFHE_TASK_MANAGER).allow(euint64.unwrap(value), account);
    }

    function allowThis(euint64 value) internal {
        IArFHETaskManager(ARFHE_TASK_MANAGER).allow(euint64.unwrap(value), address(this));
    }

    // === Diğer tipler için de aynı pattern uygulanır ===
    // add(euint8, euint8), add(euint16, euint16), mul, div, vb.
    // Tam liste FunctionId enum'daki her operasyon için yazılır
}
```

### 6.3 Deploy Sırası

```
1. ArFHETaskManager deploy et (verifierAddress ve engineAddress parametreleriyle)
2. TaskManager adresini ArFHE.sol'daki ARFHE_TASK_MANAGER constant'ına yaz
3. ArFHE.sol kullanan kontratları (WrappedETH, WrappedUSDC) deploy et
```

**NOT:** ARFHE_TASK_MANAGER adresi immutable constant. Her zincir için ayrı deploy gerekir. CREATE2 kullanarak deterministic adres üretmek düşünülebilir (tüm zincirlerde aynı adres).

### 6.4 CREATE2 ile Deterministic Adres

```solidity
// Tüm zincirlerde aynı adresi garantilemek için CREATE2 factory:
contract ArFHEDeployer {
    function deploy(bytes32 salt, bytes memory bytecode) external returns (address) {
        address addr;
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        return addr;
    }
}
```

---

## 7. BİLEŞEN 4: FHE BACKEND (COMPUTE ENGINE)

### 7.1 Görev

Blockchain'deki TaskManager event'lerini dinler, homomorfik operasyonları gerçekleştirir, sonuçları yazar. Ayrıca sealoutput/decrypt API'sini sunar.

### 7.2 Detaylı Tasarım

#### Event Listener

```rust
// backend/arfhe-engine/src/listener.rs

use ethers::prelude::*;
use ethers::contract::abigen;

// TaskManager ABI'dan event'leri oluştur
abigen!(
    ArFHETaskManager,
    r#"[
        event TaskCreated(uint256 indexed resultCtHash, uint8 returnType, uint8 funcId, uint256[] encryptedInputs, uint256[] extraInputs)
        event InputVerified(uint256 indexed ctHash, address indexed sender)
        event DecryptRequested(uint256 indexed ctHash, address indexed requestor)
    ]"#
);

pub async fn start_listener(
    provider: Provider<Ws>,
    task_manager_address: Address,
    server_key: &ServerKey,
    ct_store: &CiphertextStore,
) {
    let contract = ArFHETaskManager::new(task_manager_address, Arc::new(provider));
    
    // TaskCreated event'lerini dinle
    let events = contract.task_created_filter().subscribe().await.unwrap();
    
    events.for_each(|event| async {
        match event {
            Ok(log) => {
                process_task(log, server_key, ct_store).await;
            }
            Err(e) => {
                tracing::error!("Event error: {}", e);
            }
        }
    }).await;
}

async fn process_task(
    event: TaskCreatedFilter,
    server_key: &ServerKey,
    ct_store: &CiphertextStore,
) {
    let result_ct_hash = event.result_ct_hash;
    let func_id = event.func_id;
    let encrypted_inputs = event.encrypted_inputs;
    let extra_inputs = event.extra_inputs;

    match FunctionId::from(func_id) {
        FunctionId::Add => {
            let ct_a = ct_store.get(&encrypted_inputs[0]).await.unwrap();
            let ct_b = ct_store.get(&encrypted_inputs[1]).await.unwrap();
            
            // TFHE homomorfik toplama
            let result = server_key.add(&ct_a, &ct_b);
            
            ct_store.put(&result_ct_hash, &result).await.unwrap();
        }
        FunctionId::Sub => {
            let ct_a = ct_store.get(&encrypted_inputs[0]).await.unwrap();
            let ct_b = ct_store.get(&encrypted_inputs[1]).await.unwrap();
            
            let result = server_key.sub(&ct_a, &ct_b);
            
            ct_store.put(&result_ct_hash, &result).await.unwrap();
        }
        FunctionId::TrivialEncrypt => {
            let value = extra_inputs[0];
            let utype = extra_inputs[1] as u8;
            
            // Plaintext'i encrypt et
            let result = server_key.trivial_encrypt(value);
            
            ct_store.put(&result_ct_hash, &result).await.unwrap();
        }
        // ... diğer operasyonlar (mul, div, eq, gt, lt, vb.)
        _ => {
            tracing::warn!("Unsupported function: {:?}", func_id);
        }
    }
}
```

#### Sealoutput API

```rust
// backend/arfhe-engine/src/routes.rs

use axum::{Json, extract::State};
use nacl::box_::*;

#[derive(Deserialize)]
pub struct SealOutputRequest {
    pub ct_tempkey: String,          // ctHash hex (64 chars, no 0x prefix)
    pub host_chain_id: u64,
    pub permit: Permission,
}

#[derive(Serialize)]
pub struct SealOutputResponse {
    pub sealed: Option<SealedData>,
    pub error_message: Option<String>,
}

#[derive(Serialize)]
pub struct SealedData {
    pub data: Vec<u8>,
    pub public_key: Vec<u8>,
    pub nonce: Vec<u8>,
}

pub async fn sealoutput_handler(
    State(state): State<AppState>,
    Json(req): Json<SealOutputRequest>,
) -> Json<SealOutputResponse> {
    // 1. Permit'i doğrula
    let permit_valid = verify_permit(&req.permit, req.host_chain_id);
    if !permit_valid {
        return Json(SealOutputResponse {
            sealed: None,
            error_message: Some("Invalid permit".to_string()),
        });
    }

    // 2. ctHash'i parse et
    let ct_hash = U256::from_str_radix(&req.ct_tempkey, 16).unwrap();

    // 3. ACL kontrolü — bu kullanıcı bu ctHash'e erişebilir mi?
    let allowed = state.acl_store.is_allowed(&ct_hash, &req.permit.issuer).await;
    if !allowed {
        return Json(SealOutputResponse {
            sealed: None,
            error_message: Some("Not allowed".to_string()),
        });
    }

    // 4. Ciphertext'i al ve decrypt et
    let ciphertext = match state.ct_store.get(&ct_hash).await {
        Some(ct) => ct,
        None => {
            return Json(SealOutputResponse {
                sealed: None,
                error_message: Some("Ciphertext not found".to_string()),
            });
        }
    };

    let plaintext = state.client_key.decrypt(&ciphertext);

    // 5. Plaintext'i sealing key ile encrypt et (NaCl box)
    let sealing_public_key = hex::decode(&req.permit.sealing_key[2..]).unwrap();
    let sealed = seal_value(plaintext, &sealing_public_key);

    Json(SealOutputResponse {
        sealed: Some(sealed),
        error_message: None,
    })
}

fn seal_value(value: u64, recipient_public_key: &[u8]) -> SealedData {
    // NaCl box encryption — cofhejs'in SealingKey.seal() ile aynı
    let ephemeral_keypair = generate_keypair();
    let nonce = generate_nonce();
    
    let plaintext_bytes = value.to_le_bytes();  // toBigInt uyumlu
    
    let encrypted = nacl::box_::seal(
        &plaintext_bytes,
        &nonce,
        recipient_public_key,
        &ephemeral_keypair.secret_key,
    );

    SealedData {
        data: encrypted,
        public_key: ephemeral_keypair.public_key.to_vec(),
        nonce: nonce.to_vec(),
    }
}
```

#### Permit Doğrulama

```rust
// backend/arfhe-engine/src/acl.rs

#[derive(Deserialize)]
pub struct Permission {
    pub issuer: String,              // "0x..." — permit oluşturan adres
    pub expiration: u64,             // Unix timestamp
    pub recipient: String,           // "0x..." veya "0x0000...0000"
    pub validator_id: U256,
    pub validator_contract: String,
    pub sealing_key: String,         // "0x..." — nacl public key (32 bytes hex)
    pub issuer_signature: String,    // "0x..." — EIP-712 imza
    pub recipient_signature: String,
}

pub fn verify_permit(permit: &Permission, chain_id: u64) -> bool {
    // 1. Expiration kontrolü
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    if permit.expiration < now {
        return false;
    }

    // 2. EIP-712 signature doğrulama
    // Domain: { name: "ArFHE", version: "1", chainId, verifyingContract: TaskManagerAddress }
    // Types: PermissionedV1 { issuer, expiration, recipient, validatorId, validatorContract, sealingKey }
    
    let domain = eip712_domain(chain_id);
    let message = eip712_message(permit);
    let typed_data_hash = compute_eip712_hash(&domain, &message);
    
    let recovered = ecrecover(&typed_data_hash, &permit.issuer_signature);
    recovered.to_lowercase() == permit.issuer.to_lowercase()
}
```

#### Rust Bağımlılıklar

```toml
[dependencies]
arfhe-common = { path = "../arfhe-common" }
tfhe = { version = "0.11", features = ["integer", "x86_64-unix"] }
axum = "0.8"
tokio = { version = "1", features = ["full"] }
ethers = { version = "2", features = ["ws"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
hex = "0.4"
nacl = "0.5"            # veya sodiumoxide
secp256k1 = "0.29"
tiny-keccak = { version = "2", features = ["keccak"] }
sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres"] }
tracing = "0.1"
```

---

## 8. BİLEŞEN 5: CLIENT KÜTÜPHANESİ (arfhe-js)

### 8.1 Görev

cofhejs'in yerine geçecek JavaScript/TypeScript SDK. ArfheWallet'tan çağrılır.

### 8.2 Detaylı Tasarım

```typescript
// sdk/src/arfhe.ts — Ana SDK

import { TfheCompactPublicKey, CompactPkeCrs } from "tfhe";
import { SealingKey, GenerateSealingKey } from "./sealing";

export interface ArFHEConfig {
  keyServerUrl: string;        // ArFHE Key Server URL
  verifierUrl: string;         // ArFHE Verifier URL  
  engineUrl: string;           // ArFHE Engine URL (sealoutput/decrypt)
}

// cofhejs'in environment karşılığı
export const ENVIRONMENTS: Record<string, ArFHEConfig> = {
  LOCAL: {
    keyServerUrl: "http://127.0.0.1:8001",
    verifierUrl: "http://127.0.0.1:8002",
    engineUrl: "http://127.0.0.1:8003",
  },
  TESTNET: {
    keyServerUrl: "https://keys.arfhe.xyz",
    verifierUrl: "https://verifier.arfhe.xyz",
    engineUrl: "https://engine.arfhe.xyz",
  },
  MAINNET: {
    keyServerUrl: "https://keys.arfhe.xyz",      // Aynı sunucu, farklı key set
    verifierUrl: "https://verifier.arfhe.xyz",
    engineUrl: "https://engine.arfhe.xyz",
  },
};
```

```typescript
// sdk/src/init.ts — TFHE WASM initialization

import init, { init_panic_hook } from "tfhe";

let initialized = false;

export async function initTfhe(): Promise<void> {
  if (initialized) return;
  await init();
  await init_panic_hook();
  initialized = true;
}
```

```typescript
// sdk/src/encrypt.ts — Encryption

import {
  TfheCompactPublicKey,
  CompactPkeCrs,
  ProvenCompactCiphertextList,
  CompactCiphertextListBuilder,
  ZkComputeLoad,
} from "tfhe";

export interface EncryptableItem {
  data: bigint;
  utype: number;  // 5 = uint64
}

export interface EncryptResult {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: string;
}

export async function encrypt(
  items: EncryptableItem[],
  publicKey: TfheCompactPublicKey,
  crs: CompactPkeCrs,
  account: string,
  chainId: string,
  securityZone: number,
  verifierUrl: string,
): Promise<EncryptResult[]> {
  // 1. Pack — TFHE compact ciphertext list oluştur
  const builder = ProvenCompactCiphertextList.builder(publicKey);
  for (const item of items) {
    switch (item.utype) {
      case 5: // uint64
        builder.push_u64(item.data);
        break;
      // ... diğer tipler
    }
  }

  // 2. Prove — ZK proof üret
  const metadata = constructMetadata(account, securityZone, parseInt(chainId));
  const provenList = await new Promise<ProvenCompactCiphertextList>((resolve) => {
    setTimeout(() => {
      resolve(builder.build_with_proof_packed(crs, metadata, ZkComputeLoad.Verify));
    }, 0);
  });

  // 3. Verify — Kanıtı ArFHE Verifier'a gönder
  const listBytes = provenList.serialize();
  const packedList = toHexString(listBytes);

  const response = await fetch(`${verifierUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      packed_list: packedList,
      account_addr: account,
      security_zone: securityZone,
      chain_id: parseInt(chainId),
    }),
  });

  const json = await response.json();
  if (json.status !== "success") {
    throw new Error(`Verification failed: ${json.error}`);
  }

  // 4. Sonuçları dön
  return json.data.map((item: any, index: number) => ({
    ctHash: BigInt(item.ct_hash),
    securityZone,
    utype: items[index].utype,
    signature: item.signature + (item.recid + 27).toString(16).padStart(2, "0"),
  }));
}

function constructMetadata(account: string, securityZone: number, chainId: number): Uint8Array {
  // cofhejs'in constructZkPoKMetadata ile birebir aynı
  const accountBytes = hexToBytes(account.startsWith("0x") ? account.slice(2) : account);
  const chainIdBytes = new Uint8Array(32);
  let value = chainId;
  for (let i = 31; i >= 0 && value > 0; i--) {
    chainIdBytes[i] = value & 0xff;
    value = value >>> 8;
  }
  const metadata = new Uint8Array(1 + accountBytes.length + 32);
  metadata[0] = securityZone;
  metadata.set(accountBytes, 1);
  metadata.set(chainIdBytes, 1 + accountBytes.length);
  return metadata;
}
```

```typescript
// sdk/src/unseal.ts — Decryption/Unsealing

import { SealingKey } from "./sealing";

export interface Permission {
  issuer: string;
  expiration: number;
  recipient: string;
  validatorId: number;
  validatorContract: string;
  sealingKey: string;
  issuerSignature: string;
  recipientSignature: string;
}

export async function unseal(
  ctHash: bigint,
  engineUrl: string,
  chainId: number,
  permit: Permission,
  sealingKey: SealingKey,
): Promise<bigint> {
  const response = await fetch(`${engineUrl}/sealoutput`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ct_tempkey: ctHash.toString(16).padStart(64, "0"),
      host_chain_id: chainId,
      permit,
    }),
  });

  const data = await response.json();
  
  if (data.error_message) {
    throw new Error(`Sealoutput error: ${data.error_message}`);
  }

  if (!data.sealed) {
    throw new Error("Sealed data not found");
  }

  // NaCl box.open ile decrypt et
  return sealingKey.unseal(data.sealed);
}
```

```typescript
// sdk/src/sealing.ts — cofhejs'in sealing.ts'inden birebir kopyalanacak
// Zaten tweetnacl kullanıyor, değişiklik yok
// SealingKey class, GenerateSealingKey function
// nacl.box / nacl.box.open
```

```typescript
// sdk/src/permit.ts — Permit Management
// cofhejs'in permit sistemi birebir kullanılacak
// EIP-712 typed data signing
// Permit oluşturma, imzalama, doğrulama
// Tek fark: EIP-712 domain'de name = "ArFHE", verifyingContract = ArFHETaskManager adresi
```

### 8.3 package.json

```json
{
  "name": "@arfhe/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "test": "vitest run",
    "dev": "tsup src/index.ts --watch"
  },
  "dependencies": {
    "tfhe": "0.11.1",
    "tweetnacl": "^1.0.3",
    "tweetnacl-util": "^0.15.1",
    "ethers": "^6.15.0",
    "zustand": "^5.0.1",
    "idb-keyval": "^6.2.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsup": "^8.0.0",
    "vitest": "^3.0.0"
  }
}
```

---

## 9. BİLEŞEN 6: WRAPPER KONTRATLARI

### 9.1 Mevcut Kontratlarımızın Adaptasyonu

Mevcut WrappedETH_V4 ve WrappedUSDC_V3 kontratlarımız neredeyse aynı kalacak. Tek değişiklik: `import` satırı.

```solidity
// ÖNCE (Fhenix):
import "@fhenixprotocol/cofhe-contracts/FHE.sol";

// SONRA (ArFHE):
import "./ArFHE.sol";
```

Ve `FHE.` yerine `ArFHE.` kullanılacak:

```solidity
// ÖNCE:
euint64 encAmount = FHE.asEuint64(uint64(msg.value));
_encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
FHE.allowThis(_encryptedBalances[msg.sender]);
FHE.allow(_encryptedBalances[msg.sender], msg.sender);

// SONRA:
euint64 encAmount = ArFHE.asEuint64(uint64(msg.value));
_encryptedBalances[msg.sender] = ArFHE.add(_encryptedBalances[msg.sender], encAmount);
ArFHE.allowThis(_encryptedBalances[msg.sender]);
ArFHE.allow(_encryptedBalances[msg.sender], msg.sender);
```

Geri kalan tüm kontrat mantığı **birebir aynı** kalır.

---

## 10. GÜVENLİK MİMARİSİ

### 10.1 Tehdit Modeli

| Tehdit | Etki | Mitigasyon |
|--------|------|------------|
| Secret key sızıntısı | 🔴 Tüm bakiyeler açık | HSM, key rotation, memory zeroing |
| Engine compromise | 🔴 Bakiyeler manipüle edilebilir | İmza doğrulama, merkle proof, audit log |
| Verifier compromise | 🟡 Sahte ciphertext kabul | Multi-sig verifier, signature rotation |
| TaskManager exploit | 🔴 ACL bypass | Audit, formal verification |
| MITM (API) | 🟡 Veri sızıntısı | mTLS, certificate pinning |
| DDoS | 🟡 Servis kesintisi | Rate limiting, CloudFlare |
| Insider threat | 🔴 Key erişimi | HSM, separation of duties |

### 10.2 Key Management

```
Faz 1 (Testnet — basit):
  - Keys dosya sisteminde encrypted
  - AES-256 ile encryption, password env variable'dan
  - Sunucu başlatırken password gerekli

Faz 2 (Mainnet — güvenli):
  - Client Key: HSM (AWS CloudHSM veya Azure Dedicated HSM)
  - Server Key: HashiCorp Vault
  - Verifier ECDSA Key: HSM
  - Key rotation mekanizması
  - Audit logging
  
Faz 3 (Threshold — ideal):
  - Client key Shamir Secret Sharing ile 5 parçaya bölünür
  - 3/5 threshold ile decrypt
  - Her parça farklı coğrafyada farklı sunucuda
  - Hiçbir tekil kişi/sunucu tüm key'e erişemez
```

### 10.3 Memory Safety

```rust
// Rust'ın zeroize crate'i ile memory'deki hassas verileri temizle
use zeroize::Zeroize;

struct SensitiveData {
    key_bytes: Vec<u8>,
}

impl Drop for SensitiveData {
    fn drop(&mut self) {
        self.key_bytes.zeroize(); // Memory'de sıfırla
    }
}
```

### 10.4 Audit Gereksinimleri

```
Mainnet öncesi minimum:
  1. Solidity kontratları: Profesyonel güvenlik auditi (Trail of Bits, OpenZeppelin, vb.)
  2. Rust backend: İç code review + fuzzing
  3. SDK: İç code review
  
Mainnet sonrası (ilk 3 ay):
  4. Penetration testing
  5. Bug bounty programı
```

---

## 11. DEPLOY VE OPERASYON

### 11.1 Altyapı

```
Development (Faz 1):
  - Tek sunucu (VPS): 4 vCPU, 16GB RAM, 100GB SSD
  - OS: Ubuntu 22.04
  - Docker Compose ile tüm servisler
  - PostgreSQL (ciphertext storage)
  - Maliyet: ~$40-80/ay

Production (Faz 2):
  - 2 sunucu (primary + backup): 8 vCPU, 32GB RAM
  - Managed PostgreSQL (RDS/Cloud SQL)
  - Redis cache
  - CloudFlare / Nginx reverse proxy
  - Monitoring: Prometheus + Grafana
  - Maliyet: ~$200-400/ay
```

### 11.2 Docker Compose

```yaml
# docker/docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: arfhe
      POSTGRES_USER: arfhe
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  keys:
    build:
      context: ../backend
      dockerfile: ../docker/Dockerfile.keys
    environment:
      - ARFHE_KEY_PATH=/data/keys
      - ARFHE_PORT=8001
    volumes:
      - key_data:/data/keys
    ports:
      - "8001:8001"

  verifier:
    build:
      context: ../backend
      dockerfile: ../docker/Dockerfile.verifier
    environment:
      - DATABASE_URL=postgres://arfhe:${DB_PASSWORD}@postgres/arfhe
      - ARFHE_SIGNER_KEY=${VERIFIER_PRIVATE_KEY}
      - ARFHE_KEY_PATH=/data/keys
      - ARFHE_PORT=8002
    volumes:
      - key_data:/data/keys
    ports:
      - "8002:8002"
    depends_on:
      - postgres

  engine:
    build:
      context: ../backend
      dockerfile: ../docker/Dockerfile.engine
    environment:
      - DATABASE_URL=postgres://arfhe:${DB_PASSWORD}@postgres/arfhe
      - ARFHE_KEY_PATH=/data/keys
      - ARFHE_PORT=8003
      - ETH_RPC_WS=wss://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}
      - TASK_MANAGER_ADDRESS=${TASK_MANAGER_ADDRESS}
      - ENGINE_PRIVATE_KEY=${ENGINE_PRIVATE_KEY}
    volumes:
      - key_data:/data/keys
    ports:
      - "8003:8003"
    depends_on:
      - postgres

volumes:
  pg_data:
  key_data:
```

### 11.3 Deploy Sırası

```
1. FHE key pair üret (arfhe-cli keygen)
2. Verifier ECDSA key pair üret
3. Engine wallet key pair üret (on-chain tx yazabilmek için)
4. PostgreSQL kur, migration çalıştır
5. Backend servislerini başlat (keys → verifier → engine)
6. TaskManager kontratını deploy et (verifier address + engine address ile)
7. ArFHE.sol'daki TASK_MANAGER adresini güncelle
8. Wrapper kontratlarını deploy et
9. Engine'i TaskManager adresine point et
10. End-to-end test çalıştır
```

---

## 12. TEST STRATEJİSİ

### 12.1 Unit Tests

```
Backend (Rust):
  - TFHE key generation: Key üretip serialize/deserialize et
  - Homomorfik operasyonlar: encrypt(5) + encrypt(3) = decrypt(8)
  - ZK proof verify: Geçerli/geçersiz proof kontrolü
  - Signature: imza üretme/doğrulama
  - ACL: izin kontrolü
  - Sealing: seal/unseal round-trip

Contracts (Solidity):
  - TaskManager: createTask, verifyInput, ACL
  - ArFHE library: asEuint64, add, sub, allow
  - WrappedETH: wrap, unwrap, transferEncrypted
  - WrappedUSDC: wrap, unwrap, transferEncrypted

SDK (TypeScript):
  - Encrypt: mock verifier ile
  - Unseal: mock engine ile
  - Permit: EIP-712 signature
  - Sealing: nacl box round-trip
```

### 12.2 Integration Tests

```
1. Full Round Trip Test:
   a) SDK: encrypt(100) → InEuint64
   b) Contract: wrap(100) → TaskCreated event
   c) Engine: process task → ciphertext stored
   d) SDK: unseal(ctHash) → 100 ✅

2. Transfer Test:
   a) User A: wrap(100)
   b) User A: transferEncrypted(userB, encrypt(30))
   c) User A: unseal → 70 ✅
   d) User B: unseal → 30 ✅

3. Unwrap Test:
   a) User: wrap(100)
   b) User: unwrap(50)
   c) User: unseal → 50 ✅
   d) User native balance: +50 ✅
```

### 12.3 Stress Test

```
- 100 eşzamanlı encrypt isteği
- 100 eşzamanlı sealoutput isteği
- Engine task processing throughput
- Memory usage under load
```

---

## 13. FAZ PLANI VE TIMELINE

### Faz 0: Hazırlık (1 hafta)

```
[ ] Repo oluştur (arfdaodev/arfhe)
[ ] Rust workspace kur (backend/)
[ ] Hardhat/Foundry proje kur (contracts/)
[ ] SDK proje kur (sdk/)
[ ] Docker yapısı kur
[ ] CI/CD pipeline (GitHub Actions)
[ ] Dev ortamı dokümantasyonu
```

### Faz 1: Key Server + CRS (2 hafta)

```
Hafta 1:
  [ ] tfhe-rs ile key generation kodu yaz
  [ ] CRS generation kodu yaz
  [ ] Key serialization/deserialization
  [ ] Dosya tabanlı key storage
  [ ] Unit tests: key round-trip

Hafta 2:
  [ ] Axum HTTP server kur
  [ ] GET /GetNetworkPublicKey endpoint
  [ ] GET /GetCrs endpoint
  [ ] GET /health endpoint
  [ ] Docker image oluştur
  [ ] Integration test: SDK'dan key fetch
```

### Faz 2: Verifier Servisi (3 hafta)

```
Hafta 3:
  [ ] ZK proof deserialization (tfhe-rs)
  [ ] Proof verification logic
  [ ] ctHash hesaplama algoritması

Hafta 4:
  [ ] ECDSA signing (secp256k1)
  [ ] POST /verify endpoint
  [ ] GET /signerAddress endpoint
  [ ] PostgreSQL ciphertext storage
  [ ] Unit tests: verify + sign

Hafta 5:
  [ ] Integration test: SDK encrypt → verifier verify
  [ ] Error handling ve logging
  [ ] Rate limiting
```

### Faz 3: TaskManager Kontratı (2 hafta)

```
Hafta 6:
  [ ] ArFHETypes.sol (type definitions)
  [ ] IArFHETaskManager.sol (interface)
  [ ] ArFHETaskManager.sol (implementation)
  [ ] ArFHE.sol (library — FHE.sol karşılığı)
  [ ] Hardhat tests

Hafta 7:
  [ ] ACL yönetimi testleri
  [ ] Event emission testleri
  [ ] Signature verification testleri
  [ ] Gas optimizasyonu
  [ ] Sepolia testnet deploy
```

### Faz 4: FHE Compute Engine (3 hafta)

```
Hafta 8:
  [ ] Blockchain event listener (ethers-rs)
  [ ] Homomorfik operasyonlar: add, sub
  [ ] Homomorfik operasyonlar: mul, div, rem
  [ ] trivialEncrypt (plaintext → ciphertext)
  [ ] Ciphertext storage (PostgreSQL)

Hafta 9:
  [ ] POST /sealoutput endpoint
  [ ] POST /decrypt endpoint
  [ ] Permit doğrulama (EIP-712)
  [ ] ACL doğrulama
  [ ] NaCl sealing

Hafta 10:
  [ ] TaskManager'a sonuç yazma (engine tx)
  [ ] Comparison ops: eq, ne, gt, lt, gte, lte
  [ ] Bitwise ops: and, or, xor, not, shl, shr
  [ ] Integration test: full round-trip
```

### Faz 5: SDK (arfhe-js) (2 hafta)

```
Hafta 11:
  [ ] TFHE WASM init
  [ ] Encrypt fonksiyonu (ZK proof + verify)
  [ ] Unseal fonksiyonu (sealoutput)
  [ ] Sealing key management (nacl)
  [ ] Permit oluşturma/imzalama (EIP-712)
  [ ] Store (zustand)

Hafta 12:
  [ ] ArfheWallet entegrasyonu
    [ ] FheCofheService.ts → ArFheService.ts
    [ ] cofhejs import → @arfhe/sdk import
    [ ] Environment config güncelleme
  [ ] End-to-end test: wallet → SDK → backend → blockchain → unseal
  [ ] npm paketi publish (@arfhe/sdk)
```

### Faz 6: Testnet Hardening (2 hafta)

```
Hafta 13:
  [ ] Sepolia + Arbitrum Sepolia + Base Sepolia deploy
  [ ] Multi-chain test
  [ ] Error recovery testleri
  [ ] Stress testing
  [ ] Monitoring setup (Prometheus + Grafana)

Hafta 14:
  [ ] Security review (internal)
  [ ] Bug fixes
  [ ] Dokümantasyon tamamlama
  [ ] ArfheWallet tam entegrasyon
  [ ] Demo hazırlama
```

### Faz 7: Mainnet Hazırlık (4+ hafta)

```
Hafta 15-16:
  [ ] Güvenlik auditi (kontratlar)
  [ ] HSM entegrasyonu (key management)
  [ ] Production altyapı kurulumu

Hafta 17-18:
  [ ] Mainnet TaskManager deploy (Ethereum, Arbitrum, Base)
  [ ] Mainnet wrapper kontratları deploy
  [ ] Canary deployment (küçük miktarlarla test)
  [ ] Bug bounty programı başlat
```

### TOPLAM: ~18 hafta (4.5 ay)

```
Faz 0: Hazırlık                    1 hafta
Faz 1: Key Server                  2 hafta
Faz 2: Verifier                    3 hafta
Faz 3: TaskManager (Solidity)      2 hafta
Faz 4: Compute Engine              3 hafta
Faz 5: SDK (arfhe-js)              2 hafta
Faz 6: Testnet Hardening           2 hafta
Faz 7: Mainnet                     4+ hafta (audit süresi dahil)
```

---

## 14. RİSK ANALİZİ

### 14.1 Teknik Riskler

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| tfhe-rs Rust/WASM uyumsuzluğu | Orta | Yüksek | Erken PoC ile test et |
| ZK proof formatı uyuşmazlığı | Orta | Yüksek | Aynı tfhe sürümünü kullan |
| TFHE performans (homomorfik ops yavaş) | Düşük | Orta | Async processing, queue |
| Key serialization format değişikliği | Düşük | Yüksek | tfhe sürümünü sabitle |
| Blockchain reorg → event kaçırma | Orta | Orta | Confirmation bekle, replay |

### 14.2 Operasyonel Riskler

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| Sunucu çökmesi | Orta | Yüksek | Backup, auto-restart, monitoring |
| Database corruption | Düşük | Çok Yüksek | Backup, replication |
| Key kaybolması | Düşük | ☠️ FATAL | HSM, multiple backups |
| DDoS | Orta | Orta | CloudFlare, rate limiting |

### 14.3 Kritik Uyarılar

```
⚠️ SECRET KEY KAYBI = TÜM FON KAYBI
   Client key olmadan hiçbir ciphertext decrypt edilemez.
   Bu key'in yedeği MUTLAKA birden fazla yerde olmalı.

⚠️ FAZ 1'DE TEK SUNUCU = TEK NOKTA ARIZA
   Engine çökerse unseal çalışmaz → kullanıcılar bakiyelerini göremez.
   Fonlar kontratta güvende ama erişilemez.
   Çözüm: Auto-restart, monitoring, backup sunucu.

⚠️ MAINNET'E AUDİTSİZ ÇIKMA
   Kontratlar audit edilmeden mainnet'e deploy EDİLMEMELİ.
   Testnet'te 4-8 hafta sorunsuz çalışması gerekli.
```

---

## SONUÇ

Bu plan, Fhenix/CoFHE'ye olan bağımlılığı tamamen kaldırıp kendi FHE altyapımızı kurmak için gereken her adımı en ince detayına kadar açıklamaktadır.

**Özet:**
- 5 ana bileşen: Key Server, Verifier, TaskManager, Compute Engine, SDK
- ~18 hafta toplam geliştirme süresi
- Rust (backend) + Solidity (kontratlar) + TypeScript (SDK)
- Testnet → Audit → Mainnet sıralaması
- Güvenlik ilk gün'den itibaren düşünülmüş

Bu dokümanı yeni repoya kopyalayıp geliştirmeye başlayabiliriz.
