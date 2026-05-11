# 🛡️ Encrypt.xyz Entegrasyon Rehberi

## Genel Plan

Arfhe Wallet'ta Encrypt.xyz şu şekilde kullanılacak:

```
1. Kullanıcı "Gizli Gönder" tıklar
2. Transfer miktarı Encrypt.xyz TypeScript client ile şifrelenir
3. Şifreli input gRPC ile ağa gönderilir
4. arfhe_vault Anchor programı şifreli input'u alır
5. on-chain FHE işlemi (execute_graph) tetiklenir
6. Off-chain executor graph'ı değerlendirir
7. İşlem tamamlanır — bakiyeler hiç decrypt edilmez
```

---

## Adım 1: Anchor Programını Düzelt

### Cargo.toml Güncel Hali
```toml
[dependencies]
anchor-lang = "0.32"
encrypt-types = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-dsl = { package = "encrypt-solana-dsl", git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-anchor = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }

[dev-dependencies]
encrypt-solana-test = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
```

### lib.rs — Doğru Versiyon
```rust
use anchor_lang::prelude::*;
use encrypt_dsl::prelude::*;
use encrypt_anchor::EncryptContext;

declare_id!("4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8");
// ^ Deploy sonrası gerçek program ID buraya gelecek

// FHE transfer fonksiyonu — bu Rust kodu FHE DAG'ına compile edilir
#[encrypt_fn]
fn confidential_transfer(
    from_balance: EUint64,
    to_balance: EUint64,
    amount: EUint64,
) -> (EUint64, EUint64) {
    let has_funds = from_balance >= amount;
    let new_from = if has_funds { from_balance - amount } else { from_balance };
    let new_to = if has_funds { to_balance + amount } else { to_balance };
    (new_from, new_to)
}

#[program]
pub mod arfhe_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.ai_authority = ctx.accounts.ai_authority.key();
        Ok(())
    }

    pub fn transfer_with_policy(
        ctx: Context<TransferWithPolicy>,
    ) -> Result<()> {
        // AI Authority zorunlu imza kontrolü
        require!(
            ctx.accounts.ai_authority.is_signer,
            VaultError::UnauthorizedAIPolicy
        );

        // Encrypt.xyz FHE CPI çağrısı
        let encrypt_ctx = EncryptContext {
            encrypt_program: ctx.accounts.encrypt_program.clone(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        
        // Şifreli transferi yürüt
        encrypt_ctx.confidential_transfer(
            ctx.accounts.from_balance.to_account_info(),
            ctx.accounts.to_balance.to_account_info(),
            ctx.accounts.amount.to_account_info(),
            ctx.accounts.new_from_balance.to_account_info(),
            ctx.accounts.new_to_balance.to_account_info(),
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(init, payer = owner, space = 8 + 32 + 32)]
    pub vault: Account<'info, ConfidentialVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: AI policy authority public key
    pub ai_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferWithPolicy<'info> {
    #[account(has_one = owner)]
    pub vault: Account<'info, ConfidentialVault>,
    pub owner: Signer<'info>,
    pub ai_authority: Signer<'info>,
    
    // Encrypt.xyz ciphertext account'ları (public key = ciphertext ID)
    /// CHECK: Encrypt.xyz ciphertext account (from balance)
    pub from_balance: AccountInfo<'info>,
    /// CHECK: Encrypt.xyz ciphertext account (to balance)
    pub to_balance: AccountInfo<'info>,
    /// CHECK: Encrypt.xyz ciphertext account (amount)
    pub amount: AccountInfo<'info>,
    /// CHECK: Output ciphertext (new from)
    #[account(mut)]
    pub new_from_balance: AccountInfo<'info>,
    /// CHECK: Output ciphertext (new to)
    #[account(mut)]
    pub new_to_balance: AccountInfo<'info>,
    
    /// CHECK: Encrypt.xyz program ID
    pub encrypt_program: AccountInfo<'info>,
}

#[account]
pub struct ConfidentialVault {
    pub owner: Pubkey,
    pub ai_authority: Pubkey,
}

#[error_code]
pub enum VaultError {
    #[msg("AI Policy Authority did not approve this transaction.")]
    UnauthorizedAIPolicy,
}
```

### Derleme ve Deploy
```bash
cd arfhe_confidential_vault
anchor build
solana program deploy target/deploy/arfhe_vault.so --url devnet
```

---

## Adım 2: TypeScript Client Kurulumu

```bash
bun add @encrypt.xyz/pre-alpha-solana-client
```

veya npm/pnpm ile:
```bash
pnpm add @encrypt.xyz/pre-alpha-solana-client
```

---

## Adım 3: Gizli Transfer Implementasyonu

`src/backend/SolanaDevnet.ts` → `sendConfidentialPolicyTransfer()` metodunu güncelle:

