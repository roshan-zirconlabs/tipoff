// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {TestUSDC} from "../src/testnet/TestUSDC.sol";

contract TestUSDCTest is Test {
    TestUSDC internal token;
    address internal judge = makeAddr("judge");

    function setUp() public {
        vm.warp(1_760_000_000);
        token = new TestUSDC();
    }

    function test_drip_ratelimitedPerRecipient() public {
        token.drip(judge);
        assertEq(token.balanceOf(judge), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(TestUSDC.FaucetCooldown.selector, block.timestamp + 1 hours));
        token.drip(judge);
        token.drip(makeAddr("other")); // other recipients unaffected
        vm.warp(block.timestamp + 1 hours);
        token.drip(judge);
        assertEq(token.balanceOf(judge), 2_000e6);
    }

    function test_permitDomainAndDecimals() public view {
        assertEq(token.decimals(), 6);
        (, string memory name, string memory version,,,,) = token.eip712Domain();
        assertEq(name, "Tipoff Test USD");
        assertEq(version, "1");
    }
}
