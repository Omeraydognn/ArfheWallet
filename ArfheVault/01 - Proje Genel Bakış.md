# 📋 Proje Genel Bakış

## Ne Yapıyoruz?

ArfheWallet, Solana devnet üzerinde **iki güçlü teknolojiyi** birleştiren bir Chrome extension cüzdanı:

1. **Encrypt.xyz** → Solana programlarının şifreli veri üzerinde hesaplama yapması (FHE - Fully Homomorphic Encryption)
2. **IKA dWallet** → Kullanıcının özel anahtarını hiç tam oluşturmadan, 2PC-MPC protokolüyle imzalama yapabilmesi

### Kullanıcı Deneyimi Hedefi

Kullanıcı cüzdanı açar ve şunları yapabilir:
- Solana devnet'te normal SOL/token transferi yapar
- **"Gizli Transfer"** butonuyla: bakiye Encrypt.xyz FHE ağında şifrelenir, kimse göremez
- **"dWallet Oluştur"** ile: IKA üzerinde 2PC-MPC ile yeni bir Solana adresi üretir, bu adres hem kullanıcının hem IKA ağının ortak kontrolündedir
- dWallet Dashboard'undan dWallet'ını yönetir, adresini görür, mpc ID'sini kopyalar

---

## Hackathon Hedefleri

### Encrypt.xyz İçin
- [x] Solana devnet'te FHE destekli Anchor/Pinocchio programı
- [x] `#[encrypt_fn]` DSL ile şifreli bakiye işlemleri
- [x] Client SDK ile `createInput`, `readCiphertext` çağrıları
- [ ] **Gerçek gRPC entegrasyonu** `pre-alpha-dev-1.encrypt.ika-network.net:443`
- [ ] TypeScript `@encrypt.xyz/pre-alpha-solana-client` paketi kullanımı

### IKA dWallet İçin
- [x] `@ika.xyz/sdk` kurulumu ve `IkaService.ts` iskelet kodu
- [x] `IkaDashboard.tsx` UI
- [x] `createArfheDWallet('solana')` akışı başlatıldı
- [ ] **Gerçek DKG** (Distributed Key Generation) tamamlanması
- [ ] Presign + Sign akışı çalışır hale getirilmesi
- [ ] Kullanıcı share'ini kabul etme (`acceptEncryptedUserShare`)

---

## Projenin Mevcut Hali

### Çalışan Özellikler ✅
- Chrome extension olarak yüklenip açılıyor
- Solana Devnet hesabı oluşturma ve import
- SOL native transfer (gerçek, devnet'te çalışıyor)
- SPL token transfer (gerçek, devnet'te çalışıyor)
- Transaction history görüntüleme
- Ethereum/EVM zincirleri + FHE (Fhenix Sepolia) — cofhejs ile

### Çalışmayan / Mock Olan Özellikler ❌
- IKA gerçek DKG — `createArfheDWallet()` mock DKG fallback yapıyor
- Encrypt.xyz Solana FHE — vault kontrat deploy edilmemiş, client SDK bağlı değil
- Gizli transfer — dummy 0-SOL TX atıyor
- Cross-chain signing — random byte array döndürüyor

---

## Teknik Karar Notları

### Neden IKA + Solana?
IKA'nın Solana Pre-Alpha'sı yeni çıktı (`solana-pre-alpha.ika.xyz`). dWallet'ler artık Solana için `Curve.ED25519` + `SignatureAlgorithm.EdDSA` + `Hash.SHA512` kombinasyonuyla çalışıyor.

### Neden Encrypt.xyz?
Encrypt.xyz, Solana programlarına FHE yetenekleri ekliyor. `#[encrypt_fn]` macro'su Rust kodunu FHE computation graph'ına derliyor. Pre-alpha'da devnet'te deploy edilmiş `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8` program ID'si mevcut.

### Neden cofhejs (EVM tarafı)?
EVM tarafında Fhenix/cofhejs zaten kuruluydu, Sepolia'da çalışıyor. Bu EVM tarafı olarak kalıyor. Solana tarafında Encrypt.xyz kullanılacak.

---

## Linkler

- [Hackathon Sayfası](https://superteam.fun/earn/listing/encrypt-ika-frontier-april-2026#comments)
- [IKA Docs](https://docs.ika.xyz/docs/sdk)
- [Encrypt Docs](https://docs.encrypt.xyz/)
- [IKA GitHub](https://github.com/dwallet-labs/ika)
- [Encrypt GitHub](https://github.com/dwallet-labs/encrypt-pre-alpha)
- [IKA Solana Pre-Alpha](https://solana-pre-alpha.ika.xyz)

[[00 - Ana Sayfa|← Ana Sayfa'ya Dön]]
