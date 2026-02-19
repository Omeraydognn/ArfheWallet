# ArfheWallet — FHE (Fully Homomorphic Encryption) Tam Rehber

> Bu doküman, ArfheWallet projesindeki FHE sisteminin A'dan Z'ye nasıl çalıştığını,
> hangi dosyada neyin yapıldığını, karşılaşılan hataları ve çözümlerini,
> sıfırdan tekrar inşa etmek için gereken tüm adımları içerir.

---

## 📋 İÇİNDEKİLER

1. [Genel Mimari](#1-genel-mimari)
2. [Kullanılan Kütüphaneler ve Versiyonlar](#2-kullanılan-kütüphaneler-ve-versiyonlar)
3. [Dosya Haritası — Hangi Dosya Ne Yapar](#3-dosya-haritası--hangi-dosya-ne-yapar)
4. [Akıllı Kontratlar (Solidity)](#4-akıllı-kontratlar-solidity)
5. [Frontend FHE Servisi (FheCofheService.ts)](#5-frontend-fhe-servisi-fhecofheservicets)
6. [Network.ts — FHE Fonksiyonları](#6-networkts--fhe-fonksiyonları)
7. [Home.tsx — FHE Entegrasyonu](#7-hometsx--fhe-entegrasyonu)
8. [Vite Konfigürasyonu (WASM Desteği)](#8-vite-konfigürasyonu-wasm-desteği)
9. [Deploy Sistemi (Hardhat)](#9-deploy-sistemi-hardhat)
10. [.env Dosyası](#10-env-dosyası)
11. [Sıfırdan Kurulum Adımları](#11-sıfırdan-kurulum-adımları)
12. [FHE Akış Şeması](#12-fhe-akış-şeması)
13. [Karşılaşılan Hatalar ve Çözümleri](#13-karşılaşılan-hatalar-ve-çözümleri)
14. [Önemli Kurallar ve Uyarılar](#14-önemli-kurallar-ve-uyarılar)
15. [Mevcut Deploy Adresleri](#15-mevcut-deploy-adresleri)

---

## 1. Genel Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                    KULLANICI (Tarayıcı)                     │
│                                                             │
│  Home.tsx ──► FheCofheService.ts ──► cofhejs/web (WASM)     │
│      │              │                     │                 │
│      │              │           ┌─────────┴──────────┐      │
│      │              │           │ TFHE WASM Engine    │      │
│      │              │           │ (tfhe_bg.wasm)      │      │
│      │              │           └─────────┬──────────┘      │
│      │              │                     │                 │
│      ▼              ▼                     ▼                 │
│  Network.ts ◄── encrypt() ──► CoFHE Threshold Network      │
│      │              │         (testnet-cofhe-tn.fhenix.zone)│
│      │              │                                       │
└──────┼──────────────┼───────────────────────────────────────┘
       │              │
       ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│              SEPOLIA BLOCKCHAIN (ChainId: 11155111)         │
│                                                             │
│  WrappedETH_V4.sol ◄──── FHE.sol (@fhenixprotocol/cofhe)   │
│  WrappedUSDC_V3.sol ◄──┘                                   │
│       │                                                     │
│       ▼                                                     │
│  TaskManager (0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9)  │
│  (FHE operasyonlarını yürüten coprocessor)                  │
└─────────────────────────────────────────────────────────────┘
```

### Akış Özeti:
1. **Encrypt**: Kullanıcı miktarı girer → cofhejs WASM ile şifreler → ctHash + signature üretir
2. **On-chain**: Şifreli veri kontrata gönderilir → FHE.sol ile şifreli toplama/çıkarma yapılır
3. **Unseal**: Kontrat şifreli bakiye handle döner → cofhejs permit ile CoFHE'den çözer → kullanıcıya gösterir

---

## 2. Kullanılan Kütüphaneler ve Versiyonlar

### Frontend (package.json)
```json
{
  "cofhejs": "^0.3.1",          // FHE istemci kütüphanesi (encrypt/unseal)
  "ethers": "^6.13.5",          // Ethereum etkileşimi
  "vite-plugin-wasm": "^3.5.0", // WASM desteği (cofhejs/tfhe için)
  "vite-plugin-top-level-await": "^1.6.0" // Top-level await (WASM init için)
}
```

> **NOT**: `tfhe` paketi cofhejs'in dependency'si olarak otomatik gelir (v0.11.1).
> Manuel olarak kurmaya GEREK YOK.

### Kontrat (deploy/package.json)
```json
{
  "@fhenixprotocol/cofhe-contracts": "^0.0.14",  // FHE.sol, InEuint64, euint64 vs
  "@openzeppelin/contracts": "^5.1.0",           // IERC20
  "@nomicfoundation/hardhat-toolbox": "^5.0.0",  // Hardhat
  "hardhat": "^2.22.0"
}
```

### Import Yolları
```typescript
// Frontend — cofhejs
import { cofhejs, FheTypes, Encryptable, initialize, type CoFheInUint64 } from "cofhejs/web";
// ÖNEMLİ: "cofhejs/web" kullanılır, sadece "cofhejs" DEĞİL!

// Kontrat — Solidity
import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
```

---

## 3. Dosya Haritası — Hangi Dosya Ne Yapar

```
src/backend/
  ├── FheCofheService.ts    ← FHE servisi: init, encrypt, unseal, permit
  ├── Network.ts            ← Blockchain etkileşimi: wrap, unwrap, transfer, getShieldedBalance
  └── Account.ts            ← Cüzdan yönetimi (private_key, ethers_wallet)

src/pages/
  ├── Home.tsx              ← Ana sayfa: cofhejs init, bakiye gösterimi, token listesi
  └── Privacy.tsx           ← Gizlilik paneli: decrypt butonu, shielded balance gösterimi

contracts/
  ├── WrappedETH_V4.sol     ← cETH kontratı (MEVCUT - ERC20 YOK)
  └── WrappedUSDC_V3.sol    ← cUSDC kontratı (MEVCUT - ERC20 YOK)

deploy/
  ├── contracts/            ← Hardhat'in derlediği kontratlar (kopyası)
  ├── scripts/deploy-all.js ← Deploy scripti
  ├── hardhat.config.js     ← Hardhat ayarları
  └── package.json          ← Hardhat bağımlılıkları

vite.config.js              ← WASM, polyfills, serve-tfhe-wasm eklentisi
.env                        ← Kontrat adresleri, API anahtarları, deployer key
```

---

## 4. Akıllı Kontratlar (Solidity)

### 4.1 Temel Tasarım Prensipleri

> **KRİTİK**: Kontratlar ERC20'den MİRAS ALMAZ!
> ERC20 kullanıldığında `Transfer(from, to, amount)` eventi yayınlanır ve
> miktar Etherscan'de düz metin olarak görünür → GİZLİLİK İHLALİ!

Kontratların yapısı:
- ❌ `is ERC20` → YOK
- ❌ `_mint()`, `_burn()`, `_transfer()` → YOK
- ❌ `Transfer(from, to, amount)` eventi → YOK
- ✅ `mapping(address => euint64) _encryptedBalances` → şifreli bakiyeler
- ✅ `ConfidentialTransfer(from, to)` eventi → miktar YOK
- ✅ `name()`, `symbol()`, `decimals()` → standalone fonksiyonlar

### 4.2 WrappedETH_V4.sol (cETH — 18 decimals)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract WrappedETH_V4 {
    IWETH public immutable weth;
    mapping(address => euint64) private _encryptedBalances;

    // Eventlerde miktar YOK — sadece kim gönderdi, kim aldı
    event Wrapped(address indexed user);
    event Unwrapped(address indexed user);
    event ConfidentialTransfer(address indexed from, address indexed to);

    constructor(address wethAddress) {
        weth = IWETH(wethAddress);
    }

    function name() external pure returns (string memory) { return "Confidential ETH"; }
    function symbol() external pure returns (string memory) { return "cETH"; }
    function decimals() external pure returns (uint8) { return 18; }

    // === WRAP: ETH → cETH ===
    function wrapETH() external payable {
        require(msg.value > 0, "Must send ETH");
        weth.deposit{value: msg.value}();
        euint64 encAmount = FHE.asEuint64(uint64(msg.value));
        if (Common.isInitialized(_encryptedBalances[msg.sender])) {
            _encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
        } else {
            _encryptedBalances[msg.sender] = encAmount;
        }
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        emit Wrapped(msg.sender);
    }

    // === WRAP: WETH → cETH ===
    function wrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(address(weth)).transferFrom(msg.sender, address(this), amount), "WETH transfer failed");
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        if (Common.isInitialized(_encryptedBalances[msg.sender])) {
            _encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
        } else {
            _encryptedBalances[msg.sender] = encAmount;
        }
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        emit Wrapped(msg.sender);
    }

    // === UNWRAP: cETH → ETH ===
    function unwrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(Common.isInitialized(_encryptedBalances[msg.sender]), "No encrypted balance");
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _encryptedBalances[msg.sender] = FHE.sub(_encryptedBalances[msg.sender], encAmount);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        weth.withdraw(amount);
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");
        emit Unwrapped(msg.sender);
    }

    // === GİZLİ TRANSFER ===
    function transferEncrypted(address to, InEuint64 memory encryptedAmount) external returns (euint64) {
        require(to != address(0), "Cannot transfer to zero address");
        require(to != msg.sender, "Cannot transfer to self");
        require(Common.isInitialized(_encryptedBalances[msg.sender]), "No encrypted balance");

        euint64 amount = FHE.asEuint64(encryptedAmount);

        // Gönderenden çıkar
        _encryptedBalances[msg.sender] = FHE.sub(_encryptedBalances[msg.sender], amount);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);

        // Alıcıya ekle
        if (Common.isInitialized(_encryptedBalances[to])) {
            _encryptedBalances[to] = FHE.add(_encryptedBalances[to], amount);
        } else {
            _encryptedBalances[to] = amount;
        }
        FHE.allowThis(_encryptedBalances[to]);
        FHE.allow(_encryptedBalances[to], to);

        emit ConfidentialTransfer(msg.sender, to);
        return _encryptedBalances[msg.sender];
    }

    // === BAKİYE SORGULAMA (şifreli handle döner) ===
    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _encryptedBalances[account];
    }

    receive() external payable {}
}
```

### 4.3 WrappedUSDC_V3.sol (cUSDC — 6 decimals)
WrappedETH_V4 ile aynı yapı, farklar:
- Constructor: `IERC20(usdcAddress)` alır (IWETH yerine)
- `wrapETH()` fonksiyonu YOK
- `decimals()` → 6 döner
- `name()` → "Confidential USDC"
- `symbol()` → "cUSDC"
- `unwrap()`: USDC.transfer ile geri gönderir (WETH.withdraw yerine)

### 4.4 FHE.sol Kritik Fonksiyonlar

```solidity
FHE.asEuint64(uint64 value)        // Plaintext → encrypted euint64
FHE.asEuint64(InEuint64 input)     // Frontend'den gelen şifreli veri → euint64
FHE.add(euint64 a, euint64 b)      // Şifreli toplama
FHE.sub(euint64 a, euint64 b)      // Şifreli çıkarma (underflow'da revert)
FHE.allowThis(euint64 value)       // Kontratın kendi verisine erişimi
FHE.allow(euint64 value, address)  // Belirli adresin unseal yapabilmesi
Common.isInitialized(euint64 val)  // euint64 ilk kez mi set ediliyor kontrolü
```

### 4.5 InEuint64 Struct (Frontend → Kontrat arası veri formatı)

```solidity
struct InEuint64 {
    uint256 ctHash;       // Ciphertext hash (şifreli verinin kimliği)
    uint8 securityZone;   // Güvenlik bölgesi (genelde 0)
    uint8 utype;          // Tip: 5 = uint64
    bytes signature;      // cofhejs tarafından oluşturulan kriptografik kanıt (65 byte)
}
```

---

## 5. Frontend FHE Servisi (FheCofheService.ts)

### 5.1 Dosya: `src/backend/FheCofheService.ts`

Singleton pattern ile çalışır. Tüm FHE operasyonlarını yönetir.

### 5.2 Initialization (init)

```typescript
import { cofhejs, FheTypes, Encryptable, initialize, type CoFheInUint64 } from "cofhejs/web";

// ÖNEMLİ: cofhejs'in kendi initialize() fonksiyonunu kullanıyoruz
// cofhejs.initialize() DEĞİL — çünkü o viem adapter'a ihtiyaç duyuyor
const permit = await initialize({
  provider: abstractProvider,    // buildAbstractProvider() ile oluşturulur
  signer: abstractSigner,        // buildAbstractSigner() ile oluşturulur
  environment: "TESTNET",        // Sepolia için TESTNET
  generatePermit: false,         // Permit'i ayrıca oluşturuyoruz
});
```

### 5.3 Abstract Provider/Signer Yapısı

cofhejs ethers veya viem ile doğrudan çalışmaz. Ara katman gerekir:

```typescript
// ethers JsonRpcProvider → cofhejs AbstractProvider
function buildAbstractProvider(ethersProvider: JsonRpcProvider) {
  return {
    getChainId: async (): Promise<string> => {
      const network = await ethersProvider.getNetwork();
      return network.chainId.toString();
    },
    call: async (transaction: any): Promise<string> => {
      return await ethersProvider.call(transaction);
    },
    send: async (method: string, params: any[]): Promise<any> => {
      return await ethersProvider.send(method, params);
    },
  };
}

// ethers Wallet → cofhejs AbstractSigner
function buildAbstractSigner(ethersWallet: Wallet, abstractProvider: any) {
  return {
    getAddress: async (): Promise<string> => {
      return await ethersWallet.getAddress();
    },
    signTypedData: async (domain: any, types: any, value: any): Promise<string> => {
      return await ethersWallet.signTypedData(domain, types, value);
    },
    provider: abstractProvider,
    sendTransaction: async (tx: any): Promise<any> => {
      return await ethersWallet.sendTransaction(tx);
    },
  };
}
```

### 5.4 Hesap Takibi (Account Tracking)

> **KRİTİK**: cofhejs singleton'dır ve bir kez initialize edilince hangi hesap için
> initialize edildiğini bilmez. Hesap değiştiğinde tekrar initialize edilmesi ZORUNLUDUR.
> Yoksa `InvalidSigner` hatası alırsınız.

```typescript
// Hesap kontrolü
isReadyForAccount(accountAddress: string): boolean {
  if (!this._isReady) return false;
  if (!this.currentAccount) return false;
  return this.currentAccount.toLowerCase() === accountAddress.toLowerCase();
}

// init() içinde hesap değişimi kontrolü
async init(provider, signer) {
  const signerAddress = await signer.getAddress();
  
  // AYNI hesap → atla
  if (this._isReady && this.currentAccount?.toLowerCase() === signerAddress.toLowerCase()) {
    return; // Zaten bu hesap için hazır
  }
  
  // FARKLI hesap → sıfırla ve tekrar init et
  if (this._isReady && this.currentAccount?.toLowerCase() !== signerAddress.toLowerCase()) {
    this.reset(); // Eski state'i temizle
  }
  
  // ... initialize işlemi ...
  this.currentAccount = signerAddress; // Yeni hesabı kaydet
}
```

### 5.5 Encryption (Şifreleme)

```typescript
async encrypt(value: bigint): Promise<CoFheInUint64> {
  const result = await cofhejs.encrypt([Encryptable.uint64(value)]);
  // ÖNEMLİ: Encryptable.uint64() kullanılır, Encryptable.uint32() DEĞİL
  // Kontrat euint64 beklediği için uint64 ZORUNLU
  
  if (!result.success) throw new Error(`Encryption failed: ${result.error}`);
  
  const encrypted = result.data[0] as unknown as CoFheInUint64;
  // encrypted = { ctHash, securityZone, utype, signature }
  return encrypted;
}
```

### 5.6 Unseal (Şifre Çözme)

```typescript
async unseal(ctHash: bigint): Promise<bigint> {
  // 1. Önce permit olduğundan emin ol
  if (!this._hasPermit) {
    await this.ensurePermit();
  }
  
  // 2. cofhejs.unseal ile çöz
  const result = await cofhejs.unseal(ctHash, FheTypes.Uint64);
  
  if (!result.success) {
    // 3. Başarısız olursa manual sealoutput dene (fallback)
    const value = await this.manualUnseal(ctHash);
    return value;
  }
  
  return BigInt(result.data);
}
```

### 5.7 Permit Yönetimi

```typescript
// Permit = cofhejs'in CoFHE threshold network'ten şifreli veriyi çözmek için
// kullandığı yetkilendirme belgesi. Hesap bazlıdır.
private async ensurePermit(): Promise<boolean> {
  const permitResult = await cofhejs.createPermit();
  if (permitResult.success) {
    this._hasPermit = true;
    return true;
  }
  return false;
}
```

### 5.8 Manual Unseal (Fallback)

```typescript
// cofhejs.unseal başarısız olduğunda doğrudan sealoutput endpoint'ine istek atar
private async manualUnseal(ctHash: bigint): Promise<bigint> {
  const permission = cofhejs.getPermission().data;
  
  const response = await fetch("https://testnet-cofhe-tn.fhenix.zone/sealoutput", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ct_tempkey: ctHash.toString(16).padStart(64, "0"),
      host_chain_id: 11155111,
      permit: permission,
    }),
  });
  
  const data = await response.json();
  const activePermit = Object.values(cofhejs.getAllPermits().data)[0];
  return activePermit.unseal(data.sealed);
}
```

---

## 6. Network.ts — FHE Fonksiyonları

### 6.1 Dosya: `src/backend/Network.ts`

Network sınıfı blockchain etkileşimini yönetir. FHE ile ilgili 5 ana fonksiyon:

### 6.2 getShieldedBalance — Şifreli Bakiye Sorgulama

```typescript
async getShieldedBalance(contractAddress: string, userAddress: string, account?: Account): Promise<string> {
  // 1. Sadece Sepolia'da çalışır
  if (this.network_id !== NetworkId.Ethereum_Sepolia) return "0.0";
  
  // 2. cofhejs'i doğru hesap için initialize et
  const instance = FheCofheService.getInstance();
  if (!instance.isReadyForAccount(userAddress)) {
    const provider = new JsonRpcProvider(this.rpc_url);
    const connectedWallet = account.ethers_wallet.connect(provider);
    await instance.init(provider, connectedWallet);
  }
  
  // 3. confidentialBalanceOf(address) çağır — şifreli handle döner
  const iface = new Interface(["function confidentialBalanceOf(address account) view returns (uint256)"]);
  const data = iface.encodeFunctionData("confidentialBalanceOf", [userAddress]);
  const resultHex = await this.call("eth_call", [{ to: contractAddress, data }, "latest"]);
  
  // 4. Handle 0 kontrolü — şifreli bakiye yoksa unseal yapma!
  const handle = BigInt(resultHex);
  if (handle === BigInt(0)) {
    return "0.0"; // Unseal'a gönderme, 403 döner
  }
  
  // 5. Unseal ile şifre çöz
  const decrypted = await instance.unseal(handle);
  
  // 6. Decimal'e göre formatla
  const WRAPPED_ETH = import.meta.env.VITE_WRAPPED_ETH_ADDRESS.toLowerCase();
  const isEth = contractAddress.toLowerCase() === WRAPPED_ETH;
  const decimals = isEth ? 18 : 6;
  return this.formatTokenAmount(decrypted, decimals);
}
```

### 6.3 wrapETH — Native ETH → cETH

```typescript
async wrapETH(account: Account, wrappedTokenAddress: string, amount: string): Promise<string> {
  // wrapETH() payable fonksiyonunu çağır, ETH gönder
  const iface = new Interface(["function wrapETH() payable external"]);
  const data = iface.encodeFunctionData("wrapETH", []);
  
  return this.sendTransaction(account, {
    to: wrappedTokenAddress,
    value: amount,  // Native ETH
    data: data
  });
}
```

### 6.4 wrap — ERC20 (WETH/USDC) → cToken

```typescript
async wrap(account: Account, publicTokenAddress: string, wrappedTokenAddress: string, amount: string): Promise<string> {
  // 1. Decimal'i public token'dan al
  // 2. WETH ise: Bakiye yetersizse native ETH → WETH deposit yap
  // 3. Approve: publicToken.approve(wrappedContract, amount)
  // 4. wrap(uint256 amount) çağır
  
  const iface = new Interface(["function wrap(uint256 amount) external"]);
  const data = iface.encodeFunctionData("wrap", [amountValue]);
  return this.sendTransaction(account, { to: wrappedTokenAddress, value: "0", data });
}
```

### 6.5 unwrap — cToken → Public Token

```typescript
async unwrap(account: Account, wrappedTokenAddress: string, amount: string): Promise<string> {
  // unwrap(uint256 amount) çağır
  const iface = new Interface(["function unwrap(uint256 amount) external"]);
  const data = iface.encodeFunctionData("unwrap", [amountValue]);
  return this.sendTransaction(account, { to: wrappedTokenAddress, value: "0", data });
}
```

### 6.6 transferConfidential — Gizli Transfer (ASIL FHE İŞLEMİ)

```typescript
async transferConfidential(account: Account, shieldedTokenAddress: string, to: string, amount: string): Promise<string> {
  // 1. cofhejs'i TX gönderecek hesap ile initialize et
  const txSenderAddress = account.GetAddress();
  if (!FheCofheService.getInstance().isReadyForAccount(txSenderAddress)) {
    const provider = new JsonRpcProvider(this.rpc_url);
    const connectedWallet = account.ethers_wallet.connect(provider);
    await FheCofheService.getInstance().init(provider, connectedWallet);
  }
  
  // 2. Miktarı şifrele
  const WRAPPED_ETH = import.meta.env.VITE_WRAPPED_ETH_ADDRESS.toLowerCase();
  const isEth = shieldedTokenAddress.toLowerCase() === WRAPPED_ETH;
  const decimals = isEth ? 18 : 6;
  const amountValue = parseUnits(amount, decimals);
  const encrypted = await FheCofheService.getInstance().encrypt(BigInt(amountValue.toString()));
  
  // 3. ABI encode — InEuint64 tuple olarak
  const iface = new Interface([
    "function transferEncrypted(address to, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) inValue) external returns (uint256)"
  ]);
  
  const inEuint64 = {
    ctHash: encrypted.ctHash,
    securityZone: encrypted.securityZone,
    utype: encrypted.utype,
    signature: encrypted.signature
  };
  
  const data = iface.encodeFunctionData("transferEncrypted", [to, inEuint64]);
  
  // 4. TX gönder (gasLimit 3M)
  return this.sendTransaction(account, {
    to: shieldedTokenAddress,
    value: "0",
    data: data,
    gasLimit: 3000000n
  });
}
```

---

## 7. Home.tsx — FHE Entegrasyonu

### 7.1 cofhejs Initialization

Home.tsx yüklendiğinde Sepolia'da ise cofhejs otomatik initialize edilir:

```typescript
if (activeNetworkId === NetworkId.Ethereum_Sepolia && active_context.activeAccount) {
  const instance = FheCofheService.getInstance();
  
  if (!instance.isReadyForAccount(address)) {
    const provider = new JsonRpcProvider(net.rpc_url);
    const signer = new Wallet(privateKey, provider);
    await instance.init(provider, signer);
  }
}
```

### 7.2 Bakiye Gösterimi

```typescript
// V4 kontratların ERC20 balance'ı YOK
// Sadece FHE unseal ile bakiye alınır
const shieldedBal = await net.getShieldedBalance(WRAPPED_ETH_ADDRESS, address, activeAccount);
wrappedBalances.push({
  contractAddress: WRAPPED_ETH_ADDRESS,
  tokenBalance: shieldedBal,
  isNative: false,
  isShielded: true  // UI'da "Private" chip gösterir
});
```

### 7.3 Eski Kontrat Adresleri (IGNORED_CONTRACTS)

Home.tsx'te eski/bozuk kontrat adresleri filtrelenir:

```typescript
const IGNORED_CONTRACTS = [
  "0xbde0a2e375b67c802d4651fecf3b678b1886d15b", // SimpleWrappedUSDC (old)
  "0x3e0722a877e52fe755e8bf02372342c63930fd57", // MockFHEWrappedUSDC (old)
  "0x6ab305c679002c0938c2be3f824fcb8b81be5b70", // CoFHEWrappedUSDC v1 (old)
  "0x5c3f1fe2c451ccc73443865fec914a595c3d1a7c", // CoFHEWrappedUSDC v2 (old)
  "0x730bb4ee9ea1cdb0b45c1db01ca67a616d2d3c88", // Old WrappedUSDC
  "0x23bad885b76c95ec9e2b47663022d552d780200f", // Old WrappedETH
  "0x503e16b7920420277ce1548444dbb30e97f87d40", // WrappedUSDC v2
  "0x3696a9a8ecd0dbd7111dd15f7837d7f38d83a0c0", // WrappedETH v3
  "0x7890673c207a728ef7d9378c7206030749351dad", // WrappedETH v3
  "0x4b3dd819cfbf1364cabd5c8f9c5c05917d09168c", // WrappedUSDC v2
  "0x421583e66b21de780b4f94fcecce858c07f3d2d9", // WrappedETH v3
  "0x0125c55244724c1bf1d16b91e046fe7e8a5719e2", // WrappedUSDC v2
  "0x8d0419e8a259366516fc4fbabebdc013cad8770f", // WrappedETH_V3 (plaintext leak)
  "0x2210264a3775d5fbc51b1b73667f5590230ac2bd"  // WrappedUSDC_V2 (plaintext leak)
];
```

---

## 8. Vite Konfigürasyonu (WASM Desteği)

### 8.1 Dosya: `vite.config.js`

cofhejs TFHE WASM dosyası gerektirir. Vite bunu doğru şekilde sunmalıdır:

```javascript
import wasmPlugin from '@rollup/plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    
    // WASM dosyasını doğru MIME type ile sun
    {
      name: 'serve-tfhe-wasm',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.endsWith('tfhe_bg.wasm')) {
            const wasmPath = path.resolve(__dirname, 'node_modules/tfhe/tfhe_bg.wasm');
            if (fs.existsSync(wasmPath)) {
              res.setHeader('Content-Type', 'application/wasm');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              const wasmFile = fs.readFileSync(wasmPath);
              res.end(wasmFile);
              return;
            }
          }
          next();
        });
      }
    },
    
    wasmPlugin({
      targetEnv: 'browser',
      maxFileSize: 10000000 // 10MB — TFHE WASM büyük dosya
    }),
    
    topLevelAwait(), // WASM init top-level await gerektirir
    
    nodePolyfills({
      protocolImports: true,
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  
  assetsInclude: ['**/*.wasm'],
  
  optimizeDeps: {
    include: ['tweetnacl'],
    exclude: ['tfhe'], // tfhe'yi optimize etme — WASM bozulur
    esbuildOptions: { target: 'esnext' }
  },
  
  build: {
    target: 'esnext', // Top-level await için gerekli
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'ethers', 'antd'],
        },
      },
    }
  },
});
```

### 8.2 WASM Dosyası Kopyalama

Build için WASM dosyası public klasörüne kopyalanmalı:

```bash
cp node_modules/tfhe/tfhe_bg.wasm public/tfhe_bg.wasm
```

---

## 9. Deploy Sistemi (Hardhat)

### 9.1 Yapı

```
deploy/
├── contracts/          ← Solidity dosyaları buraya kopyalanır
├── scripts/
│   └── deploy-all.js   ← Deploy scripti
├── hardhat.config.js   ← Hardhat ayarları
├── package.json        ← Hardhat bağımlılıkları
└── artifacts/          ← Derleme çıktıları (otomatik)
```

### 9.2 hardhat.config.js

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" }); // Üst dizindeki .env'yi oku

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x000...001";

module.exports = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",  // ÖNEMLİ: cancun gerekli
    },
  },
  networks: {
    sepolia: {
      url: process.env.VITE_ALCHEMY_SEPOLIA_API_KEY, // Alchemy RPC URL
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 11155111,
    },
  },
};
```

### 9.3 deploy-all.js

```javascript
const hre = require("hardhat");

async function main() {
  const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"; // Sepolia WETH
  const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia USDC

  // Deploy WrappedETH_V4
  const WrappedETH = await hre.ethers.getContractFactory("WrappedETH_V4");
  const wrappedETH = await WrappedETH.deploy(WETH_ADDRESS);
  await wrappedETH.waitForDeployment();
  console.log("cETH:", await wrappedETH.getAddress());

  // Deploy WrappedUSDC_V3
  const WrappedUSDC = await hre.ethers.getContractFactory("WrappedUSDC_V3");
  const wrappedUSDC = await WrappedUSDC.deploy(USDC_ADDRESS);
  await wrappedUSDC.waitForDeployment();
  console.log("cUSDC:", await wrappedUSDC.getAddress());
}

main().then(() => process.exit(0)).catch(console.error);
```

### 9.4 Deploy Komutları

```bash
# 1. deploy dizinine gir
cd deploy

# 2. Bağımlılıkları kur (ilk seferde)
npm install

# 3. Kontratları derle
npx hardhat compile

# 4. Sepolia'ya deploy et
npx hardhat run scripts/deploy-all.js --network sepolia

# 5. Çıktıdaki adresleri .env'ye yaz
# VITE_WRAPPED_ETH_ADDRESS=0x...
# VITE_WRAPPED_USDC_ADDRESS=0x...
```

---

## 10. .env Dosyası

```env
# Alchemy RPC URL (API key dahil)
VITE_ALCHEMY_SEPOLIA_API_KEY=https://eth-sepolia.g.alchemy.com/v2/QiGPOtyhV0PYWaqrD8XiJ

# Deployer private key (Sepolia için — MAINNET'TE KULLANMA!)
DEPLOYER_PRIVATE_KEY=0x04d47eea754ffd91b7369c312dc5afcd2e904214c5faf442006e24baef186880

# Kontrat adresleri (deploy sonrası güncellenir)
VITE_WRAPPED_ETH_ADDRESS=0x5396BC5ED8754A9E8c703021288Fc07D1d91B99d
VITE_WRAPPED_USDC_ADDRESS=0x98271a408126bB7e0Bc2Af8D78a063FeaA642F13
```

> **ÖNEMLİ**: `VITE_` prefix'li değişkenler Vite tarafından frontend'e inject edilir.
> `DEPLOYER_PRIVATE_KEY` sadece Hardhat tarafından kullanılır.

---

## 11. Sıfırdan Kurulum Adımları

### Adım 1: Proje Bağımlılıkları

```bash
# Ana proje
cd ArfheWallet
pnpm install  # veya npm install

# Deploy projesi
cd deploy
npm install
```

### Adım 2: WASM Dosyasını Kopyala

```bash
cp node_modules/tfhe/tfhe_bg.wasm public/tfhe_bg.wasm
```

### Adım 3: Kontratları Yaz

`deploy/contracts/` altına kontrat dosyalarını koy:
- `WrappedETH_V4.sol`
- `WrappedUSDC_V3.sol`

Ayrıca `contracts/` ana dizinine de kopyala (referans için).

### Adım 4: Kontratları Derle

```bash
cd deploy
npx hardhat compile
# Çıktı: "Compiled 2 Solidity files successfully (evm target: cancun)"
```

### Adım 5: Deploy Et

```bash
cd deploy
npx hardhat run scripts/deploy-all.js --network sepolia
```

Çıktı:
```
Deploying contracts with account: 0x46b931dFd36344EA1B7Ad6dB51850b3FA23778C8
✅ WrappedETH_V4 deployed to: 0x5396BC5ED8754A9E8c703021288Fc07D1d91B99d
✅ WrappedUSDC_V3 deployed to: 0x98271a408126bB7e0Bc2Af8D78a063FeaA642F13
```

### Adım 6: .env Güncelle

Deploy çıktısındaki adresleri `.env` dosyasına yaz.

### Adım 7: Frontend Build & Test

```bash
cd ArfheWallet
npx vite build    # Production build
npm run dev       # Dev server
```

---

## 12. FHE Akış Şeması

### 12.1 Wrap (ETH → cETH)

```
Kullanıcı "Wrap 0.001 ETH" der
    │
    ▼
Network.wrapETH()
    │
    ├── iface.encodeFunctionData("wrapETH", [])
    ├── sendTransaction({ value: "0.001", data })
    │
    ▼
WrappedETH_V4.wrapETH() [on-chain]
    │
    ├── weth.deposit{value: msg.value}()        ← ETH → WETH
    ├── FHE.asEuint64(uint64(msg.value))        ← Plaintext → Encrypted
    ├── FHE.add(balance, encAmount)             ← Şifreli toplama
    ├── FHE.allowThis(balance)                  ← Kontrat erişimi
    ├── FHE.allow(balance, msg.sender)          ← Kullanıcı unseal izni
    └── emit Wrapped(msg.sender)                ← Miktar YOK
```

### 12.2 Transfer (Gizli)

```
Kullanıcı "Send 0.0001 cETH to 0x82E2..." der
    │
    ▼
Network.transferConfidential()
    │
    ├── FheCofheService.isReadyForAccount(sender)  ← Hesap kontrolü
    ├── FheCofheService.encrypt(BigInt(amountWei))  ← cofhejs WASM şifreleme
    │       └── cofhejs.encrypt([Encryptable.uint64(value)])
    │       └── Returns: { ctHash, securityZone, utype, signature }
    │
    ├── iface.encodeFunctionData("transferEncrypted", [to, inEuint64])
    ├── sendTransaction({ data, gasLimit: 3000000n })
    │
    ▼
WrappedETH_V4.transferEncrypted() [on-chain]
    │
    ├── FHE.asEuint64(encryptedAmount)          ← InEuint64 → euint64
    ├── FHE.sub(sender.balance, amount)         ← Şifreli çıkarma
    ├── FHE.add(receiver.balance, amount)       ← Şifreli toplama
    ├── FHE.allowThis() + FHE.allow()           ← İzinler
    └── emit ConfidentialTransfer(from, to)     ← Miktar YOK!
```

### 12.3 Bakiye Sorgulama (Unseal)

```
Home.tsx yüklenir → fetchData()
    │
    ▼
Network.getShieldedBalance()
    │
    ├── FheCofheService.isReadyForAccount(address)
    │       └── Değilse: init(provider, wallet)
    │
    ├── eth_call: confidentialBalanceOf(address)
    │       └── Returns: uint256 handle (şifreli bakiye kimliği)
    │
    ├── handle === 0n ? → return "0.0"  ← UNSEAL YAPMA!
    │
    ├── FheCofheService.unseal(handle)
    │       ├── cofhejs.unseal(ctHash, FheTypes.Uint64)
    │       │       └── CoFHE sealoutput endpoint → sealed data → unseal
    │       └── Fallback: manualUnseal(ctHash)
    │
    └── formatTokenAmount(decrypted, decimals)
            └── cETH: 18, cUSDC: 6
```

---

## 13. Karşılaşılan Hatalar ve Çözümleri

### 13.1 InvalidSigner Hatası

**Belirti**: `transferEncrypted` tx revert eder, TaskManager `InvalidSigner` döner.

**Sebep**: cofhejs bir hesap (A) ile initialize edilmiş ama tx başka hesap (B) ile gönderiliyor.
cofhejs verifier hash'i A'nın adresi ile hesaplar, TaskManager B'yi (msg.sender) doğrular → uyuşmaz.

**Çözüm**: `isReadyForAccount(address)` ile hesap kontrolü. Farklı hesap ise `reset()` + tekrar `init()`.

### 13.2 Sealoutput 403 Hatası

**Belirti**: `getShieldedBalance` çağrılınca `unseal` 403 döner.

**Sebep**: `confidentialBalanceOf` handle=0 döner (kullanıcının şifreli bakiyesi yok).
Handle 0 CoFHE sealoutput endpoint'ine gönderilince "sealed data not found" → 403.

**Çözüm**: Handle=0 kontrolü eklendi:
```typescript
if (handle === BigInt(0)) {
  return "0.0"; // Unseal yapma
}
```

### 13.3 Plaintext Leak (Miktar Sızıntısı)

**Belirti**: Etherscan'de transfer miktarı "For 0.0001 cETH" olarak görünür.

**Sebep**: ERC20 `Transfer(from, to, amount)` eventi miktar içerir.
Eski kontratlar `is ERC20` kullandığı için `_transfer()` çağrısı bu eventi yayınlar.

**Çözüm**: ERC20 mirası tamamen kaldırıldı. V4 kontratları:
- `Transfer` eventi → `ConfidentialTransfer(from, to)` (data: 0x)
- `plaintextAmount` parametresi → kaldırıldı
- `_mint`, `_burn`, `_transfer` → kaldırıldı

### 13.4 WASM Yüklenme Hatası

**Belirti**: `TfheCompactPublicKey.deserialize()` crash eder.

**Sebep**: cofhejs `initialize()` çağrılırken `ignoreErrors: true` kullanılmış,
WASM (tfhe) initialization atlanmış.

**Çözüm**: `ignoreErrors` kullanMA veya `false` yap:
```typescript
await initialize({
  provider, signer,
  environment: "TESTNET",
  generatePermit: false,
  // ignoreErrors: true ← BUNU YAPMA!
});
```

### 13.5 viem Adapter Hatası

**Belirti**: `cofhejs.initialize()` çağrılınca "An internal error occurred".

**Sebep**: cofhejs üst seviye `cofhejs.initialize()` fonksiyonu viem adapter
kullanıyor. ethers nesneleri gönderilince `viemProviderSignerTransformer` hata verir.

**Çözüm**: Üst seviye `cofhejs.initialize()` yerine alt seviye `initialize()` kullan:
```typescript
import { initialize } from "cofhejs/web"; // cofhejs değil!
await initialize({ provider: abstractProvider, signer: abstractSigner, ... });
```

---

## 14. Önemli Kurallar ve Uyarılar

### ❗ ASLA Yapma:
1. **ERC20 miras alma** — Transfer eventi miktarı sızdırır
2. **`plainTextAmount` parametresi** — Calldata'da plaintext görünür
3. **`cofhejs.initialize()` kullan** — Alt seviye `initialize()` kullan
4. **`ignoreErrors: true`** — WASM init atlanır, crash olur
5. **Handle=0'ı unseal etmeye çalış** — 403 döner
6. **Farklı hesapla TX gönder** — InvalidSigner hatası

### ✅ MUTLAKA Yap:
1. **`isReadyForAccount(address)` kontrol et** — Her FHE işleminden önce
2. **Abstract Provider/Signer oluştur** — ethers → cofhejs adaptörü
3. **`FHE.allowThis()` + `FHE.allow()`** — Her bakiye güncellemesinden sonra
4. **`Common.isInitialized()` kontrol et** — İlk kez bakiye set etmeden önce
5. **gasLimit: 3000000n** — FHE işlemleri çok gas yer
6. **`environment: "TESTNET"`** — Sepolia için
7. **WASM dosyasını public'e kopyala** — Build için gerekli
8. **`evmVersion: "cancun"`** — Hardhat config'de

### 🔑 Anahtar Bilgiler:
- **Sepolia Chain ID**: 11155111
- **TaskManager**: `0xeA30c4B8b44078Bbf8a6ef5b9f1ec1626C7848D9`
- **CoFHE Threshold Network**: `https://testnet-cofhe-tn.fhenix.zone`
- **Sealoutput Endpoint**: `https://testnet-cofhe-tn.fhenix.zone/sealoutput`
- **Sepolia WETH**: `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`
- **Sepolia USDC**: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- **Deployer Address**: `0x46b931dFd36344EA1B7Ad6dB51850b3FA23778C8`

---

## 15. Mevcut Deploy Adresleri

### Aktif Kontratlar (V4/V3 — ŞU AN KULLANILAN)
| Token | Kontrat | Adres |
|-------|---------|-------|
| cETH | WrappedETH_V4 | `0x5396BC5ED8754A9E8c703021288Fc07D1d91B99d` |
| cUSDC | WrappedUSDC_V3 | `0x98271a408126bB7e0Bc2Af8D78a063FeaA642F13` |

### Eski Kontratlar (KULLANILMIYOR)
| Versiyon | Sorun | cETH | cUSDC |
|----------|-------|------|-------|
| V3/V2 | Plaintext leak (Transfer eventi) | `0x8D0419E8...` | `0x2210264a...` |
| V3/V2 | ERC20 sync yok | `0x421583e6...` | `0x0125c552...` |
| V3/V2 | Başka sync sorunu | `0x7890673c...` | `0x4b3dd819...` |
| V3/V2 | İlk denemeler | `0x3696a9a8...` | `0x503e16b7...` |
| V1 | FHE yok | `0x23bad885...` | `0x730bb4ee...` |
| Pre-V1 | Mock FHE | `0x5c3f1fe2...` | `0x6ab305c6...` |

---

## 16. Doğrulama Checklist'i

Yeni bir FHE deploy'ından sonra kontrol et:

- [ ] `npx hardhat compile` → "Compiled successfully"
- [ ] Deploy TX success (status: 1)
- [ ] `.env` adresleri güncellendi
- [ ] `npx vite build` → Hata yok
- [ ] Wrap işlemi çalışıyor
- [ ] `getShieldedBalance` doğru bakiye döner
- [ ] Handle=0 durumunda 403 hatası YOK
- [ ] `transferEncrypted` TX success
- [ ] Etherscan'de Transfer event'inde miktar GÖRÜNMİYOR
- [ ] ConfidentialTransfer event'i data=0x (boş)
- [ ] Calldata'da plaintext miktar YOK
- [ ] Hesap değiştirince yeni hesap için init çalışıyor
- [ ] Alıcı tarafta bakiye doğru güncelleniyor

---

> **Son Güncelleme**: 8 Şubat 2026
> **Durum**: ✅ Tüm FHE sistemi çalışıyor, gerçek gizli transfer doğrulandı
> **Test TX**: `0xfe88feb22de3da49061709f560c2b151893c25317d2a46a765b6fd590d924333`
