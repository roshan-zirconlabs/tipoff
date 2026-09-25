// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TipoffBase} from "./Base.t.sol";
import {Tipoff} from "../src/Tipoff.sol";

contract TipoffFuzzTest is TipoffBase {
    bytes32 internal X;

    function setUp() public override {
        super.setUp();
        X = _candidate(makeAddr("founderX"));
    }

    function testFuzz_payoutSplit_isExactAndOrdered(uint128 net, uint8 rawN) public view {
        uint256 n = bound(rawN, 1, 5);
        uint256[] memory a = tipoff.payoutSplit(net, n);
        uint256 sum = 0;
        for (uint256 i = 0; i < n; ++i) {
            sum += a[i];
            if (i > 0) assertLe(a[i], a[i - 1], "earlier ranks never earn less");
        }
        assertEq(sum, net, "no value created or lost");
    }

    /// Rank depends only on commit order: whatever order five winning tips are proven in, the top 3 are the three
    /// earliest commits.
    function testFuzz_rankIgnoresProveOrder(uint256 seed) public {
        uint256 id = _create();
        uint256[5] memory tipIds;
        for (uint256 i = 0; i < 5; ++i) {
            tipIds[i] = _commit(i, id, X);
        }
        vm.warp(block.timestamp + 1);
        vm.prank(sponsor);
        tipoff.resolve(id, X);

        uint256[5] memory order = [uint256(0), 1, 2, 3, 4];
        for (uint256 i = 4; i > 0; --i) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }
        for (uint256 i = 0; i < 5; ++i) {
            uint256 s = order[i];
            try tipoff.proveTip(tipIds[s], X, _salt(s, X)) {} catch {}
        }

        Tipoff.Hit memory h = tipoff.getHit(id, X);
        assertEq(h.proven, 3);
        assertEq(h.topTipIds[0], tipIds[0]);
        assertEq(h.topTipIds[1], tipIds[1]);
        assertEq(h.topTipIds[2], tipIds[2]);
    }

    /// A tip committed at or after the action can never be proven, however long after.
    function testFuzz_tipAfterActionNeverCounts(uint32 gap) public {
        uint256 id = _create();
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        vm.warp(block.timestamp + bound(gap, 0, 13 days));
        uint256 t = _commit(0, id, X);
        vm.expectRevert(Tipoff.TipAfterAction.selector);
        _prove(0, t, X);
    }

    /// Settlement pays exactly the hit's reward: scouts + fee == reward, and the contract keeps the rest.
    function testFuzz_settleConservesValue(uint8 rawProven) public {
        uint256 proven = bound(rawProven, 0, 5);
        uint256 id = _create();
        uint256[] memory tipIds = new uint256[](proven);
        for (uint256 i = 0; i < proven; ++i) {
            tipIds[i] = _commit(i, id, X);
        }
        vm.warp(block.timestamp + 1);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        for (uint256 i = 0; i < proven; ++i) {
            try tipoff.proveTip(tipIds[i], X, _salt(i, X)) {} catch {}
        }
        uint256 before = usdc.balanceOf(address(tipoff));
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);

        uint256 paidOut = before - usdc.balanceOf(address(tipoff));
        if (proven == 0) {
            assertEq(paidOut, 0);
            assertEq(tipoff.getProgram(id).available, BOUNTY);
        } else {
            assertEq(paidOut, REWARD);
        }
    }
}
