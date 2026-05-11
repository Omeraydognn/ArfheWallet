# 🔧 IKA Entegrasyon Rehberi

## Adım 1: SDK Kurulumu (Tamamlandı ✅)

```bash
pnpm add @ika.xyz/sdk
pnpm add @mysten/sui
```

`package.json`'da `"@ika.xyz/sdk": "^0.4.1"` mevcut.

---

## Adım 2: IkaClient Başlatma

```typescript
import {
  IkaClient, getNetworkConfig,
  UserShareEncryptionKeys,
  prepareDKGAsync, createRandomSessionIdentifier,
  publicKeyFromDWalletOutput,
  Curve, Hash, SignatureAlgorithm,
} from "@ika.xyz/sdk";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

// Testnet için
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

await ikaClient.initialize(); // ← WASM burada yükleniyor, sorun burada
```

### WASM Sorunu İçin Önerilen Yaklaşım (Chrome Extension)

`vite.config.js`'e eklenecek:
```javascript
// IKA WASM'ı public klasörüne kopyala
import { viteStaticCopy } from 'vite-plugin-static-copy';

viteStaticCopy({
  targets: [
    {
      src: 'node_modules/@ika.xyz/sdk/dist/*.wasm',
      dest: 'assets/'
    }
  ]
})
```

`manifest.json`'a eklenecek:
```json
"web_accessible_resources": [
  {
    "resources": ["assets/*.wasm", "tfhe_bg.wasm"],
    "matches": ["<all_urls>"]
  }
]
```

---

## Adım 3: Solana dWallet Oluşturma (Tam Akış)

```typescript
import type { Signer } from "@mysten/sui/cryptography";
import bs58 from "bs58";
import { ethers } from "ethers";

async function createSolanadWallet(
  ikaClient: IkaClient,
  suiClient: SuiJsonRpcClient,
  signer: Signer,    // Sui testnet signer (kullanıcının Sui adresi)
  seed: Uint8Array,  // Kullanıcı seed'i (32 byte)
): Promise<{
  solanaAddress: string;
  dWalletId: string;
  dWalletCapId: string;
  userShareEncryptionKeysBytes: Uint8Array;
}> {
  const curve = Curve.ED25519;  // Solana için ED25519
  const signerAddress = signer.toSuiAddress();

  // 1. User share encryption keys üret
  const normalizedSeed = new Uint8Array(32);
  normalizedSeed.set(seed.slice(0, 32));
  const userShareEncryptionKeys = await UserShareEncryptionKeys.fromRootSeedKey(
    normalizedSeed, curve
  );

  // 2. DKG input hazırla
  const sessionIdentifier = createRandomSessionIdentifier();
  const dkgRequestInput = await prepareDKGAsync(
    ikaClient, curve, userShareEncryptionKeys, sessionIdentifier, signerAddress
  );

  // 3. Network encryption key al
  const networkEncryptionKey = await ikaClient.getLatestNetworkEncryptionKey();

  // 4. IKA Transaction oluştur
  const transaction = new Transaction();
  const { IkaTransaction } = await import("@ika.xyz/sdk");
  const ikaTx = new IkaTransaction({
    ikaClient, transaction, userShareEncryptionKeys,
  });

  // Encryption key kaydet (ilk kez yapılıyorsa)
  await ikaTx.registerEncryptionKey({ curve });

  // 5. DKG isteği gönder
  const registeredSession = ikaTx.registerSessionIdentifier(sessionIdentifier);
  
  // Coin'leri al (Sui testnet'te funded olması lazım)
  const IKA_COIN_TYPE = `${getNetworkConfig('testnet').packages.ikaPackage}::ika::IKA`;
  const [suiCoins, ikaCoins] = await Promise.all([
    suiClient.core.listCoins({ owner: signerAddress, coinType: '0x2::sui::SUI' }),
    suiClient.core.listCoins({ owner: signerAddress, coinType: IKA_COIN_TYPE }),
  ]);
  
  const ikaCoinObj = (ikaCoins as any).objects?.[0];
  if (!ikaCoinObj) throw new Error("IKA token gerekli! Discord faucet'ten al.");
  
  const ikaCoin = transaction.splitCoins(
    transaction.object(ikaCoinObj.id), [1_000_000n]
  );
  const suiCoin = transaction.splitCoins(transaction.gas, [1_000_000n]);

  await ikaTx.requestDWalletDKG({
    dkgRequestInput, ikaCoin, suiCoin,
    sessionIdentifier: registeredSession,
    dwalletNetworkEncryptionKeyId: networkEncryptionKey.id,
    curve,
  });

  // 6. TX'i gönder
  const result = await suiClient.core.signAndExecuteTransaction({
    transaction, signer, include: { effects: true },
  });

  // 7. dWallet Cap'i bul
  const caps = await ikaClient.getOwnedDWalletCaps(signerAddress);
  const dWalletCap = caps.dWalletCaps.at(-1);
  if (!dWalletCap?.dwallet_id) throw new Error("DWalletCap bulunamadı");

  // 8. *** KRİTİK EKSİK ADIM *** — Encrypted user share'i kabul et
  const dWalletPending = await ikaClient.getDWalletInParticularState(
    dWalletCap.dwallet_id, 'AwaitingKeyHolderSignature'
  );
  
  // Event'den encrypted share ID'yi bul
  const events = (result as any).Transaction?.effects?.events || [];
  const shareEvent = events.find((e: any) => e.type?.includes('EncryptedUserSecretKeyShare'));
  const encryptedShareId = shareEvent?.parsedJson?.encrypted_user_secret_key_share_id;
  
  const transaction2 = new Transaction();
  const ikaTx2 = new IkaTransaction({
    ikaClient, transaction: transaction2, userShareEncryptionKeys,
  });
  
  await ikaTx2.acceptEncryptedUserShare({
    dWallet: dWalletPending as any,
    encryptedUserSecretKeyShareId: encryptedShareId,
    userPublicOutput: new Uint8Array(
      dWalletPending.state.AwaitingKeyHolderSignature?.public_output
    ),
  });
  
  await suiClient.core.signAndExecuteTransaction({
    transaction: transaction2, signer, include: { effects: true },
  });

  // 9. Active dWallet'ı bekle
  const activeDWallet = await ikaClient.getDWalletInParticularState(
    dWalletCap.dwallet_id, 'Active', { timeout: 120_000 }
  );

  // 10. Solana adresi türet
  const publicKeyBytes = await publicKeyFromDWalletOutput(
    curve, Uint8Array.from(activeDWallet.state.Active.public_output)
  );
  
  // Ed25519 public key = 32 byte → bs58 encode = Solana adresi
  const rawKey = publicKeyBytes.length === 32 
    ? publicKeyBytes 
    : publicKeyBytes.slice(1);
  const solanaAddress = bs58.encode(rawKey);

  return {
    solanaAddress,
    dWalletId: dWalletCap.dwallet_id,
    dWalletCapId: dWalletCap.id,
    userShareEncryptionKeysBytes: userShareEncryptionKeys.toShareEncryptionKeysBytes(),
  };
}
```

