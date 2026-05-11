# 🏠 ArfheWallet Bilgi Tabanı

> **Hackathon:** [Encrypt × IKA Frontier – Superteam Earn](https://superteam.fun/earn/listing/encrypt-ika-frontier-april-2026#comments)
> **Proje:** ArfheWallet — Solana devnet üzerinde FHE gizlilik + dWallet yönetimi sağlayan Chrome extension cüzdan

---

## 🗂️ İçerik Haritası

| Not | Konu |
|-----|------|
| [[01 - Proje Genel Bakış]] | Projenin amacı, ne yapılıyor, hackathon hedefleri |
| [[02 - IKA dWallet Teknolojisi]] | IKA SDK, dWallet nedir, DKG, 2PC-MPC, Solana desteği |
| [[03 - Encrypt.xyz FHE Teknolojisi]] | Encrypt SDK, FHE nedir, Solana program entegrasyonu |
| [[04 - Sistem Mimarisi]] | Genel mimari, veri akışı, bileşen haritası |
| [[05 - Kod Haritası]] | Dosya/klasör yapısı, her servisin işlevi |
| [[06 - Mevcut Durum ve Sorunlar]] | Çalışan/çalışmayan şeyler, bilinen hatalar |
| [[07 - IKA Entegrasyon Rehberi]] | IkaService.ts detayları, DKG akışı, imzalama |
| [[08 - Encrypt Entegrasyon Rehberi]] | FheCofheService, vault kontratı, TypeScript client |
| [[09 - Yol Haritası ve TODOlar]] | Ne yapılması lazım, öncelik sırası |

---

## ⚡ Hızlı Referans

### Kritik Endpoint'ler
- **Encrypt gRPC:** `pre-alpha-dev-1.encrypt.ika-network.net:443`
- **Solana RPC:** `https://api.devnet.solana.com`
- **Encrypt Program ID:** `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8`
- **Arfhe Vault Program ID (mock):** `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`

### Kullanılan Teknoloji Stack
- **UI:** React 19 + Material UI 7 + TypeScript
- **Blockchain (Solana):** `@solana/web3.js`, `@solana/spl-token`
- **IKA dWallet:** `@ika.xyz/sdk ^0.4.1` + `@mysten/sui`
- **FHE (EVM):** `cofhejs ^0.3.1` (Fhenix/Sepolia için)
- **FHE (Solana):** `encrypt-anchor` / Anchor smart contract (Rust)
- **Build:** Vite 6, pnpm

### Temel Komutlar
```bash
pnpm install        # Bağımlılıkları yükle
pnpm dev            # Dev server başlat
pnpm build          # dist/ klasörüne build al
pnpm test           # 273 test çalıştır
```

---

## 🚨 Kritik Sorunlar (Özet)

1. **IKA DKG "submitting" adımında takılıyor** ← kısmen düzeltildi (timeout eklendi), testnet yavaşlığı sürüyor
2. **Encrypt vault kontratı deploy edilmedi:** `arfhe_confidential_vault` henüz Solana devnet'e deploy edilmemiş
3. **`sendConfidentialPolicyTransfer` tamamen mock:** 0 SOL dummy TX atıyor, gerçek FHE yok
4. **IKA signing akışı tamamlanmamış:** `signCrossChainTransaction` dummy byte array döndürüyor
5. **`encrypt-anchor` bağımlılığı eksik:** `package.json`'da yok, vault kontrat derlenemiyor

---

*Son güncelleme: 2026-05-11*
