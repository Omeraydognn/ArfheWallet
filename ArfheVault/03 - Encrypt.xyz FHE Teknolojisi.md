# 🔒 Encrypt.xyz FHE Teknolojisi

## FHE (Fully Homomorphic Encryption) Nedir?

FHE, **şifreli veriler üzerinde hesaplama yapmayı** sağlar. Veriyi hiç decrypt etmeden toplama, çıkarma, karşılaştırma gibi operasyonlar yapılabilir. Sonuç da yine şifreli olarak çıkar.

Encrypt.xyz bunu Solana programlarına getiriyor: akıllı kontratın içindeki bakiyeler kimse tarafından görülemiyor, ama toplama/çıkarma işlemleri on-chain doğru çalışıyor.

---

## Pre-Alpha Uyarısı

> **Önemli:** Bu bir pre-alpha sürümü. Şu anda gerçek şifreleme YOK — veriler zincirde plaintext olarak saklanıyor. Mainnet'e geçişte silinecek. Gerçek veri gönderme!

---

## Nasıl Çalışıyor?

```
1. Sen FHE mantığını yaz  →  #[encrypt_fn] DSL ile (normal Rust gibi)
2. Macro bunu compile eder  →  FHE DAG (computation graph) üretir
3. On-chain: execute_graph  →  output ciphertext account'ları oluşturur (PENDING)
4. Off-chain executor       →  Graph'ı değerlendirir, sonucu on-chain yazar (VERIFIED)
5. Decrypt gerekince        →  request_decryption çağrılır, decryptor plaintext yazar
```

### Örnek: Şifreli Transfer
```rust
#[encrypt_fn]
fn transfer(from: EUint64, to: EUint64, amount: EUint64) -> (EUint64, EUint64) {
    let has_funds = from >= amount;
    let new_from = if has_funds { from - amount } else { from };
    let new_to = if has_funds { to + amount } else { to };
    (new_from, new_to)
}
```

Kimse `from`, `to`, `amount`'ın gerçek değerini göremez. Ama işlem doğru çalışır.

---

## Pre-Alpha Ortamı

| Kaynak | Değer |
|--------|-------|
| Encrypt gRPC | `pre-alpha-dev-1.encrypt.ika-network.net:443` (TLS) |
| Solana Ağı | Devnet (`https://api.devnet.solana.com`) |
| Program ID | `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8` |

Lokal executor çalıştırmak GEREKMEZ. Devnet'e bağlan, gRPC ile şifreli input gönder, ağ halleder.

---

## Ciphertext Hesap Yapısı (On-Chain)

```
Ciphertext account (98 bytes):
  ciphertext_digest(32)           — gerçek şifreli verinin hash'i
  authorized(32)                  — kim kullanabilir (zero = herkes)
  network_encryption_public_key(32) — hangi FHE anahtarıyla şifreli
  fhe_type(1)                     — EBool, EUint64 vb.
  status(1)                       — Pending(0) veya Verified(1)
```

---

## Bağımlılıklar

### Rust (Solana programı için)

#### Anchor framework ile (bizim seçimimiz)
```toml
[dependencies]
encrypt-types = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-dsl = { package = "encrypt-solana-dsl", git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-anchor = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
anchor-lang = "0.32"

[dev-dependencies]
encrypt-solana-test = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
```

#### Kurulum gereksinimleri
- Rust (edition 2024)
- Solana CLI 3.x+
- Bun (TypeScript client için)

### TypeScript (Client SDK)
```bash
bun add @encrypt.xyz/pre-alpha-solana-client
```

---

## TypeScript Client Kullanımı

```typescript
import { 
  createEncryptClient, 
  encodeReadCiphertextMessage, 
  Chain 
} from "@encrypt.xyz/pre-alpha-solana-client/grpc";

const client = createEncryptClient();

// Şifreli input oluştur
const { ciphertextIdentifiers } = await client.createInput({
  chain: Chain.SOLANA,
  inputs: [{ ciphertextBytes: ciphertext, fheType: 4 }],  // fheType 4 = EUint64
  proof: proofBytes,
  authorized: programId.toBytes(),
  networkEncryptionPublicKey: networkKey,
});

// Ciphertext oku (off-chain)
const msg = encodeReadCiphertextMessage(
  Chain.SOLANA, ctId, reencryptionKey, epoch
);
const result = await client.readCiphertext({ message: msg, signature, signer });
// result.value = plaintext bytes
```

---

## Mevcut `arfhe_confidential_vault` Kontratı Durumu

Dosya: `arfhe_confidential_vault/programs/arfhe_vault/src/lib.rs`
Declared ID: `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`

### Kontrat Ne Yapıyor (Plan)
```
InitializeVault  →  Kullanıcı için şifreli bakiye vault'u oluşturur
Deposit          →  vault.encrypted_balance += amount (FHE add)
TransferWithPolicy →  AI Authority + IKA MPC imzası şartıyla gizli transfer
```

### Mevcut Sorunlar ❌
1. `encrypt-macros` ve `encrypt_fn` macro'su Cargo.toml'da doğru bağlı değil
2. `EncryptedU64` tipi doğru import edilmiyor olabilir
3. `encrypt_add` / `encrypt_sub` fonksiyonları placeholder — gerçek FHE operasyonu değil
4. Kontrat hiç compile edilmedi (derleme hatası var mı bilinmiyor)
5. Devnet'e deploy edilmedi

### Ne Yapılmalı
1. Cargo.toml'u doğru dependency'lerle düzelt
2. `#[encrypt_fn]` macro ile gerçek `transfer()` fonksiyonu yaz
3. `anchor build` ile compile et
4. `solana program deploy` ile devnet'e deploy et
5. Program ID'yi kod içinde güncelle

---

## Access Control (Kimler Kullanabilir?)

Her ciphertext'in `authorized` alanı var:
- `authorized = [0;32]` → **Public** — herkes okuyabilir/kullanabilir
- `authorized = <pubkey>` → Sadece o adres kullanabilir

Kontrol mekanizmaları:
- `transfer_ciphertext` — authorized adresi değiştir
- `copy_ciphertext` — farklı authorized ile kopya yap
- `make_public` — herkese aç (GERİ ALINAMAZ)

---

## Test Etme

```rust
#[cfg(test)]
mod tests {
    use encrypt_solana_test::EncryptTestContext;
    use encrypt_types::encrypted::Uint64;

    #[test]
    fn test_transfer() {
        let mut ctx = EncryptTestContext::new_default();
        let alice = ctx.new_funded_keypair();
        let bob = ctx.new_funded_keypair();

        let alice_balance = ctx.create_input::<Uint64>(1000, &alice.pubkey());
        let bob_balance = ctx.create_input::<Uint64>(0, &bob.pubkey());
        let amount = ctx.create_input::<Uint64>(100, &alice.pubkey());

        let graph = super::transfer();
        let outputs = ctx.execute_and_commit(
          &graph, &[alice_balance, bob_balance, amount], 2, &[], &alice
        );

        let new_alice = ctx.decrypt::<Uint64>(&outputs[0], &alice);
        let new_bob = ctx.decrypt::<Uint64>(&outputs[1], &bob);
        assert_eq!(new_alice, 900);
        assert_eq!(new_bob, 100);
    }
}
```

---

[[02 - IKA dWallet Teknolojisi|← IKA dWallet]] | [[04 - Sistem Mimarisi|→ Sistem Mimarisi]]
