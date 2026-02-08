// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
}

contract WrappedETH_V3 is ERC20 {
    IWETH public immutable weth;
    mapping(address => euint64) private _encryptedBalances;

    event Wrapped(address indexed user, uint256 amount);
    event Unwrapped(address indexed user, uint256 amount);
    event TransferEncrypted(address indexed from, address indexed to);

    constructor(address wethAddress) ERC20("Confidential ETH", "cETH") {
        weth = IWETH(wethAddress);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @notice Wrap native ETH -> cETH (mint ERC20 + set encrypted balance)
    function wrapETH() external payable {
        require(msg.value > 0, "Must send ETH");
        weth.deposit{value: msg.value}();
        _mint(msg.sender, msg.value);

        euint64 encAmount = FHE.asEuint64(uint64(msg.value));
        if (Common.isInitialized(_encryptedBalances[msg.sender])) {
            _encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
        } else {
            _encryptedBalances[msg.sender] = encAmount;
        }
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        emit Wrapped(msg.sender, msg.value);
    }

    /// @notice Wrap WETH -> cETH (mint ERC20 + set encrypted balance)
    function wrap(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(address(weth)).transferFrom(msg.sender, address(this), amount), "WETH transfer failed");
        _mint(msg.sender, amount);

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        if (Common.isInitialized(_encryptedBalances[msg.sender])) {
            _encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
        } else {
            _encryptedBalances[msg.sender] = encAmount;
        }
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        emit Wrapped(msg.sender, amount);
    }

    /// @notice Unwrap cETH -> native ETH (burn ERC20 + reduce encrypted balance)
    function unwrap(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        _burn(msg.sender, amount);

        // Also reduce encrypted balance
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        if (Common.isInitialized(_encryptedBalances[msg.sender])) {
            _encryptedBalances[msg.sender] = FHE.sub(_encryptedBalances[msg.sender], encAmount);
            FHE.allowThis(_encryptedBalances[msg.sender]);
            FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        }

        // Withdraw WETH to native ETH and send to user
        weth.withdraw(amount);
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");
        emit Unwrapped(msg.sender, amount);
    }

    /// @notice Confidential transfer - encrypted balance changes + ERC20 sync
    /// @param to Recipient address
    /// @param encryptedAmount FHE encrypted amount (InEuint64)
    /// @param plaintextAmount Plaintext amount for ERC20 balance sync
    function transferEncrypted(address to, InEuint64 memory encryptedAmount, uint256 plaintextAmount) external returns (euint64) {
        require(to != address(0), "Cannot transfer to zero address");
        require(balanceOf(msg.sender) >= plaintextAmount, "Insufficient ERC20 balance");

        euint64 amount = FHE.asEuint64(encryptedAmount);

        // Subtract from sender encrypted balance
        _encryptedBalances[msg.sender] = FHE.sub(_encryptedBalances[msg.sender], amount);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);

        // Add to receiver encrypted balance
        if (Common.isInitialized(_encryptedBalances[to])) {
            _encryptedBalances[to] = FHE.add(_encryptedBalances[to], amount);
        } else {
            _encryptedBalances[to] = amount;
        }
        FHE.allowThis(_encryptedBalances[to]);
        FHE.allow(_encryptedBalances[to], to);

        // Sync ERC20 balances so receiver can see balance & unwrap
        _transfer(msg.sender, to, plaintextAmount);

        emit TransferEncrypted(msg.sender, to);
        return _encryptedBalances[msg.sender];
    }

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _encryptedBalances[account];
    }

    /// @notice Allow contract to receive ETH (for WETH.withdraw)
    receive() external payable {}
}
