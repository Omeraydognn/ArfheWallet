# 🔐 IKA dWallet Teknolojisi

## dWallet Nedir?

dWallet (decentralized wallet), özel anahtarın **hiçbir zaman tam olarak tek bir yerde bulunmadığı** bir cüzdandır. İki kriptografik parçadan oluşur:

- **User Share:** Kullanıcının cihazında, şifreli olarak saklanan pay
- **Network Share:** IKA ağının validatörlerinde dağıtık olarak saklanan pay

İmza atmak için **her iki tarafın katılımı gerekir** — 2PC-MPC (Two-Party Computation - Multi-Party Computation). Ne kullanıcı tek başına ne de IKA ağı tek başına imza atabilir.

---

## dWallet Türleri

### Zero-Trust dWallet (bizim kullandığımız)
- Kullanıcı kendi payını şifreli olarak alır ve saklar
- İmzalama için user share'i decrypt edip commitment mesajı üretir
- Network share ile birleştirilir
- **Güven modeli:** Kullanıcı anahtarına güvenir, ağ sadece 2. pay sağlar

### Shared dWallet
- User share ağa açılır (irreversible!)
- DAO'lar, akıllı kontratlar, otomatik sistemler için
- **Güven modeli:** Ağa tamamen güvenilir

---

## Solana Desteği

IKA'nın Solana Pre-Alpha'sı yeni çıktı. Solana için doğru kombinasyon:

| Parametre | Değer |
|-----------|-------|
| Curve | `Curve.ED25519` |
| Signature Algorithm | `SignatureAlgorithm.EdDSA` |
| Hash Scheme | `Hash.SHA512` |

```typescript
import { Curve, SignatureAlgorithm, Hash } from '@ika.xyz/sdk';

// Solana dWallet için
const curve = Curve.ED25519;
const sigAlgo = SignatureAlgorithm.EdDSA;
const hash = Hash.SHA512;
```

---

## DKG Akışı (Distributed Key Generation)

DKG, dWallet'ı oluşturmak için çalıştırılan protokoldür. Adımlar:

```
1. UserShareEncryptionKeys.fromRootSeedKey(seed, curve)
   → Kullanıcının şifreleme anahtarları üretilir

2. prepareDKGAsync(ikaClient, curve, userShareEncryptionKeys, identifier, signerAddress)
   → DKG input'u hazırlanır (kullanıcı tarafı hesaplamalar)

3. IkaTransaction.requestDWalletDKG({...})
   → Sui/IKA ağında transaction gönderilir
   → Network share üretilir
   → Encrypted user share oluşturulur

4. ikaClient.getDWalletInParticularState(id, "AwaitingKeyHolderSignature")
   → dWallet bekleme durumunda

5. IkaTransaction.acceptEncryptedUserShare({...})
   → Kullanıcı şifreli payını kabul eder
   → dWallet "Active" durumuna geçer

6. publicKeyFromDWalletOutput(curve, publicOutput)
   → Solana adresi türetilir
```

---

## İmzalama Akışı (Signing)

Mesaj imzalamak için 3 adım:

### 1. Presign (önce yapılır)
```typescript
ikaTx.requestPresign({
  dWallet,
  signatureAlgorithm: SignatureAlgorithm.EdDSA,
  ikaCoin,
  suiCoin
});
// Presign ID event'den alınır, cache'lenir
```

### 2. Message Approval
```typescript
const messageApproval = ikaTx.approveMessage({
  message: new TextEncoder().encode('tx_data'),
  curve: Curve.ED25519,
  dWalletCap: dWallet.dwallet_cap_id,
  signatureAlgorithm: SignatureAlgorithm.EdDSA,
  hashScheme: Hash.SHA512,
});
```

### 3. Sign
```typescript
const signId = await ikaTx.requestSign({
  dWallet,
  hashScheme: Hash.SHA512,
  verifiedPresignCap: ikaTx.verifyPresignCap({ presign }),
  presign,
  encryptedUserSecretKeyShare,
  message,
  signatureScheme: SignatureAlgorithm.EdDSA,
  ikaCoin,
  suiCoin,
  messageApproval,
});

// İmzayı bekle
const signature = await ikaClient.getSignInParticularState(
  signId, curve, SignatureAlgorithm.EdDSA, 'Completed'
);
```

---

## SDK Kurulumu

```bash
pnpm add @ika.xyz/sdk
```

### Gerekli Altyapı
- **Sui testnet** hesabı (SUI + IKA token gerekir)
- `SuiJsonRpcClient` — Sui RPC bağlantısı
- `IkaClient` — IKA ağı bağlantısı
- WASM dosyaları (SDK kendi pack ediyor)

### IkaClient Başlatma
```typescript
const suiClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl('testnet'),
  network: 'testnet',
});

const ikaClient = new IkaClient({
  suiClient,
  config: getNetworkConfig('testnet'),
  cache: true,
  encryptionKeyOptions: { autoDetect: true },
});

await ikaClient.initialize();
```

---

## Mevcut IkaService.ts Durumu

Dosya: `src/backend/IkaService.ts`

### Çalışan Metodlar ✅
- `initializeIkaClient()` — IkaClient başlatıyor (WASM sorunu var ama çözülmeye çalışılmış)
- `generateUserShareKeys()` — Ed25519 için UserShareEncryptionKeys üretiyor
- `getFundingStatus()` — Sui testnet'ten coin bakiyesi alıyor
- `createDWallet()` — Gerçek DKG transaction'ı göndermeye çalışıyor

### Çalışmayan / Mock Metodlar ❌
- `createArfheDWallet()` — IKA init başarısız olursa mock DKG'ye düşüyor
- `signCrossChainTransaction()` — Presign gönderiyor ama imzayı random byte ile doldurarak dönüyor
- `DKG.generate()` — Tamamen mock, random publicKey üretiyor

### WASM Problemi
IKA SDK browser'da WASM yüklerken sorun yaşıyor. `initializeIkaClient()` içinde custom fetch wrapper yazılmış ama bu yeterli değil. Chrome extension'da `chrome-extension://` protokolü WASM fetching'i farklı çalıştırıyor.

---

## Gerekli Ortam

IKA işlemleri için Sui testnet cüzdanı şart:
1. Sui testnet'te adres oluştur
2. SUI faucet'ten token al
3. IKA token al (Ika faucet / discord)
4. Bu adresi extension'da signer olarak kullan

---

[[00 - Ana Sayfa|← Ana Sayfa'ya Dön]] | [[03 - Encrypt.xyz FHE Teknolojisi|→ Encrypt.xyz]]
