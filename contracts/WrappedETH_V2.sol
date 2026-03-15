// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@fhenixprotocol/contracts/FHERC20Wrapper.sol";

interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @title WrappedETH V2
 * @notice Confidential wrapper for native ETH on Sepolia testnet
 * @dev Accepts native ETH and wraps into encrypted FHERC20 tokens
 * 
 * Deployment:
 * - Network: Sepolia Testnet
 * - Underlying: WETH (0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9)
 * 
 * Usage - Direct ETH:
 * 1. Call wrapETH() with ETH value - get cETH back instantly
 * 2. Transfer confidentially using confidentialTransfer()
 * 3. Call unwrap(amount) to burn cETH
 * 4. Receive WETH back (can convert to ETH manually)
 */
contract WrappedETH_V2 is FHERC20Wrapper {
    IWETH public immutable weth;

    constructor(address wethAddress)
        FHERC20Wrapper(
            wethAddress,         // Underlying WETH token
            "Confidential ETH",  // Name
            "cETH",              // Symbol
            18                   // Decimals (same as WETH)
        )
    {
        weth = IWETH(wethAddress);
    }

    /**
     * @notice Wrap native ETH into confidential tokens (cETH)
     * @dev Converts ETH → WETH → cETH in one transaction
     */
    function wrapETH() external payable {
        require(msg.value > 0, "Must send ETH");
        
        // Step 1: Convert ETH to WETH
        weth.deposit{value: msg.value}();
        
        // Step 2: Approve wrapper contract to spend WETH
        weth.approve(address(this), msg.value);
        
        // Step 3: Wrap WETH into cETH using parent contract's wrap function
        wrap(msg.value);
    }

    /**
     * @notice Fallback to accept ETH and auto-wrap
     */
    receive() external payable {
        if (msg.value > 0) {
            weth.deposit{value: msg.value}();
            weth.approve(address(this), msg.value);
            wrap(msg.value);
        }
    }
}
