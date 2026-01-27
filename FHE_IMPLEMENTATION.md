# 🛡️ FHE (Fully Homomorphic Encryption) Implementation - ArfheWallet

## 📋 Genel Bakış

ArfheWallet, **Fhenix'in CoFHE kütüphanesi** kullanılarak **Fully Homomorphic Encryption (FHE)** teknolojisini entegre eder. Bu sayede token transferleri ve bakiyeleri blockchain üzerinde **şifreli** kalır ve kimse gerçek miktarları okuyamaz.

---

## 🏗️ Sistem Mimarisi

### 1. **FheService.ts** - Core FHE Engine
**Konum:** `/src/backend/FheService.ts`

#### Özellikler:
- ✅ **Encryption (Şifreleme):** Token miktarlarını blockchain'e göndermeden önce şifreler
- ✅ **Unsealing (Şifre Çözme):** Blockchain'den dönen şifreli veriyi kullanıcının özel anahtarıyla çözer
- ✅ **Permit Management:** Kullanıcı kimlik doğrulaması için permit oluşturur ve cache'ler
- ✅ **Auto-initialization:** İlk kullanımda otomatik olarak başlatılır

#### Kullanım Örneği:
```typescript
// Initialize
await FheService.getInstance().init(provider, signer);

// Encrypt
const encrypted = await FheService.getInstance().encrypt("1000000000000000000", "uint64");

// Unseal
const decrypted = await FheService.getInstance().unseal(handle, userAddress, contractAddress, "uint64");
```

---

### 2. **Network.ts** - Blockchain Operations
**Konum:** `/src/backend/Network.ts`

#### Yeni Metodlar:

##### `getShieldedBalance(contractAddress, userAddress)`
- eToken (şifreli token) bakiyesini getirir
- FHE ile şifreli veriyi çözer
- Otomatik permit yönetimi

##### `wrap(account, publicToken, shieldedToken, amount)`
- Public token'ları eToken'a dönüştürür (Shield)
- ETH -> eETH, USDC -> eUSDC
- Otomatik approve işlemi

##### `unwrap(account, shieldedToken, amount)`
- eToken'ları public token'a geri çevirir (Unshield)
- Miktar FHE ile şifrelenir
- Yüksek gas limit (3M) kullanır

##### `transferConfidential(account, shieldedToken, to, amount)`
- **Gizli transfer** gerçekleştirir
- Miktar blockchain'de **okunamaz**
- FHE encryption kullanır

---

### 3. **Home.tsx** - UI Display
**Konum:** `/src/pages/Home.tsx`

#### Özellikler:
- ✅ eToken balance'larını gösterir (eETH, eUSDC)
- ✅ Shield badge ile private token'ları işaretler
- ✅ Otomatik cache yönetimi
- ✅ Sepolia network'te çalışır

#### Görünüm:
```
Assets
┌─────────────────────────────────────┐
│ 🔵 ETH     Ethereum                 │
│            0.1234 ETH    $234.56    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 🟣 eETH 🛡️Private  Encrypted Ethereum│
│            0.0500 eETH   $0.00      │
└─────────────────────────────────────┘
```

---

### 4. **ArfBottomMenu.tsx** - User Actions
**Konum:** `/src/components/ArfBottomMenu.tsx`

#### Shield Panel (Tab 4)
**İşlevler:**
1. **Shield (Wrap):** Public token -> eToken
2. **Unshield (Unwrap):** eToken -> Public token

**Desteklenen Tokenlar:**
- ETH ↔ eETH
- USDC ↔ eUSDC

#### Send Panel (Tab 1)
**Confidential Mode:**
- Toggle ile şifreli transfer aktif edilir
- eToken'lar ile gönderim yapılır
- Miktar blockchain'de okunamaz

---

## 🔐 Güvenlik

### FHE Nasıl Çalışır?

1. **Encryption (Client-side)**
   ```
   Amount: 1 ETH
   ↓ (FHE Encrypt)
   Ciphertext: 0x7a3b4f9e...
   ```

2. **On-chain Storage**
   ```
   Blockchain stores: euint64 (encrypted)
   Nobody can read the actual value
   ```

