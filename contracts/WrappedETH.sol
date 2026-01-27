// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@fhenixprotocol/contracts/FHERC20Wrapper.sol";

/**
 * @title WrappedETH
 * @notice Confidential wrapper for WETH token on Sepolia testnet
 * @dev Wraps WETH into encrypted FHERC20 tokens for private transfers
 * 
 * Deployment:
 * - Network: Sepolia Testnet
 * - Underlying: WETH (0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9)
 * 
 * Usage:
 * 1. Approve this wrapper to spend your WETH
 * 2. Call wrap(address, amount) to get confidential tokens
 * 3. Transfer confidentially using confidentialTransfer()
 * 4. Call unwrap(address, amount) to burn confidential tokens
 * 5. After decryption, call claimUnwrapped() to receive WETH
 */
contract WrappedETH is FHERC20Wrapper {
    constructor(address wethAddress)
        FHERC20Wrapper(
            wethAddress,         // Underlying WETH token
            "Confidential ETH",  // Name
            "cETH",             // Symbol
            18                   // Decimals (same as WETH)
        )
    {}
}
