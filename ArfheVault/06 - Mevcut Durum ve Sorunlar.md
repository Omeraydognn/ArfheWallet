# 🐛 Mevcut Durum ve Sorunlar

## Genel Durum Özeti

| Alan | Durum | Öncelik |
|------|-------|---------|
| SOL/SPL Transfer (Solana) | ✅ Çalışıyor | — |
| EVM FHE (Fhenix/cofhejs) | ✅ Çalışıyor | — |
| IKA dWallet DKG | ✅ Gerçek SDK flow (testnet token gerekli) | — |
| Encrypt.xyz Vault Kontrat | ❌ Deploy yok | 🔴 Kritik |
| Gizli Transfer (Solana FHE) | ❌ Dummy TX | 🔴 Kritik |
| IKA Cross-Chain Signing | ⚠️ Presign yapısı hazır, sign completion eksik | 🟡 Orta |
| IkaDashboard UI | ✅ 3 fazlı wallet UI (Setup/Creating/Active) | — |
| Privacy sayfası (Solana) | ⚠️ "Coming Soon" gösteriyor | 🟡 Orta |

---

## Sorun 1: IKA WASM Yükleme Hatası 🔴

### Belirti
`IkaService.initializeIkaClient()` çağrıldığında:
```
Error: Failed to fetch/load WASM module
```
veya IKA initialize başarısız, `createArfheDWallet()` mock DKG'ye düşüyor.

### Neden Oluyor
Chrome extension'da `chrome-extension://` protokolü, normal `https://` ile aynı şekilde WASM fetch yapmıyor. IKA SDK'nın içindeki WASM dosyaları (`dwallet_mpc_wasm_bg.wasm`) doğru path'ten yüklenemiyor.

### Mevcut Durum (2026-05-11 itibarıyla)
Mock DKG ve fetch wrapper tamamen kaldırıldı. `IkaService.ts` artık sadece gerçek SDK akışını kullanıyor. WASM sorununu aşmak için WASM bundler target otomatik çözüyor (Vite build'de `dwallet_mpc_wasm_bg.wasm` dist'e kopyalanıyor).

---

