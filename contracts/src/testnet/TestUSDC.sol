// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title TestUSDC — worthless test dollars for Tipoff on Monad testnet.
/// @notice Six decimals and EIP-2612 permit, like Circle USDC, so the app's gasless flows are identical. Anyone can
///         drip FAUCET_AMOUNT to any address once per FAUCET_COOLDOWN, so judges and testers never need a captcha
///         faucet. Testnet only: it has no owner, no blocklist and no value.
contract TestUSDC is ERC20, ERC20Permit {
    uint256 public constant FAUCET_AMOUNT = 1_000e6;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address account => uint256) public lastDrip;

    error FaucetCooldown(uint256 availableAt);

    constructor() ERC20("Tipoff Test USD", "tUSD") ERC20Permit("Tipoff Test USD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Send FAUCET_AMOUNT to `to`. Callable by anyone (a relayer drips for gasless passkey accounts).
    function drip(address to) external {
        uint256 next = lastDrip[to] + FAUCET_COOLDOWN;
        if (lastDrip[to] != 0 && block.timestamp < next) revert FaucetCooldown(next);
        lastDrip[to] = block.timestamp;
        _mint(to, FAUCET_AMOUNT);
    }
}