3. **Unsealing (Client-side with Permit)**
   ```
   Permit (Signed by User)
   ↓
   Decrypt with Private Key
   ↓
   Result: 1 ETH
   ```

### Permit Sistemi
- Her contract için **ayrı permit**
- **24 saat** geçerlilik
- **EIP-712** imzası ile doğrulama
- Local storage'da **cache**

---

## 📦 Contract Adresleri (Sepolia Testnet)

```javascript
const CONTRACTS = {
  ETH: {
    public: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    shielded: "0xfff9976742d46cc05630d1f6ebab18b2324d6b14" // eETH
  },
  USDC: {
    public: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    shielded: "0x2035f9228e160243be8e07973715c929845e445e" // eUSDC
  }
};
```

---

## 🚀 Kullanım Akışı

### 1. Shield (Wrap) İşlemi
```
User: "I want to shield 0.1 ETH"
↓
App: Wrap(0.1 ETH) → eETH Contract
↓
Tx: deposit(0.1 ETH) payable
↓
Result: User now has 0.1 eETH (encrypted balance)
```

### 2. Confidential Transfer
```
User: "Send 0.05 eETH to 0xABC..."
↓
App: FHE.encrypt(0.05 ETH) → ciphertext
↓
Tx: eETH.transfer(0xABC..., ciphertext)
↓
Blockchain: euint64 stored (unreadable)
↓
Recipient: Can unseal with their permit
```

### 3. Unshield (Unwrap) İşlemi
```
User: "Unwrap 0.05 eETH back to ETH"
↓
App: FHE.encrypt(0.05 ETH) → ciphertext
↓
Tx: eETH.unwrap(ciphertext)
↓
Result: User receives 0.05 ETH (public)
```

---

## 🧪 Test Senaryosu

### Adım 1: Shield
1. ArfheWallet'ı aç
2. Sepolia network'e geç
3. Bottom menu → **Shield** tab
4. Amount: `0.1`, Token: `ETH`
5. **"🔒 Shield Assets"** butonuna tıkla
6. Wallet'ta **2 işlem** onayla (Wrap işlemi)
7. Home'da `eETH` bakiyeni gör (🛡️ Private badge ile)

### Adım 2: Confidential Transfer
1. Bottom menu → **Send** tab
2. **"Enable Confidential"** toggle'ı aç
3. Recipient: `0x...` (test adresi)
4. Amount: `0.05`, Asset: `ETH (eETH)`
5. **"Send Confidential"** butonuna tıkla
6. Wallet'ta onayla
7. Tx hash'i explorer'da kontrol et → **Amount görünmez!**

### Adım 3: Unshield
1. Bottom menu → **Shield** tab
2. **"🔓 Unshield"** moduna geç
3. Amount: `0.05`, Token: `ETH`
4. **"🔓 Unshield Assets"** butonuna tıkla
5. Home'da ETH bakiyeni kontrol et

---

## ⚠️ Önemli Notlar - GÜNCELLENMIŞ

1. **Sadece Sepolia Testnet**
   - FHE işlemleri şu anda sadece Sepolia'da çalışır
   - Mainnet desteği için Fhenix Mainnet gerekli

2. **Gas Kullanımı**
   - FHE işlemleri **yüksek gas** kullanır (3M limit)
   - Shield/Unshield: ~500K gas
   - Confidential Transfer: ~2M gas

3. **Initialization**
   - FHE Service ilk kullanımda **40 saniye** kadar sürebilir
   - Keys yüklenmesini bekler
   - Hata durumunda tekrar dene

4. **Permit Yönetimi**
   - Her contract için **bir kere** permit imzala
   - 24 saat geçerli
   - Cache'lenmiş permit varsa tekrar sormaz

5. **ABI Format - KRİTİK**
   - ⚠️ Fhenix custom types (`euint64`, `inEuint64`) **Ethers.js tarafından desteklenmiyor**
   - ✅ Çözüm: **bytes** tipini kullan
   - Contract'ta `function transfer(address, inEuint64)` olsa bile
   - ABI'da `function transfer(address, bytes)` yaz
   - Şifrelenmiş veri zaten bytes formatında

