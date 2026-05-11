# ArfheWallet — Agent Talimatları

## 📓 Obsidian Vault ile Değişiklik Takibi

Bu projede yapılan **tüm önemli değişiklikler** `ArfheVault/` klasöründeki Obsidian notlarına yansıtılmalıdır.

### Kural: Her Değişiklikten Sonra Vault'u Güncelle

Bir agent bu projede kod değişikliği, hata düzeltmesi, yeni özellik veya deploy yaptığında şu adımları izlemelidir:

1. **Değişikliği yap** (kod, config, kontrat vb.)
2. **İlgili vault notunu güncelle:**
   - Yeni bir özellik → `05 - Kod Haritası.md` ve `04 - Sistem Mimarisi.md`
   - Hata düzeltmesi → `06 - Mevcut Durum ve Sorunlar.md` (sorunu "çözüldü" olarak işaretle)
   - Deploy / kurulum → ilgili entegrasyon rehberi (`07` veya `08`)
   - Yeni TODO / karar → `09 - Yol Haritası ve TODOlar.md`
3. **Ana sayfayı güncelle:** `00 - Ana Sayfa.md` içindeki "Kritik Sorunlar" bölümünü güncel tut

---

## 📂 Vault Dosya Yapısı

```
ArfheVault/
├── 00 - Ana Sayfa.md              ← Genel durum, hızlı referans
├── 01 - Proje Genel Bakış.md      ← Proje amacı, hackathon hedefleri
├── 02 - IKA dWallet Teknolojisi.md  ← IKA SDK, DKG, signing
├── 03 - Encrypt.xyz FHE Teknolojisi.md  ← FHE, Solana entegrasyonu
├── 04 - Sistem Mimarisi.md        ← Mimari şemalar, veri akışları
├── 05 - Kod Haritası.md           ← Dosyalar, servisler, metodlar
├── 06 - Mevcut Durum ve Sorunlar.md  ← Bilinen hatalar ve çözümleri
├── 07 - IKA Entegrasyon Rehberi.md  ← IKA kod rehberi
├── 08 - Encrypt Entegrasyon Rehberi.md  ← Encrypt kod rehberi
└── 09 - Yol Haritası ve TODOlar.md  ← TODOlar, öncelikler
```

---

## 🗂️ Proje Genel Bilgisi

**Proje:** ArfheWallet — Solana devnet üzerinde FHE gizlilik + IKA dWallet yönetimi sağlayan Chrome extension

**Hackathon:** [Encrypt × IKA Frontier – Superteam Earn](https://superteam.fun/earn/listing/encrypt-ika-frontier-april-2026)

**Teknoloji Stack:**
- React 19 + TypeScript + Material UI 7 (frontend)
- Vite 6 + pnpm (build)
- `@ika.xyz/sdk ^0.4.1` (IKA dWallet)
- `@encrypt.xyz/pre-alpha-solana-client` (Encrypt FHE)
- `@solana/web3.js` + `@solana/spl-token` (Solana)
- `cofhejs` (EVM/Fhenix FHE)
- Anchor (Solana akıllı kontrat)

**Kritik Endpoint'ler:**
- Encrypt gRPC: `pre-alpha-dev-1.encrypt.ika-network.net:443`
- Solana RPC: `https://api.devnet.solana.com`
- Encrypt Program ID: `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8`

---

## ✅ Değişiklik Günlüğü Formatı

`06 - Mevcut Durum ve Sorunlar.md` dosyasına yeni değişiklikler şu formatta eklenmelidir:

```markdown
### ✅ [TARİH] — [Değişiklik Başlığı]
**Ne yapıldı:** Kısa açıklama
**Dosyalar:** `src/backend/IkaService.ts`, `vite.config.js` vb.
**Agent:** Claude / Cowork
**Notlar:** Varsa ek bilgi
```

---

## ⚠️ Dikkat Edilecekler

- `pnpm build` her değişiklikten sonra çalışmalı, build kırılmamalı
- `pnpm test` (273 test) yeni özelliklerle birlikte güncellenmiş olmalı
- Chrome extension için `dist/` klasörü `pnpm build` ile yenilenmeli
- Solana kontrat değişikliklerinde `anchor build && deploy` gerekir
- IKA SDK değişikliklerinde WASM uyumluluğunu kontrol et