```typescript
import { 
  createEncryptClient, 
  Chain,
  encodeReadCiphertextMessage 
} from "@encrypt.xyz/pre-alpha-solana-client/grpc";
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";

private async sendConfidentialPolicyTransfer(
  account: Account,
  recipientAddress: string,
  amount: string,
  mintAddress?: string
): Promise<string> {
  const ENCRYPT_PROGRAM_ID = new PublicKey("4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8");
  const ARFHE_VAULT_PROGRAM_ID = new PublicKey("YOUR_DEPLOYED_VAULT_PROGRAM_ID");
  
  console.log("🔐 Encrypt.xyz ile şifreleme başlatılıyor...");
  
  // 1. Encrypt client oluştur
  const client = createEncryptClient();
  
  // 2. Network encryption public key al
  // (Bu genellikle program'dan veya bir endpoint'ten alınır)
  const networkKey = await this.fetchNetworkEncryptionKey();
  
  // 3. Transfer miktarını şifrele
  const rawAmount = BigInt(Math.floor(parseFloat(amount) * 1e6)); // USDC 6 decimal
  const amountBytes = new Uint8Array(8);
  new DataView(amountBytes.buffer).setBigUint64(0, rawAmount, true); // little-endian
  
  const { ciphertextIdentifiers } = await client.createInput({
    chain: Chain.SOLANA,
    inputs: [{
      ciphertextBytes: amountBytes,
      fheType: 4,  // EUint64
    }],
    proof: new Uint8Array(0),  // ZK proof (pre-alpha'da boş olabilir)
    authorized: ARFHE_VAULT_PROGRAM_ID.toBytes(),
    networkEncryptionPublicKey: networkKey,
  });
  
  const amountCiphertextId = ciphertextIdentifiers[0];
  console.log("✅ Miktar şifrelendi. Ciphertext ID:", amountCiphertextId.toBase58());
  
  // 4. Anchor programını çağır
  // (Anchor client veya manual instruction builder)
  const tx = await this.buildVaultTransferTx(
    account,
    recipientAddress,
    amountCiphertextId,
    ARFHE_VAULT_PROGRAM_ID,
    ENCRYPT_PROGRAM_ID,
  );
  
  tx.sign(account.solana_keypair!);
  const signature = await this.connection.sendRawTransaction(tx.serialize());
  await this.pollForConfirmation(signature);
  
  console.log("✅ Gizli transfer tamamlandı:", signature);
  return signature;
}

private async fetchNetworkEncryptionKey(): Promise<Uint8Array> {
  // Encrypt.xyz network key'i programdan oku
  // Pre-alpha'da bu değer sabit olabilir
  const ENCRYPT_PROGRAM_ID = new PublicKey("4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8");
  const accountInfo = await this.connection.getAccountInfo(ENCRYPT_PROGRAM_ID);
  // Network key'i parse et (Encrypt.xyz docs'a göre)
  // Şimdilik placeholder:
  return new Uint8Array(32);
}
```

---

## Adım 4: Ciphertext Okuma (Bakiye Görüntüleme)

```typescript
import { encodeReadCiphertextMessage, createEncryptClient, Chain } from "@encrypt.xyz/pre-alpha-solana-client/grpc";

async function readEncryptedBalance(
  ciphertextId: PublicKey,
  userKeypair: Keypair,
  reencryptionKey: Uint8Array,
  epoch: number,
): Promise<bigint> {
  const client = createEncryptClient();
  
  const msg = encodeReadCiphertextMessage(
    Chain.SOLANA,
    ciphertextId.toBytes(),
    reencryptionKey,
    epoch,
  );
  
  // İmzala
  const signature = userKeypair.secretKey.slice(0, 64);  // Ed25519 sign
  
  const result = await client.readCiphertext({
    message: msg,
    signature,
    signer: userKeypair.publicKey.toBytes(),
  });
  
  // Pre-alpha'da plaintext döner
  const view = new DataView(result.value.buffer);
  return view.getBigUint64(0, true);
}
```

---

## Adım 5: Lokal Test

```typescript
// Test dosyası: src/__tests__/encrypt.test.ts
import { EncryptTestContext } from "encrypt-solana-test";

test("Gizli transfer doğru çalışıyor", () => {
  const ctx = EncryptTestContext.new_default();
  const alice = ctx.new_funded_keypair();
  const bob = ctx.new_funded_keypair();
  
  // Başlangıç bakiyeleri
  const aliceBalance = ctx.create_input_uint64(1000n, alice.pubkey());
  const bobBalance = ctx.create_input_uint64(0n, bob.pubkey());
  const amount = ctx.create_input_uint64(100n, alice.pubkey());
  
  // Transfer graph'ı yürüt
  const graph = confidential_transfer();
  const [newAlice, newBob] = ctx.execute_and_commit(&graph, [aliceBalance, bobBalance, amount]);
  
  // Sonuçları decrypt et ve kontrol et
  ctx.process_pending();
  assert_eq!(ctx.decrypt_uint64(newAlice, alice), 900n);
  assert_eq!(ctx.decrypt_uint64(newBob, bob), 100n);
});
```

---

## Sorun Giderme

| Hata | Neden | Çözüm |
|------|-------|-------|
| `Program not found` | Vault deploy edilmemiş | `anchor build && deploy` |
| `InvalidProof` | ZK proof eksik veya hatalı | Pre-alpha'da boş proof dene |
| `Unauthorized` | Program ID yanlış `authorized` alanı | Ciphertext oluştururken doğru programId ver |
| `StatusPending` | Executor henüz işlemedi | Birkaç saniye bekle, status Verified olacak |
| gRPC bağlantı hatası | endpoint yanlış | `pre-alpha-dev-1.encrypt.ika-network.net:443` kontrol et |

---

[[07 - IKA Entegrasyon Rehberi|← IKA Rehberi]] | [[09 - Yol Haritası ve TODOlar|→ Yol Haritası]]
