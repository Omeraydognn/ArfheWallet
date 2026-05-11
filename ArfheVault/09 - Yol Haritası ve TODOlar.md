# 🗓️ Yol Haritası ve TODOlar

## Hackathon için Öncelikli Görevler

### 🔴 Kritik (Önce Bunlar)

#### 1. IKA WASM Sorunu Çöz
- [ ] Chrome extension'da `dwallet_mpc_wasm_bg.wasm` doğru yüklenmiyor
- [ ] `vite.config.js`'e IKA WASM için `assetsInlineLimit: 0` ekle
- [ ] `manifest.json`'a `web_accessible_resources` içine `assets/*.wasm` ekle
- [ ] Devtools Network sekmesinde hangi URL'den WASM yüklendiğini bul
- [ ] Alternatif: IKA SDK'yı node ortamında çalıştır (service worker'da)

#### 2. Encrypt Vault Kontratını Derle ve Deploy Et
- [ ] `arfhe_confidential_vault/Cargo.toml`'u doğru bağımlılıklarla güncelle
- [ ] `lib.rs`'yi `#[encrypt_fn]` DSL ile yeniden yaz
- [ ] `anchor build` ile derle
- [ ] `solana program deploy --url devnet` ile devnet'e yükle
- [ ] Program ID'yi `SolanaDevnet.ts` içinde güncelle

#### 3. TypeScript Encrypt Client Bağla
- [ ] `pnpm add @encrypt.xyz/pre-alpha-solana-client` ile paketi ekle
- [ ] `SolanaDevnet.ts` → `sendConfidentialPolicyTransfer()` metodunu gerçekleştir
- [ ] gRPC bağlantısını test et: `pre-alpha-dev-1.encrypt.ika-network.net:443`
- [ ] `createInput()` ile şifreli miktar oluştur

#### 4. IKA DKG `acceptEncryptedUserShare` Adımını Ekle
- [ ] `IkaService.createDWallet()` içine accept adımını ekle
- [ ] Event'den `encrypted_user_secret_key_share_id` çıkar
- [ ] `acceptEncryptedUserShare()` transaction'ını gönder
- [ ] dWallet'ın `Active` durumuna geçtiğini doğrula

#### 5. Gerçek IKA Signing Akışını Tamamla
- [ ] `signCrossChainTransaction()` içindeki mock kısmı kaldır
- [ ] Presign ID'yi event'den doğru parse et
- [ ] `getPresignInParticularState(presignId, 'Completed')` ekle
- [ ] Gerçek `requestSign()` transaction'ı gönder
- [ ] İmzayı `getSignInParticularState()` ile al ve döndür

---

### 🟡 Orta Öncelik

#### 6. Sui Signer Entegrasyonu
- [ ] Account.ts'e Sui keypair desteği ekle
- [ ] AccountManager'a Sui private key üretimi ekle (veya mnemonic'ten türet)
- [ ] IkaDashboard'a Sui adresi ve bakiye göster
- [ ] "Sui testnet fonla" butonu ve faucet linki ekle

#### 7. Privacy Sayfasını Solana için Güncelle
- [ ] `Privacy.tsx`'teki `isSolana` kontrolünü kaldır
- [ ] Solana devnet'te Encrypt.xyz FHE UI'ı göster
- [ ] "Gizli Bakiye" → Encrypt ciphertext okuma entegrasyonu
- [ ] "Gizli Gönder" → `sendConfidentialPolicyTransfer()` entegrasyonu

#### 8. IkaDashboard Geliştirmeleri
- [ ] dWallet durumunu göster (Active, Pending, Mock)
- [ ] dWallet adresiyle Solana bakiyesi sorgula ve göster
- [ ] "Bu dWallet ile Gönder" butonu ekle (IKA signing flow)
- [ ] Funding durumu: SUI ve IKA bakiyelerini göster

---

### 🟢 İkincil (Olsa Güzel)

#### 9. Presign Cache Sistemi
- [ ] Presign'ları önceden oluşturup cache'le (signing gecikmeyi azaltır)
- [ ] StorageManager'a presign cache ekle
- [ ] Arka planda otomatik presign yenileme

#### 10. UX İyileştirmeleri
- [ ] IKA işlemleri için progress bar (DKG ~30-60s sürebilir)
- [ ] Gizli transfer için "AI Policy Check" animasyonu
- [ ] dWallet oluştururken adım adım göster: DKG → Accept → Active
- [ ] "Gizli Bakiye Görüntüle" butonu (Encrypt ciphertext decrypt)

#### 11. Test Yazımı
- [ ] `IkaService.test.ts` unit testleri
- [ ] `SolanaDevnet.ts` mock FHE test
- [ ] Vault kontrat için `anchor test`

---

## Bağımlılık Güncellemeleri Gerekli

`package.json`'a eklenecekler:

```json
{
  "dependencies": {
    "@encrypt.xyz/pre-alpha-solana-client": "latest"
  }
}
```

`arfhe_confidential_vault/Cargo.toml` güncellemesi:
```toml
[dependencies]
encrypt-types = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-dsl = { package = "encrypt-solana-dsl", git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-anchor = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
anchor-lang = "0.32"
```

---

## Tahmini Süre

| Görev | Tahmini Süre |
|-------|-------------|
| WASM sorunu çöz | 2-4 saat |
| Vault kontrat | 3-5 saat |
| Encrypt client entegrasyon | 2-3 saat |
| IKA accept adımı | 1-2 saat |
| IKA signing akışı | 2-4 saat |
| Privacy sayfası güncelleme | 1-2 saat |
| **TOPLAM** | **~11-20 saat** |

---

## Referans Dosyalar

| Ne Yapılacak | Hangi Dosyayı Güncelle |
|-------------|----------------------|
| IKA DKG fix | `src/backend/IkaService.ts` |
| FHE transfer | `src/backend/SolanaDevnet.ts` |
| Vault kontrat | `arfhe_confidential_vault/programs/arfhe_vault/src/lib.rs` |
| Cargo deps | `arfhe_confidential_vault/Cargo.toml` |
| Privacy UI | `src/pages/Privacy.tsx` |
| dWallet UI | `src/pages/IkaDashboard.tsx` |
| TS deps | `package.json` |
| WASM serve | `vite.config.js`, `extension/manifest.json` |

---

[[08 - Encrypt Entegrasyon Rehberi|← Encrypt Rehberi]] | [[00 - Ana Sayfa|→ Ana Sayfa]]
