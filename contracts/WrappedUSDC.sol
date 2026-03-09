// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@fhenixprotocol/contracts/FHERC20Wrapper.sol";

/**
 * @title WrappedUSDC
 * @notice Confidential wrapper for USDC token on Sepolia testnet
 * @dev Wraps USDC into encrypted FHERC20 tokens for private transfers
 * 
 * Deployment:
 * - Network: Sepolia Testnet
 * - Underlying: USDC (0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
 * 
 * Usage:
 * 1. Approve this wrapper to spend your USDC
 * 2. Call wrap(address, amount) to get confidential tokens
 * 3. Transfer confidentially using confidentialTransfer()
 * 4. Call unwrap(address, amount) to burn confidential tokens
 * 5. After decryption, call claimUnwrapped() to receive USDC
 */
contract WrappedUSDC is FHERC20Wrapper {
    constructor(address usdcAddress)
        FHERC20Wrapper(
            usdcAddress,        // Underlying USDC token
            "Confidential USDC", // Name
            "cUSDC",            // Symbol
            6                    // Decimals (same as USDC)
        )
    {}
}
