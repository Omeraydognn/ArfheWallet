# ArfheWallet — Agent Protokolü

## 🎯 Temel Kural

Bu projede çalışan **her agent**, yaptığı değişiklikleri `ArfheVault/` Obsidian vault'una yansıtmak **zorundadır**. Vault, projenin canlı belleğidir.

---

## 🔄 Değişiklik Takip Protokolü

### Herhangi Bir Kod Değişikliği Yapılırken:

**1. Önce oku:**
```
ArfheVault/00 - Ana Sayfa.md         → Genel durumu anla
ArfheVault/06 - Mevcut Durum ve Sorunlar.md  → Hangi sorunlar açık?
ArfheVault/09 - Yol Haritası ve TODOlar.md  → Sıradaki görev ne?
```

**2. Değişikliği yap.**

**3. Vault'u güncelle — hangi not güncellenir?**

| Değişiklik Türü | Güncellenecek Not |
|----------------|-------------------|
| Yeni servis veya dosya eklendi | `05 - Kod Haritası.md` |
| Mimari değişti, yeni bağlantı eklendi | `04 - Sistem Mimarisi.md` |
| Hata düzeltildi | `06 - Mevcut Durum ve Sorunlar.md` → sorunu ✅ olarak işaretle |
| Yeni hata/sorun keşfedildi | `06 - Mevcut Durum ve Sorunlar.md` → yeni başlık ekle |
| IKA SDK kodu değişti | `07 - IKA Entegrasyon Rehberi.md` |
| Encrypt/vault kodu değişti | `08 - Encrypt Entegrasyon Rehberi.md` |
| TODO tamamlandı | `09 - Yol Haritası ve TODOlar.md` → `- [x]` yap |
| Yeni TODO eklendi | `09 - Yol Haritası ve TODOlar.md` → `- [ ]` ekle |
| Deploy yapıldı | İlgili rehber + `00 - Ana Sayfa.md` endpoint tablosunu güncelle |
| Kritik değişiklik | `00 - Ana Sayfa.md` → "Kritik Sorunlar" bölümünü güncelle |

---

## 📝 Günlük Girişi Formatı

`06 - Mevcut Durum ve Sorunlar.md` dosyasına her önemli değişiklikten sonra şu blok eklenir:

```markdown
---
### ✅ ÇÖZÜLDÜ — [YYYY-MM-DD] — [Sorun/Özellik Adı]
**Ne yapıldı:** [1-2 cümle açıklama]
**Değiştirilen dosyalar:** `dosya1.ts`, `dosya2.rs`
**Agent:** [Agent adı]
---
```

Yeni sorun keşfedildiğinde:
```markdown
### 🔴 YENİ SORUN — [Sorun başlığı]
**Keşfedilme tarihi:** YYYY-MM-DD
**Belirti:** [Ne oluyor?]
**Neden:** [Neden oluyor?]
**Çözüm:** [Nasıl çözülmeli?]
```

---

## 🚫 Yapılmaması Gerekenler

- Vault'u güncellemeden büyük bir değişiklik bırakma
- `06 - Mevcut Durum ve Sorunlar.md`'daki çözülmüş sorunları silme (üstüne ✅ ekle, bırak)
- `09 - Yol Haritası`'ndan tamamlanmış maddeleri silme (`- [x]` yap, bırak)
- Vault dışındaki bir yerde değişiklik notu tutma

---

## 🗂️ Vault Özeti

```
ArfheVault/
├── 00 - Ana Sayfa.md              ← BURADAN BAŞLA — genel tablo
├── 01 - Proje Genel Bakış.md
├── 02 - IKA dWallet Teknolojisi.md
├── 03 - Encrypt.xyz FHE Teknolojisi.md
├── 04 - Sistem Mimarisi.md
├── 05 - Kod Haritası.md
├── 06 - Mevcut Durum ve Sorunlar.md  ← DEĞİŞİKLİK GÜNLÜĞÜ BURAYA
├── 07 - IKA Entegrasyon Rehberi.md
├── 08 - Encrypt Entegrasyon Rehberi.md
└── 09 - Yol Haritası ve TODOlar.md   ← TODO'LAR BURAYA
```

---

## 📌 Proje Hızlı Referans

```
Proje: ArfheWallet Chrome Extension
Ağ:    Solana Devnet + IKA/Sui Testnet
Build: pnpm build → dist/ (Chrome'a yükle)
Test:  pnpm test (273 test)

IKA:     src/backend/IkaService.ts
Encrypt: arfhe_confidential_vault/programs/arfhe_vault/src/lib.rs
         src/backend/SolanaDevnet.ts → sendConfidentialPolicyTransfer()
UI:      src/pages/IkaDashboard.tsx
         src/pages/Privacy.tsx
```
