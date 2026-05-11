use anchor_lang::prelude::*;
use encrypt_macros::encrypt_fn;
use encrypt_types::EncryptedU64;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod arfhe_vault {
    use super::*;

    /// Initializes a confidential vault for a user.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.ai_authority = ctx.accounts.ai_authority.key();
        vault.ika_mpc_authority = ctx.accounts.ika_mpc_authority.key();
        
        // Initialize with 0 encrypted balance
        vault.encrypted_balance = EncryptedU64::zero();
        Ok(())
    }

    /// Deposits funds into the vault (simulated by adding to the encrypted balance).
    pub fn deposit(ctx: Context<Deposit>, amount: EncryptedU64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // FHE Addition: vault.encrypted_balance += amount
        vault.encrypted_balance = encrypt_add(vault.encrypted_balance, amount);
        Ok(())
    }

    /// Transfers funds confidentially, but ONLY if the AI Policy Authority has signed the transaction.
    /// This enforces the "Policy-Based Encryption" requirement.
    pub fn transfer_with_policy(
        ctx: Context<TransferWithPolicy>, 
        amount: EncryptedU64
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let recipient_vault = &mut ctx.accounts.recipient_vault;

        // Policy Check: The AI Authority must sign this transaction for it to be valid.
        require!(
            ctx.accounts.ai_authority.is_signer,
            VaultError::UnauthorizedAIPolicy
        );
        require!(
            vault.ai_authority == ctx.accounts.ai_authority.key(),
            VaultError::InvalidAIAuthority
        );

        // Ika Network Check: Ensure cross-chain MPC node co-signed
        require!(
            ctx.accounts.ika_mpc_authority.is_signer,
            VaultError::UnauthorizedIkaMPC
        );
        require!(
            vault.ika_mpc_authority == ctx.accounts.ika_mpc_authority.key(),
            VaultError::InvalidIkaAuthority
        );

        // FHE Math: Subtract from sender, add to recipient.
        // In a real FHE network, we would also verify `amount <= balance` via encrypted comparison,
        // but for this MVP we demonstrate the FHE math + AI Policy signature.
        vault.encrypted_balance = encrypt_sub(vault.encrypted_balance, amount);
        recipient_vault.encrypted_balance = encrypt_add(recipient_vault.encrypted_balance, amount);

        Ok(())
    }
}

/// Helper functions that represent FHE operations (mocked for compilation if encrypt-types is pre-alpha)
pub fn encrypt_add(a: EncryptedU64, b: EncryptedU64) -> EncryptedU64 {
    // In real Encrypt.xyz, this would be computed on the coprocessor
    // For now we just return a dummy EncryptedU64 for structure
    a
}

pub fn encrypt_sub(a: EncryptedU64, b: EncryptedU64) -> EncryptedU64 {
    a
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + 32 + 64 // discriminator + owner + ai_auth + ika_auth + enc_balance
    )]
    pub vault: Account<'info, ConfidentialVault>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// CHECK: The AI server's public key that enforces policies
    pub ai_authority: UncheckedAccount<'info>,
    
    /// CHECK: The Ika MPC Node public key for cross-chain execution authority
    pub ika_mpc_authority: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, ConfidentialVault>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferWithPolicy<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, ConfidentialVault>,
    
    #[account(mut)]
    pub recipient_vault: Account<'info, ConfidentialVault>,
    
    pub owner: Signer<'info>,
    
    /// The AI Authority MUST sign this transaction, otherwise it fails.
    pub ai_authority: Signer<'info>,
    
    /// The Ika Network MPC MUST co-sign this for cross-chain validity.
    pub ika_mpc_authority: Signer<'info>,
}

#[account]
pub struct ConfidentialVault {
    pub owner: Pubkey,
    pub ai_authority: Pubkey,
    pub ika_mpc_authority: Pubkey, // Integrated Ika 2PC-MPC Node Auth
    pub encrypted_balance: EncryptedU64,
}

#[error_code]
pub enum VaultError {
    #[msg("The AI Policy Authority did not approve this transaction.")]
    UnauthorizedAIPolicy,
    #[msg("Invalid AI Authority provided.")]
    InvalidAIAuthority,
    #[msg("Ika MPC Network did not co-sign this transaction.")]
    UnauthorizedIkaMPC,
    #[msg("Invalid Ika MPC Authority provided.")]
    InvalidIkaAuthority,
}