---

## Adım 4: dWallet ile Mesaj İmzalama

```typescript
async function signWithDWallet(
  ikaClient: IkaClient,
  suiClient: SuiJsonRpcClient,
  signer: Signer,
  dWalletId: string,
  userShareEncryptionKeysBytes: Uint8Array,
  message: Uint8Array,
  encryptedShareId: string,
): Promise<Uint8Array> {
  const curve = Curve.ED25519;
  const userShareEncryptionKeys = UserShareEncryptionKeys.fromShareEncryptionKeysBytes(
    userShareEncryptionKeysBytes
  );

  const dWallet = await ikaClient.getDWalletInParticularState(dWalletId, 'Active');
  const encryptedShare = await ikaClient.getEncryptedUserSecretKeyShare(encryptedShareId);
  
  // Funding
  const funding = await getFunding(suiClient, signer.toSuiAddress());
  
  // ADIM 1: Presign
  const tx1 = new Transaction();
  const ikaTx1 = new IkaTransaction({ ikaClient, transaction: tx1, userShareEncryptionKeys });
  
  await ikaTx1.requestPresign({
    dWallet,
    signatureAlgorithm: SignatureAlgorithm.EdDSA,
    ikaCoin: splitCoin(tx1, funding.ikaCoinId, 1_000_000n),
    suiCoin: tx1.splitCoins(tx1.gas, [1_000_000n]),
  });
  
  const r1 = await suiClient.core.signAndExecuteTransaction({
    transaction: tx1, signer, include: { effects: true },
  });
  
  // Presign ID'yi event'den al
  const presignId = extractPresignId(r1);
  const presign = await ikaClient.getPresignInParticularState(presignId, 'Completed');
  
  // ADIM 2: Sign
  const tx2 = new Transaction();
  const ikaTx2 = new IkaTransaction({ ikaClient, transaction: tx2, userShareEncryptionKeys });
  
  const messageApproval = ikaTx2.approveMessage({
    message, curve,
    dWalletCap: (dWallet as any).dwallet_cap_id,
    signatureAlgorithm: SignatureAlgorithm.EdDSA,
    hashScheme: Hash.SHA512,
  });
  
  await ikaTx2.requestSign({
    dWallet: dWallet as any,
    hashScheme: Hash.SHA512,
    verifiedPresignCap: ikaTx2.verifyPresignCap({ presign }),
    presign,
    encryptedUserSecretKeyShare: encryptedShare,
    message,
    signatureScheme: SignatureAlgorithm.EdDSA,
    ikaCoin: splitCoin(tx2, funding.ikaCoinId, 1_000_000n),
    suiCoin: tx2.splitCoins(tx2.gas, [1_000_000n]),
    messageApproval,
  });
  
  await suiClient.core.signAndExecuteTransaction({
    transaction: tx2, signer, include: { effects: true },
  });
  
  // İmzayı bekle ve al
  const signId = extractSignId(/* events */);
  const sig = await ikaClient.getSignInParticularState(
    signId, curve, SignatureAlgorithm.EdDSA, 'Completed'
  );
  
  return Uint8Array.from(sig.state.Completed.signature);
}
```