### Doğru ABI Kullanımı

```typescript
// ❌ YANLIŞ - Ethers.js custom type'ı tanımıyor
const iface = new Interface([
  "function transfer(address to, inEuint64 encryptedAmount)"
]);

// ✅ DOĞRU - bytes kullan
const iface = new Interface([
  "function transfer(address to, bytes encryptedAmount)"
]);
```

---

## 🐛 Hata Ayıklama - GÜNCELLENMIŞ

### "FHE Service not ready"
```bash
# Console'da kontrol et:
FheService.getInstance().isReady()  // false ise

# Çözüm: Manuel init
await FheService.getInstance().init(provider, signer)
```

### "Encryption failed"
```bash
# Value formatını kontrol et
await FheService.getInstance().encrypt("1000000000000000000", "uint64")
# ✅ String, BigInt veya Number
```

### "Unseal returns null"
```bash
# Permit kontrolü
const permit = await FheService.getInstance().createPermit(contract, user)
console.log(permit)  // null olmamalı
```

### "Invalid Fragment: expected TYPE; got ID 'inEuint64'" ✅ ÇÖZÜLDÜ
```bash
# HATA MESAJI:
TypeError: unknown function (argument="fragment", value="transfer", 
code=INVALID_ARGUMENT, version=6.13.5)

# SEBEP:
Ethers.js, Fhenix'in custom types'larını tanımıyor (euint64, inEuint64, etc.)

# ÇÖZÜM:
// Contract'ta ne olursa olsun, ABI'da BYTES kullan
const iface = new Interface([
  "function transfer(address to, bytes calldata encryptedAmount)"
]);

// Şifrelenmiş veri zaten bytes formatında geliyor
const encrypted = await FheService.getInstance().encrypt(amount, "uint64");
// encrypted = "0x..." (bytes string)
```

### "API 400 Bad Request" ✅ ÇÖZÜLDÜ
```bash
# HATA:
GET /api/coingecko/simple/token_price/ethereum?contract_addresses=0xfff...

# SEBEP:
eToken adresleri CoinGecko'da yok (testnet contract'ları)

# ÇÖZÜM:
Network.ts'de eToken adresleri filtreleniyor:
const eTokenAddresses = [
  "0xfff9976742d46cc05630d1f6ebab18b2324d6b14", // eETH
  "0x2035f9228e160243be8e07973715c929845e445e"  // eUSDC
];
```

---

## 📚 Kaynaklar

- **CoFHE Docs:** https://cofhe-docs.fhenix.zone
- **Encryption Guide:** https://cofhe-docs.fhenix.zone/cofhejs/guides/encryption
- **Permits:** https://cofhe-docs.fhenix.zone/cofhejs/guides/permits-management
- **Unsealing:** https://cofhe-docs.fhenix.zone/cofhejs/guides/sealing-unsealing

---

## ✅ Tamamlanan Özellikler

- [x] FheService.ts tam implementasyonu
- [x] Encryption/Unsealing metodları
- [x] Permit cache sistemi
- [x] Network.ts wrap/unwrap/transferConfidential
- [x] Home.tsx eToken balance gösterimi
- [x] Shield badge UI
- [x] ArfBottomMenu Shield paneli
- [x] Confidential transfer toggle
- [x] Auto FHE initialization
- [x] Error handling ve UI feedback
- [x] TypeScript type safety

---

## 🎯 Sonraki Adımlar (Opsiyonel)

1. **Mainnet Desteği**
   - Fhenix Mainnet contract'ları ekle
   - Multi-network FHE desteği

2. **İleri Özellikler**
   - eToken swap işlemleri
   - Batch confidential transfers
   - Permit sharing (başkasına erişim verme)

3. **Optimizasyon**
   - FHE key cache'i iyileştir
   - Gas estimation accuracy
   - Loading state iyileştirmeleri

---

**🎉 Artık ArfheWallet tam FHE desteğine sahip!**

Tüm token işlemleriniz blockchain üzerinde **şifreli** kalıyor. Kimse bakiyenizi veya transfer miktarlarınızı okuyamıyor. 🔐