### ✅ 2026-05-11 — IKA DKG "Submitting" Hatası Düzeltildi
**Ne yapıldı:** `createDWallet` içindeki `transferObjects([ikaCoin, suiCoin, dWalletCapArg], ...)` çağrısındaki kritik hata düzeltildi. `ikaCoin` ve `suiCoin` `requestDWalletDKG` tarafından fee olarak tüketilir; tekrar transfer edilemez. Sadece `[dWalletCapArg]` transfer ediliyor. `registerUserShareEncryptionKey` ön-kaydı sırası da düzeltildi (prepareDKGAsync'ten önce çalışıyor, wait 5 saniyeye çıkarıldı). Silinen `splitCoin` yardımcı fonksiyonu geri eklendi.  
**Dosyalar:** `src/backend/IkaService.ts`  
**Agent:** Claude  
**Notlar:** Hata "Ika ağına gönderiliyor" aşamasında Sui PTB çift-kullanım (double-use) hatasıydı.

---

### ✅ 2026-05-11 — IKA dWallet Sıfırdan Yazıldı
**Ne yapıldı:** IkaService mock DKG/signing tamamen silindi. Gerçek SDK akışı (prepareDKGAsync → requestDWalletDKG → getDWalletInParticularState) korunarak temizlendi. DKGProgress callback eklendi. getSolanaBalance() eklendi. IkaDashboard 3 fazlı wallet UI olarak yeniden yazıldı (Setup/Creating/Active). Home.tsx'teki inline mock dWallet butonu kaldırıldı.  
**Dosyalar:** `src/backend/IkaService.ts`, `src/pages/IkaDashboard.tsx`, `src/pages/Home.tsx`  
**Agent:** Claude  
**Notlar:** Gerçek DKG için kullanıcının Sui testnet adresine SUI + IKA token göndermesi gerekiyor. Sui faucet: https://faucet.testnet.sui.io — IKA: Discord faucet.

### ✅ 2026-05-11 — IKA DKG `sessions_manager::initiate_user_session` Abort Code 1 Düzeltildi
**Ne yapıldı:** `sessions_manager::initiate_user_session` abort code 1 hatası düzeltildi. Sorun: `registerSessionIdentifierTx` ayrı bir TX'te çalışıyor, DKG PTB ayrı TX'te; bu iki TX arasında sessions manager epoch lock'a girebiliyordu. Fix: Her iki işlem tek bir PTB'ye taşındı. `ikaTx.registerSessionIdentifier(sessionIdentifier)` DKG PTB içinden çağrılıyor; dönen `TransactionResult` doğrudan `requestDWalletDKG`'ye `sessionIdentifier` olarak geçiriliyor. `registerSessionIdentifierTx` private metodu silindi.
**Dosyalar:** `src/backend/IkaService.ts`
**Agent:** Claude
**Notlar:** SDK README'deki örnek de bu single-PTB yaklaşımını gösteriyor (`ikaTx.createSessionIdentifier()` + `requestDWalletDKG` aynı TX). Önceki iki-transaction yaklaşımı hem gereksiz hem de race-prone'du.

---

### ✅ 2026-05-11 — IKA DKG `SessionIdentifier` Ownership Sorunu Düzeltildi (3 Hata, 3 Fix)
**Ne yapıldı:** Üç ardışık PTB hatası tespit edilip çözüldü:
1. **Error 1** (`InvalidUsageOfPureArg arg_idx:9`): `sessionIdentifier` pure bytes olarak geçiriliyordu; Move contract `SessionIdentifier` objesi bekliyor. Fix: `ikaTx.registerSessionIdentifier(bytes)` ile PTB içinde `TransactionObjectArgument` yaratıldı.
2. **Error 2** (`MoveAbort abort_code:1 in initiate_user_session`): Transient testnet sorunu (epoch lock) gibi görünüyor; aslında `register_session_identifier` `initiate_user_session` çağırmaz, sadece `SessionIdentifier` nesnesi yaratır. `request_dwallet_dkg` onu consume eder.
3. **Error 3** (`Object 0xaa3e... is owned by object 0x93cb...`): Coordinator-owned nesne PTB input olarak kullanılamıyor. Fix: `registerSessionIdentifierTx` ayrı bir TX'te çalıştırılır; `transferObjects([sessionArg], signer)` ile signer'a aktarılır; ardından `changedObjects` içinden `AddressOwner === signerAddress` olan `Created` nesne ID'si alınır ve DKG PTB'de `transaction.object(sessionObjectId)` olarak kullanılır.
**Dosyalar:** `src/backend/IkaService.ts`  
**Agent:** Claude  
**Notlar:** On-chain analiz: `SessionIdentifier` `Key+Store` abilitiy, `request_dwallet_dkg` onu `by value` (consume) alıyor. Bekleme süresi 5 saniyeye çıkarıldı. TypeScript cast hatası `as unknown as Record<string, unknown>` ile düzeltildi.

---

## Sorun 2: IKA DKG — `acceptEncryptedUserShare` Eksik 🔴

### Belirti
`createDWallet()` başarıyla çalışsa bile, dWallet `AwaitingKeyHolderSignature` durumunda takılıp kalıyor.

### Neden Oluyor
DKG tamamlandıktan sonra `acceptEncryptedUserShare()` çağrılması gerekiyor. Bu adım yok:

```typescript
// MEVCUT DURUM - eksik adım:
const result = await suiClient.core.signAndExecuteTransaction({...});
const dWalletCap = await this.findNewDWalletCap(signerAddress, capIdsBefore);
// ❌ acceptEncryptedUserShare() HİÇ ÇAĞRILMIYOR
const dWallet = await ikaClient.getDWalletInParticularState(id, "Active");
// ↑ Bu timeout atar çünkü dWallet Active'e geçemiyor
```

### Çözüm
```typescript
// DKG'den sonra eklenmesi gereken:
const encryptedShareId = /* event'den al */;
const transaction2 = new Transaction();
const ikaTx2 = new IkaTransaction({ ikaClient, transaction: transaction2, userShareEncryptionKeys });
await ikaTx2.acceptEncryptedUserShare({
  dWallet: dWallet as ZeroTrustDWallet,
  encryptedUserSecretKeyShareId: encryptedShareId,
  userPublicOutput: new Uint8Array(dWallet.state.AwaitingKeyHolderSignature?.public_output),
});
await suiClient.core.signAndExecuteTransaction({ transaction: transaction2, signer });
```

---

## Sorun 3: Encrypt Vault Kontratı Compile Edilemiyor 🔴

### Belirti
`arfhe_confidential_vault/programs/arfhe_vault/src/lib.rs` dosyası:
```
use encrypt_macros::encrypt_fn;
use encrypt_types::EncryptedU64;
```
Bu import'lar çalışmıyor.

### Neden Oluyor
1. `Cargo.toml`'da `encrypt-macros` dependency'si yok (sadece `encrypt_fn` macro kullanılıyor)
2. `encrypt_types::EncryptedU64` — bu tip pre-alpha SDK'da farklı isimde olabilir
3. `encrypt_add` / `encrypt_sub` fonksiyonları placeholder — gerçek FHE CPI'si değil

### Doğru Cargo.toml
```toml
[dependencies]
anchor-lang = "0.32"
encrypt-types = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-dsl = { package = "encrypt-solana-dsl", git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-anchor = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
```

### Doğru Kullanım
```rust
use encrypt_dsl::prelude::*;
use encrypt_anchor::EncryptContext;

#[encrypt_fn]
fn confidential_transfer(from: EUint64, to: EUint64, amount: EUint64) -> (EUint64, EUint64) {
    let has_funds = from >= amount;
    let new_from = if has_funds { from - amount } else { from };
    let new_to = if has_funds { to + amount } else { to };
    (new_from, new_to)
}

// Anchor instruction içinde:
pub fn transfer_with_policy(ctx: Context<TransferWithPolicy>) -> Result<()> {
    let encrypt_ctx = EncryptContext { /* ... */ };
    encrypt_ctx.confidential_transfer(
        from_ct.to_account_info(),
        to_ct.to_account_info(),
        amount_ct.to_account_info(),
        new_from_ct.to_account_info(),
        new_to_ct.to_account_info(),
    )?;
    Ok(())
}
```

---

## Sorun 4: TypeScript Encrypt Client Bağlı Değil 🔴

### Belirti
`sendConfidentialPolicyTransfer()` içinde `@encrypt.xyz/pre-alpha-solana-client` paketi kullanılmıyor. Gerçek şifreli input oluşturulmuyor.

### Mevcut Durum
```typescript
// Sadece log mesajları ve dummy TX
console.log("🔐 Veriler Encrypt.xyz FHE ağına yollanıp şifreleniyor...");
await new Promise(r => setTimeout(r, 1500));  // Fake delay
```

### Ne Yapılmalı
```bash
bun add @encrypt.xyz/pre-alpha-solana-client
```

```typescript
import { createEncryptClient, Chain } from "@encrypt.xyz/pre-alpha-solana-client/grpc";

const client = createEncryptClient();
const networkKey = await fetchNetworkEncryptionKey();

const { ciphertextIdentifiers } = await client.createInput({
  chain: Chain.SOLANA,
  inputs: [{ ciphertextBytes: encryptedAmount, fheType: 4 }],  // EUint64 = 4
  proof: proofBytes,
  authorized: PROGRAM_ID.toBytes(),
  networkEncryptionPublicKey: networkKey,
});
```

---

## Sorun 5: IKA Signing — Presign Fetch Eksik 🔴

### Belirti
`signCrossChainTransaction()` içinde:
```typescript
// Step 2: Sign Message
// To strictly follow SDK, we would fetch the Presign object:
// const presign = await ikaClient.getPresignInParticularState(presignId, "Active");
// ... [YORUM SATIRI OLARAK KALDI]
return new Uint8Array(64).fill(1).map(() => Math.floor(Math.random() * 256));
```

### Çözüm Adımları
```typescript
// 1. Presign ID'yi event'den al
const presignEvents = result1.events?.filter(e => e.type.includes('Presign'));
const presignId = presignEvents?.[0]?.parsedJson?.presign_id;

// 2. Presign'ı bekle
const presign = await ikaClient.getPresignInParticularState(presignId, 'Completed');

// 3. Message approval
const messageApproval = ikaTx2.approveMessage({
  message,
  curve: Curve.ED25519,
  dWalletCap: dWallet.dwallet_cap_id,
  signatureAlgorithm: SignatureAlgorithm.EdDSA,
  hashScheme: Hash.SHA512,
});

// 4. Gerçek imza
const signId = await ikaTx2.requestSign({
  dWallet,
  hashScheme: Hash.SHA512,
  verifiedPresignCap: ikaTx2.verifyPresignCap({ presign }),
  presign,
  encryptedUserSecretKeyShare,
  message,
  signatureScheme: SignatureAlgorithm.EdDSA,
  ikaCoin, suiCoin, messageApproval,
});

const sig = await ikaClient.getSignInParticularState(signId, Curve.ED25519, SignatureAlgorithm.EdDSA, 'Completed');
return Uint8Array.from(sig.state.Completed.signature);
```

---

## Sorun 6: Privacy Sayfası Solana'yı Desteklemiyor 🟡

### Belirti
Solana Devnet ağına geçildiğinde Privacy sayfası "FHE Coming Soon" mesajı gösteriyor.

### Neden
```typescript
// Privacy.tsx içinde:
if (!showFhe || isSolana) {
  return <ComingSoon />;  // ← Solana için FHE engelleniyor
}
```

### Çözüm
Encrypt.xyz Solana desteği gerçek olunca bu kontrolü kaldır ve Solana için ayrı bir FHE UI hazırla (cofhejs değil, Encrypt.xyz client kullanacak).

---

## Sorun 7: Sui Testnet Funding Gerekliliği 🟡

### Belirti
Gerçek IKA dWallet oluşturmak için kullanıcının Sui testnet'te hem SUI hem IKA token'a ihtiyacı var.

### Mevcut Akış Sorunu
Extension, kullanıcının SUI adresi (signer) olmadan IKA işlemi yapamıyor. Şu anda bu adım kullanıcıya anlatılmıyor.

### Çözüm
1. IkaDashboard'a "Fund Your Sui Account" adımı ekle
2. Faucet linklerini göster: `https://discord.gg/ika` / Sui faucet
3. SUI ve IKA bakiyelerini dashboard'da göster

---

[[05 - Kod Haritası|← Kod Haritası]] | [[07 - IKA Entegrasyon Rehberi|→ IKA Rehberi]]