---

## Önemli Notlar

- **Presign:** Önceden yapılıp cache'lenebilir — bu performansı artırır
- **User Share:** `UserShareEncryptionKeys.toShareEncryptionKeysBytes()` ile serialize et, saklayabileceğin byte dizisi verir. Restore için `fromShareEncryptionKeysBytes()` kullan.
- **Sui Signer:** Browser'da Sui wallet (Sui Wallet extension, mysten/sui keypair) gerekiyor. Şu an `Account.ts`'te Sui keypair yok, eklenmesi lazım.
- **İkaCoin:** Testnet'te IKA token faucet gerekiyor. Her işlem için ~1 IKA harcanıyor.

---

## 🔬 Araştırma Bulguları (2026-05-11)

### IKA Ağı Hakkında Doğrulanmış Gerçekler

**IKA ayrı bir chain değil, Sui üzerinde çalışıyor:**
- `getJsonRpcFullnodeUrl('testnet')` → `https://fullnode.testnet.sui.io:443` ✅ doğru URL
- IKA paket ve objeleri Sui testnet üzerinde deploy edilmiş durumda
- Bizim `SuiJsonRpcClient` + `getNetworkConfig('testnet')` kullanımı SDK README ile birebir uyuşuyor

**Testnet Paket ID'leri (`getNetworkConfig('testnet')` çıktısı):**
```
ikaPackage:                  0x1f26bb2f711ff82dcda4d02c77d5123089cb7f8418751474b9fb744ce031526a
ikaSystemObject:             0x2172c6483ccd24930834e30102e33548b201d0607fb1fdc336ba3267d910dec6
ikaDWalletCoordinator:       0x4d157b7415a298c56ec2cb1dcab449525fa74aec17ddba376a83a7600f2062fc
  initialSharedVersion:        510819272
```

**Mainnet Paket ID'leri (`getNetworkConfig('mainnet')` çıktısı):**
```
ikaPackage:                  0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa
ikaSystemObject:             0x215de95d27454d102d6f82ff9c54d8071eb34d5706be85b5c73cbd8173013c80
ikaDWalletCoordinator:       0x5ea59bce034008a006425df777da925633ef384ce25761657ea89e2a08ec75f3
  initialSharedVersion:        595876492
```

### `prepareDKGAsync` Gerçekte Ne Yapıyor?

Kodun yorumunda "pure local computation" yazıyor, **bu yanlış:**

```typescript
async function prepareDKGAsync(ikaClient, curve, userShareEncryptionKeys, bytesToHash, senderAddress) {
  // ← ÖNCE ağa gidiyor!
  const protocolPublicParameters = await ikaClient.getProtocolPublicParameters(void 0, curve);
  return prepareDKG(protocolPublicParameters, curve, ...); // ← sonra WASM çağrısı (local)
}
```

`getProtocolPublicParameters` → Sui testnet'ten veri çekiyor. Bu çağrı testnet yavaşlığında süresiz askıda kalabilir. **Bu yüzden 50s timeout şart.**

### IKA SDK Timeout Stratejisi (Güncel)

```
DKG oluşturma akışı timeout korumaları:

[initializeIkaClient]  ← timeout yok (bir kez çalışır, cache'lenir)
[registerEncryptionKey] ← timeout yok (hata yutulur, try/catch var)
[8s wait]              ← sabit bekleme
[getLatestNetworkEncryptionKey + getOwnedDWalletCaps]  ← 30s timeout ✅
[retry loop × 5]:
  [prepareDKGAsync]      ← 50s toplam timeout (loop içi) ✅
  [transaction build]    ← sync, timeout gereksiz
  [signAndExecuteTransaction] ← 50s toplam timeout (loop içi) ✅
  [20s retry delay]
[findNewDWalletCap]    ← timeout yok (hızlı, bir getObject çağrısı)
[getDWalletInParticularState("Active", 180s)] ← SDK'nın kendi timeout'u ✅
```

### IKA için gRPC Yok

IKA SDK tamamen HTTP/JSON-RPC üzerinden çalışır. gRPC sadece Encrypt.xyz için kullanılıyor (`pre-alpha-dev-1.encrypt.ika-network.net:443`). IKA için ekstra bir transport kurulumu gerekmez.

### Faucet ve Token Bilgisi

- **SUI faucet:** `https://faucet.testnet.sui.io/v2/gas` (POST ile otomatik alınabiliyor ✅)
- **IKA faucet:** `https://faucet.ika.xyz` — SUI → IKA swap. Sui Wallet extension ile bağlan.
- **IKA exchange Discord:** `https://discord.gg/ika`
- Her DKG işlemi: ~1 IKA + ~0.01 SUI gas

---

[[06 - Mevcut Durum ve Sorunlar|← Sorunlar]] | [[08 - Encrypt Entegrasyon Rehberi|→ Encrypt Rehberi]]
