// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title WrappedETH_V4
 * @notice Fully confidential ETH wrapper - NO ERC20 inheritance
 * @dev All balances are encrypted. No plaintext amounts in events or storage.
 *      Only the user can see their own balance via cofhejs unseal.
 */
contract WrappedETH_V4 {
    IWETH public immutable weth;
    mapping(address => euint64) private _encryptedBalances;

    // Events intentionally do NOT include amounts
    event Wrapped(address indexed user);
    event Unwrapped(address indexed user);
    event ConfidentialTransfer(address indexed from, address indexed to);

    constructor(address wethAddress) {
        weth = IWETH(wethAddress);
    }

    /// @notice Returns token name
    function name() external pure returns (string memory) {
        return "Confidential ETH";
    }

    /// @notice Returns token symbol
    function symbol() external pure returns (string memory) {
        return "cETH";
    }

    /// @notice Returns token decimals
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /// @notice Wrap native ETH -> cETH (encrypted balance only)
    function wrapETH() external payable {
        require(msg.value > 0, "Must send ETH");
        
        // Deposit ETH into WETH contract
        weth.deposit{value: msg.value}();

        // Create encrypted amount and add to balance
        euint64 encAmount = FHE.asEuint64(uint64(msg.value));
        if (Common.isInitialized(_encryptedBalances[msg.sender])) {
            _encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
        } else {
            _encryptedBalances[msg.sender] = encAmount;
        }
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);

        emit Wrapped(msg.sender);
    }

    /// @notice Wrap WETH -> cETH (encrypted balance only)
    function wrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(address(weth)).transferFrom(msg.sender, address(this), amount), "WETH transfer failed");

        // Create encrypted amount and add to balance
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        if (Common.isInitialized(_encryptedBalances[msg.sender])) {
            _encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
        } else {
            _encryptedBalances[msg.sender] = encAmount;
        }
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);

        emit Wrapped(msg.sender);
    }

    /// @notice Unwrap cETH -> native ETH
    /// @dev Amount must match encrypted balance. FHE.sub will revert if insufficient.
    function unwrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(Common.isInitialized(_encryptedBalances[msg.sender]), "No encrypted balance");

        // Reduce encrypted balance (FHE.sub reverts on underflow)
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _encryptedBalances[msg.sender] = FHE.sub(_encryptedBalances[msg.sender], encAmount);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);

        // Withdraw WETH to native ETH and send to user
        weth.withdraw(amount);
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit Unwrapped(msg.sender);
    }

    /// @notice Fully confidential transfer - only encrypted amounts
    /// @param to Recipient address
    /// @param encryptedAmount FHE encrypted amount (InEuint64)
    function transferEncrypted(address to, InEuint64 memory encryptedAmount) external returns (euint64) {
        require(to != address(0), "Cannot transfer to zero address");
        require(to != msg.sender, "Cannot transfer to self");
        require(Common.isInitialized(_encryptedBalances[msg.sender]), "No encrypted balance");

        euint64 amount = FHE.asEuint64(encryptedAmount);

        // Subtract from sender (FHE.sub reverts on underflow)
        _encryptedBalances[msg.sender] = FHE.sub(_encryptedBalances[msg.sender], amount);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);

        // Add to receiver
        if (Common.isInitialized(_encryptedBalances[to])) {
            _encryptedBalances[to] = FHE.add(_encryptedBalances[to], amount);
        } else {
            _encryptedBalances[to] = amount;
        }
        FHE.allowThis(_encryptedBalances[to]);
        FHE.allow(_encryptedBalances[to], to);

        emit ConfidentialTransfer(msg.sender, to);
        return _encryptedBalances[msg.sender];
    }

    /// @notice Get encrypted balance (only owner can unseal via cofhejs)
    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _encryptedBalances[account];
    }

    /// @notice Allow contract to receive ETH (for WETH.withdraw)
    receive() external payable {}
}
