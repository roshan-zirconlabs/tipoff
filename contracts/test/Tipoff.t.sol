// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TipoffBase} from "./Base.t.sol";
import {Tipoff} from "../src/Tipoff.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract TipoffTest is TipoffBase {
    bytes32 internal X; // the candidate the sponsor ends up acting on
    bytes32 internal Y; // a candidate nobody acts on

    function setUp() public override {
        super.setUp();
        X = _candidate(makeAddr("founderX"));
        Y = _candidate(makeAddr("founderY"));
    }

    // ─── Construction ──────────────────────────────────────────────────────────────────────────────────────────────

    function test_constructor_capsFee() public {
        vm.expectRevert(Tipoff.FeeTooHigh.selector);
        new Tipoff(owner, feeRecipient, 101);
    }

    function test_constructor_rejectsZeroFeeRecipient() public {
        vm.expectRevert(Tipoff.ZeroAddress.selector);
        new Tipoff(owner, address(0), 50);
    }

    function test_supportsInterface() public view {
        assertTrue(tipoff.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(tipoff.supportsInterface(type(IERC165).interfaceId));
        assertFalse(tipoff.supportsInterface(0xdeadbeef));
    }

    function test_adminIsOwnerOnly() public {
        vm.expectRevert();
        tipoff.setAllowedToken(address(usdc), false);
        vm.expectRevert();
        tipoff.setResolverConfig(address(1), bytes32(0), address(0));
    }

    // ─── Create ────────────────────────────────────────────────────────────────────────────────────────────────────

    function test_createProgram_locksBounty() public {
        uint256 before = usdc.balanceOf(sponsor);
        uint256 id = _create();
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(tipoff)), BOUNTY);
        assertEq(usdc.balanceOf(sponsor), before - BOUNTY);

        Tipoff.Program memory p = tipoff.getProgram(id);
        assertEq(p.sponsor, sponsor);
        assertEq(p.available, BOUNTY);
        assertEq(p.rewardPerHit, REWARD);
        assertEq(p.topK, 3);
        assertEq(p.createdAt, block.timestamp);
        assertEq(p.evidenceHash, keccak256(_params().evidenceSpec));
    }

    function test_createProgram_rejectsDisallowedToken() public {
        Tipoff.ProgramParams memory p = _params();
        p.token = address(0xBEEF);
        vm.prank(sponsor);
        vm.expectRevert(Tipoff.TokenNotAllowed.selector);
        tipoff.createProgram(p);
    }

    function test_createProgram_rejectsInvalidParams() public {
        Tipoff.ProgramParams[] memory bad = new Tipoff.ProgramParams[](13);
        for (uint256 i = 0; i < bad.length; ++i) {
            bad[i] = _params();
        }
        bad[0].rewardPerHit = 0;
        bad[1].bounty = REWARD - 1;
        bad[2].bounty = REWARD + 1; // not a multiple
        bad[3].topK = 0;
        bad[4].topK = 6;
        bad[5].maxTipsPerScout = 0;
        bad[6].sealKey = bytes32(0);
        bad[7].tipDeadline = uint64(block.timestamp);
        bad[8].tailEnd = bad[8].tipDeadline + 90 days - 1;
        bad[9].claimWindow = 7 days - 1;
        bad[10].evidenceSpec = new bytes(2049);
        bad[11].baseWeight = 0;
        bad[12].curveDepth = 0;
        for (uint256 i = 0; i < bad.length; ++i) {
            vm.prank(sponsor);
            vm.expectRevert(Tipoff.InvalidParams.selector);
            tipoff.createProgram(bad[i]);
        }
    }

    function test_createProgramFor_withPermit_noGasNoApproval() public {
        uint256 pk = 0x5905;
        address s = vm.addr(pk);
        usdc.mint(s, BOUNTY);
        Tipoff.ProgramParams memory p = _params();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(
            pk, keccak256(abi.encode(tipoff.CREATE_PROGRAM_TYPEHASH(), tipoff.hashProgramParams(p), 0, deadline))
        );
        Tipoff.PermitSig memory permit = _permit(pk, address(tipoff), BOUNTY, deadline);

        vm.prank(relayer);
        uint256 id = tipoff.createProgramFor(p, s, deadline, sig, permit);
        assertEq(tipoff.getProgram(id).sponsor, s);
        assertEq(usdc.balanceOf(address(tipoff)), BOUNTY);
        assertEq(tipoff.nonces(s), 1);

        // Replaying the same intent fails: the nonce moved on.
        vm.prank(relayer);
        vm.expectRevert(Tipoff.InvalidSignature.selector);
        tipoff.createProgramFor(p, s, deadline, sig, permit);
    }

    function test_createProgramFor_rejectsTamperedParams() public {
        Tipoff.ProgramParams memory p = _params();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(
            sponsorPk, keccak256(abi.encode(tipoff.CREATE_PROGRAM_TYPEHASH(), tipoff.hashProgramParams(p), 0, deadline))
        );
        p.rewardPerHit = BOUNTY; // relayer changes terms
        Tipoff.PermitSig memory none;
        vm.expectRevert(Tipoff.InvalidSignature.selector);
        tipoff.createProgramFor(p, sponsor, deadline, sig, none);
    }

    function test_createProgramFor_rejectsExpired() public {
        Tipoff.PermitSig memory none;
        vm.expectRevert(Tipoff.Expired.selector);
        tipoff.createProgramFor(_params(), sponsor, block.timestamp - 1, "", none);
    }

    // ─── Commit ────────────────────────────────────────────────────────────────────────────────────────────────────

    function test_commit_recordsOrderedTips() public {
        uint256 id = _create();
        uint256 t1 = _commit(0, id, X);
        uint256 t2 = _commit(1, id, X);
        assertEq(t1, 1);
        assertEq(t2, 2);
        assertEq(tipoff.getProgram(id).tipCount, 2);
        assertEq(tipoff.tipsByScout(id, scouts[0]), 1);
        Tipoff.Tip memory t = tipoff.getTip(t1);
        assertEq(t.scout, scouts[0]);
        assertEq(t.programId, id);
        assertEq(t.committedAt, block.timestamp);
    }

    function test_commit_emitsEnvelopes() public {
        uint256 id = _create();
        bytes32 c = keccak256("c");
        vm.expectEmit(true, true, true, true);
        emit Tipoff.TipCommitted(id, 1, scouts[0], c, 0, hex"aa", hex"bb");
        vm.prank(scouts[0]);
        tipoff.commitTip(_in(id, c, 0, hex"aa", hex"bb"));
    }

    function test_commit_rejectsAfterDeadline() public {
        uint256 id = _create();
        vm.warp(_params().tipDeadline + 1);
        vm.prank(scouts[0]);
        vm.expectRevert(Tipoff.TippingClosed.selector);
        tipoff.commitTip(_in(id, keccak256("c"), 0, hex"01", ""));
    }

    function test_commit_rejectsSponsor() public {
        uint256 id = _create();
        vm.prank(sponsor);
        vm.expectRevert(Tipoff.SponsorCannotTip.selector);
        tipoff.commitTip(_in(id, keccak256("c"), 0, hex"01", ""));
    }

    function test_commit_enforcesTipLimit() public {
        uint256 id = _create();
        for (uint256 i = 0; i < 3; ++i) {
            vm.prank(scouts[0]);
            tipoff.commitTip(_in(id, keccak256(abi.encode(i)), 0, hex"01", ""));
        }
        vm.prank(scouts[0]);
        vm.expectRevert(Tipoff.TipLimitReached.selector);
        tipoff.commitTip(_in(id, keccak256("4"), 0, hex"01", ""));
    }

    function test_commit_rejectsBadInput() public {
        uint256 id = _create();
        vm.startPrank(scouts[0]);
        vm.expectRevert(Tipoff.InvalidParams.selector);
        tipoff.commitTip(_in(id, bytes32(0), 0, hex"01", ""));
        vm.expectRevert(Tipoff.InvalidParams.selector);
        tipoff.commitTip(_in(id, keccak256("c"), 0, "", ""));
        vm.expectRevert(Tipoff.InvalidParams.selector);
        tipoff.commitTip(_in(id, keccak256("c"), 0, new bytes(1025), ""));
        vm.expectRevert(Tipoff.ProgramNotFound.selector);
        tipoff.commitTip(_in(99, keccak256("c"), 0, hex"01", ""));
        vm.stopPrank();
    }

    function test_commitTipFor_relayed() public {
        uint256 id = _create();
        bytes32 c = keccak256("c");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _commitSig(scoutPks[0], id, c, 0, hex"aa", hex"bb", 0, deadline);

        vm.prank(relayer);
        uint256 tipId = tipoff.commitTipFor(scouts[0], _in(id, c, 0, hex"aa", hex"bb"), deadline, sig, _noPermit());
        assertEq(tipoff.getTip(tipId).scout, scouts[0]);

        vm.prank(relayer);
        vm.expectRevert(Tipoff.InvalidSignature.selector); // replay
        tipoff.commitTipFor(scouts[0], _in(id, c, 0, hex"aa", hex"bb"), deadline, sig, _noPermit());
    }

    function test_commitTipFor_rejectsSwappedEnvelope() public {
        uint256 id = _create();
        bytes32 c = keccak256("c");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _commitSig(scoutPks[0], id, c, 0, hex"aa", hex"bb", 0, deadline);
        vm.prank(relayer);
        vm.expectRevert(Tipoff.InvalidSignature.selector);
        tipoff.commitTipFor(scouts[0], _in(id, c, 0, hex"cc", hex"bb"), deadline, sig, _noPermit());
    }

    function test_commitTipFor_rejectsWrongSignerAndExpiry() public {
        uint256 id = _create();
        bytes32 c = keccak256("c");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _commitSig(scoutPks[1], id, c, 0, hex"aa", "", 0, deadline);
        vm.expectRevert(Tipoff.InvalidSignature.selector);
        tipoff.commitTipFor(scouts[0], _in(id, c, 0, hex"aa", ""), deadline, sig, _noPermit());

        vm.expectRevert(Tipoff.Expired.selector);
        tipoff.commitTipFor(scouts[0], _in(id, c, 0, hex"aa", ""), block.timestamp - 1, sig, _noPermit());
    }

    // ─── Stakes ────────────────────────────────────────────────────────────────────────────────────────────────────

    function test_stake_isHeldAndEmitted() public {
        uint256 id = _create();
        uint256 t = _commitStaked(0, id, X, 25e6);
        assertEq(tipoff.getTip(t).stake, 25e6);
        assertEq(tipoff.getProgram(id).staked, 25e6);
        assertEq(usdc.balanceOf(address(tipoff)), BOUNTY + 25e6);
    }

    function test_stake_enforcesMinimum() public {
        Tipoff.ProgramParams memory p = _params();
        p.minStake = 5e6;
        vm.prank(sponsor);
        uint256 id = tipoff.createProgram(p);
        vm.prank(scouts[0]);
        vm.expectRevert(Tipoff.StakeTooLow.selector);
        tipoff.commitTip(_in(id, keccak256("c"), 5e6 - 1, hex"01", ""));
        _commitStaked(0, id, X, 5e6);
    }

    function test_returnStake_lockedWhileTippingThenAlwaysRefunded() public {
        uint256 id = _create();
        uint256 t = _commitStaked(0, id, X, 25e6);
        uint256 free = _commit(1, id, X);
        vm.expectRevert(Tipoff.StakeLocked.selector);
        tipoff.returnStake(t);

        vm.warp(_params().tipDeadline + 1);
        vm.prank(relayer); // permissionless, but always pays the scout
        tipoff.returnStake(t);
        assertEq(usdc.balanceOf(scouts[0]), 25e6);
        assertEq(tipoff.getProgram(id).staked, 0);
        assertTrue(tipoff.getTip(t).stakeReturned);

        vm.expectRevert(Tipoff.NothingToReturn.selector);
        tipoff.returnStake(t);
        vm.expectRevert(Tipoff.NothingToReturn.selector);
        tipoff.returnStake(free);
        vm.expectRevert(Tipoff.TipNotFound.selector);
        tipoff.returnStake(99);
    }

    /// Conviction raises a tip's share, but an earlier free tip still leads: the curve rewards timing first.
    function test_settle_stakeBuysSharesButTimingLeads() public {
        uint256 id = _create();
        uint256 early = _commit(0, id, X); // w = 100: 50 shares
        uint256 late = _commitStaked(1, id, X, 900e6); // w = 1000 after S = 100: 41.67 shares (16.67 unstaked)
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, early, X);
        _prove(1, late, X);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);

        uint256 net = REWARD - (uint256(REWARD) * FEE_BPS) / 10_000;
        uint256 lateShares = 41_666_666;
        assertEq(usdc.balanceOf(scouts[1]), (net * lateShares) / (50e6 + lateShares));
        assertGt(usdc.balanceOf(scouts[0]), usdc.balanceOf(scouts[1]));
        assertGt(usdc.balanceOf(scouts[1]), (net * 16_666_666) / (50e6 + 16_666_666), "stake beat free");
    }

    /// Settlement uses the stake recorded at commit, so pulling a stake before settling changes nothing.
    function test_settle_ignoresReturnedStakes() public {
        uint256 id = _create();
        uint256 a = _commit(0, id, X);
        uint256 b = _commitStaked(1, id, X, 900e6);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, a, X);
        _prove(1, b, X);
        vm.warp(_params().tipDeadline + 1);
        tipoff.returnStake(b);
        uint256 refunded = usdc.balanceOf(scouts[1]);
        assertEq(refunded, 900e6);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);
        uint256 net = REWARD - (uint256(REWARD) * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(scouts[1]) - refunded, (net * 41_666_666) / (50e6 + 41_666_666));
    }

    function test_commitTipFor_withStakeAndPermit() public {
        uint256 id = _create();
        bytes32 c = keccak256("c");
        uint128 stake = 10e6;
        usdc.mint(scouts[0], stake);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _commitSig(scoutPks[0], id, c, stake, hex"aa", "", 0, deadline);
        Tipoff.PermitSig memory permit = _permit(scoutPks[0], address(tipoff), stake, deadline);

        vm.prank(relayer);
        uint256 t = tipoff.commitTipFor(scouts[0], _in(id, c, stake, hex"aa", ""), deadline, sig, permit);
        assertEq(tipoff.getTip(t).stake, stake);
        assertEq(usdc.balanceOf(scouts[0]), 0);
    }

    function test_commitTipFor_rejectsInflatedStake() public {
        uint256 id = _create();
        bytes32 c = keccak256("c");
        usdc.mint(scouts[0], 100e6);
        vm.prank(scouts[0]);
        usdc.approve(address(tipoff), 100e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _commitSig(scoutPks[0], id, c, 1e6, hex"aa", "", 0, deadline);
        vm.prank(relayer);
        vm.expectRevert(Tipoff.InvalidSignature.selector);
        tipoff.commitTipFor(scouts[0], _in(id, c, 100e6, hex"aa", ""), deadline, sig, _noPermit());
    }

    // ─── Resolve (sponsor) ─────────────────────────────────────────────────────────────────────────────────────────

    function test_resolve_duringWindow_claimsOpenAfterDeadline() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 1 days);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        Tipoff.Hit memory h = tipoff.getHit(id, X);
        assertEq(h.actedAt, block.timestamp);
        assertEq(h.claimDeadline, tipoff.getProgram(id).tipDeadline + 30 days); // claims open once tipping closes
        assertEq(h.source, tipoff.SOURCE_SPONSOR());
        assertEq(h.reward, REWARD);
        assertEq(tipoff.getProgram(id).available, BOUNTY, "declared hits are funded by the sponsor, not the bond");
        assertEq(tipoff.getProgram(id).openHits, 1);
    }

    function test_resolve_afterWindow_claimsFromNow() public {
        uint256 id = _create();
        Tipoff.Program memory p = tipoff.getProgram(id);
        vm.warp(p.tipDeadline + 5 days);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        assertEq(tipoff.getHit(id, X).claimDeadline, block.timestamp + 30 days);
    }

    function test_resolve_onlySponsor_once() public {
        uint256 id = _create();
        vm.expectRevert(Tipoff.NotSponsor.selector);
        tipoff.resolve(id, X);
        vm.startPrank(sponsor);
        tipoff.resolve(id, X);
        vm.expectRevert(Tipoff.AlreadyActed.selector);
        tipoff.resolve(id, X);
        vm.stopPrank();
    }

    function test_evidence_bountyExhaustion_recordsWithoutPaying() public {
        uint256 id = _create(); // bond covers 3 evidence hits
        _report(id, keccak256("a"), uint64(block.timestamp));
        _report(id, keccak256("b"), uint64(block.timestamp));
        _report(id, keccak256("c"), uint64(block.timestamp));
        _report(id, keccak256("d"), uint64(block.timestamp));
        Tipoff.Hit memory h = tipoff.getHit(id, keccak256("d"));
        assertEq(h.reward, 0);
        assertTrue(h.settled);
        assertEq(tipoff.getProgram(id).openHits, 3);
        assertEq(tipoff.getProgram(id).available, 0);
    }

    /// Audit H-1 regression: declared hits are paid from the sponsor's wallet, never from the bond, so sham hits on a
    /// sponsor's own sybil's candidates can't starve the real hire's evidence hit.
    function test_shamDeclaredHitsCannotDrainTheBond() public {
        uint256 id = _create();
        bytes32 realHire = _candidate(makeAddr("realHire"));
        uint256 honest = _commit(0, id, realHire);
        uint256 now_ = block.timestamp; // forge caches block.timestamp within a test; track time explicitly
        for (uint256 i = 0; i < 3; ++i) {
            bytes32 junk = _candidate(address(uint160(0x5A30 + i)));
            uint256 t = _commit(5, id, junk);
            now_ += 1 minutes;
            vm.warp(now_);
            vm.prank(sponsor);
            tipoff.resolve(id, junk);
            _prove(5, t, junk);
        }
        assertEq(tipoff.getProgram(id).available, BOUNTY, "declared hits never touch the bond");

        _report(id, realHire, uint64(now_));
        assertEq(tipoff.getHit(id, realHire).reward, REWARD);
        _prove(0, honest, realHire);
        vm.warp(tipoff.getHit(id, realHire).claimDeadline + 1);
        tipoff.settle(id, realHire);
        assertEq(usdc.balanceOf(scouts[0]), REWARD - (uint256(REWARD) * FEE_BPS) / 10_000);
    }

    function test_resolve_pullsRewardFromSponsor_andRefundsIfUnclaimed() public {
        uint256 id = _create();
        uint256 before = usdc.balanceOf(sponsor);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        assertEq(usdc.balanceOf(sponsor), before - REWARD);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);
        assertEq(usdc.balanceOf(sponsor), before, "unclaimed declared hit refunded to the sponsor");
        assertEq(tipoff.getProgram(id).available, BOUNTY);
    }

    function test_resolveFor_withPermit() public {
        uint256 pk = 0x5905;
        address s = vm.addr(pk);
        usdc.mint(s, BOUNTY + REWARD);
        Tipoff.ProgramParams memory p = _params();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(
            pk, keccak256(abi.encode(tipoff.CREATE_PROGRAM_TYPEHASH(), tipoff.hashProgramParams(p), 0, deadline))
        );
        uint256 id = tipoff.createProgramFor(p, s, deadline, sig, _permit(pk, address(tipoff), BOUNTY, deadline));
        bytes memory rsig = _sign(pk, keccak256(abi.encode(tipoff.RESOLVE_TYPEHASH(), id, X, 1, deadline)));
        Tipoff.PermitSig memory permit = _permit(pk, address(tipoff), REWARD, deadline);
        vm.prank(relayer);
        tipoff.resolveFor(id, X, deadline, rsig, permit);
        assertEq(usdc.balanceOf(s), 0);
        assertEq(tipoff.getHit(id, X).reward, REWARD);
    }

    /// Audit M-2 regression: a tip sent less than MIN_TIP_AGE before the action (a mempool front-run) never counts.
    function test_tipInsideMinAgeNeverCounts() public {
        uint256 id = _create();
        uint256 late = _commit(1, id, X);
        vm.warp(block.timestamp + tipoff.MIN_TIP_AGE() - 1);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        vm.expectRevert(Tipoff.TipAfterAction.selector);
        _prove(1, late, X);
    }

    /// Audit L-1 regression: a blocklisted winner can't block settlement; their payout waits for them.
    function test_settle_blocklistedScoutIsDeferred() public {
        uint256 id = _create();
        uint256 a = _commit(0, id, X);
        uint256 b = _commit(1, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, a, X);
        _prove(1, b, X);
        usdc.setBlocked(scouts[1], true);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);
        assertGt(usdc.balanceOf(scouts[0]), 0, "other winners paid");
        uint256 owed = tipoff.owed(address(usdc), scouts[1]);
        assertGt(owed, 0);
        assertEq(tipoff.totalOwed(address(usdc)), owed);
        assertEq(tipoff.getProgram(id).openHits, 0, "sponsor is not blocked");

        vm.prank(scouts[1]);
        vm.expectRevert(); // still blocked: the token's blocklist applies, funds can't be redirected
        tipoff.withdrawOwed(address(usdc));
        usdc.setBlocked(scouts[1], false);
        vm.prank(scouts[1]);
        tipoff.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(scouts[1]), owed);
        assertEq(tipoff.totalOwed(address(usdc)), 0);
    }

    function test_withdrawOwedFor_relayedToSignerOnly() public {
        uint256 id = _create();
        uint256 a = _commit(1, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(1, a, X);
        usdc.setBlocked(scouts[1], true);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);
        usdc.setBlocked(scouts[1], false);
        uint256 owed = tipoff.owed(address(usdc), scouts[1]);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(
            scoutPks[1], keccak256(abi.encode(tipoff.WITHDRAW_OWED_TYPEHASH(), address(usdc), uint256(0), deadline))
        );
        vm.expectRevert(Tipoff.InvalidSignature.selector); // someone else's account can't use this signature
        tipoff.withdrawOwedFor(address(usdc), scouts[2], deadline, sig);
        vm.prank(relayer);
        tipoff.withdrawOwedFor(address(usdc), scouts[1], deadline, sig);
        assertEq(usdc.balanceOf(scouts[1]), owed);
        vm.expectRevert(Tipoff.InvalidSignature.selector); // replay
        tipoff.withdrawOwedFor(address(usdc), scouts[1], deadline, sig);
    }

    /// Audit M-1 regression: evidence always names one workflow; a foreign workflow's report is rejected.
    function test_resolverConfig_requiresWorkflow_andRejectsForeignReports() public {
        vm.startPrank(owner);
        vm.expectRevert(Tipoff.InvalidParams.selector);
        tipoff.setResolverConfig(forwarder, bytes32(0), workflowOwner);
        vm.expectRevert(Tipoff.InvalidParams.selector);
        tipoff.setResolverConfig(forwarder, WORKFLOW_ID, address(0));
        vm.stopPrank();

        uint256 id = _create();
        bytes memory foreign = abi.encodePacked(keccak256("other"), bytes10("x"), workflowOwner, bytes2(0));
        vm.prank(forwarder);
        vm.expectRevert(Tipoff.UnexpectedWorkflow.selector);
        tipoff.onReport(foreign, abi.encode(id, X, uint64(block.timestamp), bytes32(0)));
    }

    /// Audit L-2 regression: once programs exist, a new resolver waits RESOLVER_DELAY; disabling is immediate.
    function test_resolverConfig_timelockedOncePrograms() public {
        _create();
        address next = makeAddr("nextForwarder");
        vm.prank(owner);
        tipoff.setResolverConfig(next, WORKFLOW_ID, workflowOwner);
        assertEq(tipoff.forwarder(), forwarder, "not applied yet");
        vm.expectRevert(Tipoff.TooEarly.selector);
        tipoff.applyResolverConfig();
        vm.warp(block.timestamp + tipoff.RESOLVER_DELAY());
        tipoff.applyResolverConfig();
        assertEq(tipoff.forwarder(), next);
        vm.expectRevert(Tipoff.NothingPending.selector);
        tipoff.applyResolverConfig();

        vm.prank(owner);
        tipoff.setResolverConfig(address(0), bytes32(0), address(0));
        assertEq(tipoff.forwarder(), address(0), "disable is immediate");
    }

    function test_resolve_closedAfterTailGrace() public {
        uint256 id = _create();
        Tipoff.Program memory p = tipoff.getProgram(id);
        vm.warp(uint256(p.tailEnd) + p.claimWindow + 1);
        vm.prank(sponsor);
        vm.expectRevert(Tipoff.ActedOutsideWindow.selector);
        tipoff.resolve(id, X);
    }

    function test_resolveFor_relayedBySponsorSignature() public {
        uint256 id = _create();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig =
            _sign(sponsorPk, keccak256(abi.encode(tipoff.RESOLVE_TYPEHASH(), id, X, tipoff.nonces(sponsor), deadline)));
        vm.prank(relayer);
        tipoff.resolveFor(id, X, deadline, sig, _noPermit());
        assertEq(tipoff.getHit(id, X).source, tipoff.SOURCE_SPONSOR());

        // A scout's signature cannot resolve for the sponsor.
        bytes memory bad = _sign(
            scoutPks[0], keccak256(abi.encode(tipoff.RESOLVE_TYPEHASH(), id, Y, tipoff.nonces(sponsor), deadline))
        );
        vm.expectRevert(Tipoff.InvalidSignature.selector);
        tipoff.resolveFor(id, Y, deadline, bad, _noPermit());
    }

    // ─── onReport (evidence) ───────────────────────────────────────────────────────────────────────────────────────

    function test_onReport_recordsEvidenceHit() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 2 days);
        uint64 actedAt = uint64(block.timestamp - 1 hours);
        _report(id, X, actedAt);
        Tipoff.Hit memory h = tipoff.getHit(id, X);
        assertEq(h.actedAt, actedAt);
        assertEq(h.source, tipoff.SOURCE_EVIDENCE());
    }

    function test_onReport_onlyForwarder() public {
        uint256 id = _create();
        vm.expectRevert(Tipoff.NotForwarder.selector);
        tipoff.onReport(_metadata(), abi.encode(id, X, uint64(block.timestamp), bytes32(0)));
    }

    function test_onReport_checksWorkflowIdentity() public {
        uint256 id = _create();
        bytes memory report = abi.encode(id, X, uint64(block.timestamp), bytes32(0));
        vm.startPrank(forwarder);
        vm.expectRevert(Tipoff.UnexpectedWorkflow.selector);
        tipoff.onReport(abi.encodePacked(keccak256("other"), bytes10("resolver"), workflowOwner), report);
        vm.expectRevert(Tipoff.UnexpectedWorkflow.selector);
        tipoff.onReport(abi.encodePacked(WORKFLOW_ID, bytes10("resolver"), address(0xBAD)), report);
        vm.expectRevert(Tipoff.UnexpectedWorkflow.selector);
        tipoff.onReport(hex"00", report);
        vm.stopPrank();
    }

    function test_onReport_duplicateIsIgnored() public {
        uint256 id = _create();
        uint64 t = uint64(block.timestamp);
        _report(id, X, t);
        vm.warp(block.timestamp + 1 hours);
        _report(id, X, uint64(block.timestamp)); // no revert
        assertEq(tipoff.getHit(id, X).actedAt, t);
        assertEq(tipoff.getProgram(id).openHits, 1);
    }

    function test_onReport_rejectsActionsOutsideWindow() public {
        uint256 id = _create();
        Tipoff.Program memory p = tipoff.getProgram(id);
        vm.startPrank(forwarder);
        vm.expectRevert(Tipoff.ActedOutsideWindow.selector); // before the program existed
        tipoff.onReport(_metadata(), abi.encode(id, X, p.createdAt - 1, bytes32(0)));
        vm.expectRevert(Tipoff.ActedOutsideWindow.selector); // in the future
        tipoff.onReport(_metadata(), abi.encode(id, X, uint64(block.timestamp + 1), bytes32(0)));
        vm.warp(p.tailEnd + 2 days);
        vm.expectRevert(Tipoff.ActedOutsideWindow.selector); // after the tail
        tipoff.onReport(_metadata(), abi.encode(id, X, p.tailEnd + 1, bytes32(0)));
        vm.stopPrank();
    }

    function test_onReport_lateEvidenceForTailActionIsAccepted() public {
        uint256 id = _create();
        Tipoff.Program memory p = tipoff.getProgram(id);
        vm.warp(p.tailEnd + 3 days); // evidence lands after the tail, action inside it
        _report(id, X, p.tailEnd - 1);
        assertEq(tipoff.getHit(id, X).actedAt, p.tailEnd - 1);
    }

    // ─── Prove ─────────────────────────────────────────────────────────────────────────────────────────────────────

    function test_prove_ranksByCommitOrder_notProveOrder() public {
        uint256 id = _create();
        uint256 t0 = _commit(0, id, X);
        uint256 t1 = _commit(1, id, X);
        uint256 t2 = _commit(2, id, X);
        uint256 t3 = _commit(3, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);

        _prove(3, t3, X);
        _prove(1, t1, X);
        _prove(0, t0, X); // top is now [t0, t1, t3]
        _prove(2, t2, X); // t2 slots in before t3, which drops off

        Tipoff.Hit memory h = tipoff.getHit(id, X);
        assertEq(h.proven, 3);
        assertEq(h.topTipIds[0], t0);
        assertEq(h.topTipIds[1], t1);
        assertEq(h.topTipIds[2], t2);
    }

    function test_prove_lateTipCannotEnterFullTop() public {
        uint256 id = _create();
        uint256 t0 = _commit(0, id, X);
        uint256 t1 = _commit(1, id, X);
        uint256 t2 = _commit(2, id, X);
        uint256 t3 = _commit(3, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, t0, X);
        _prove(1, t1, X);
        _prove(2, t2, X);
        vm.expectRevert(Tipoff.NotInTopK.selector);
        _prove(3, t3, X);
    }

    function test_prove_rejectsWrongSaltAndCandidate() public {
        uint256 id = _create();
        uint256 t0 = _commit(0, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.startPrank(sponsor);
        tipoff.resolve(id, X);
        tipoff.resolve(id, Y);
        vm.stopPrank();
        vm.expectRevert(Tipoff.InvalidProof.selector);
        tipoff.proveTip(t0, X, keccak256("wrong"));
        vm.expectRevert(Tipoff.InvalidProof.selector); // the tip was for X, not Y
        tipoff.proveTip(t0, Y, _salt(0, X));
        vm.expectRevert(Tipoff.NoHit.selector);
        tipoff.proveTip(t0, keccak256("never-acted"), _salt(0, X));
        vm.expectRevert(Tipoff.TipNotFound.selector);
        tipoff.proveTip(999, X, _salt(0, X));
    }

    function test_prove_rejectsTipCommittedAfterAction() public {
        uint256 id = _create();
        vm.prank(sponsor);
        tipoff.resolve(id, X); // acts first
        uint256 t0 = _commit(0, id, X); // same block, not strictly before
        vm.expectRevert(Tipoff.TipAfterAction.selector);
        _prove(0, t0, X);
    }

    function test_prove_rejectsAfterClaimDeadlineAndDuplicates() public {
        uint256 id = _create();
        uint256 t0 = _commit(0, id, X);
        uint256 t1 = _commit(1, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, t0, X);
        vm.expectRevert(Tipoff.AlreadyProven.selector);
        _prove(0, t0, X);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        vm.expectRevert(Tipoff.ClaimClosed.selector);
        _prove(1, t1, X);
    }

    // ─── Settle ────────────────────────────────────────────────────────────────────────────────────────────────────

    function test_settle_paysCurveSplitAndFee() public {
        uint256 id = _create();
        uint256[3] memory t;
        for (uint256 i = 0; i < 3; ++i) {
            t[i] = _commit(i, id, X);
        }
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        for (uint256 i = 0; i < 3; ++i) {
            _prove(i, t[i], X);
        }

        vm.expectRevert(Tipoff.ClaimStillOpen.selector);
        tipoff.settle(id, X);

        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);

        // Free tips with base weight == depth buy 1/2, 1/6 and 1/12 of the depth in shares: a 6/9, 2/9, 1/9 split.
        uint256 fee = (uint256(REWARD) * FEE_BPS) / 10_000; // 3.5 USDC
        uint256 net = REWARD - fee;
        uint256 total = 50e6 + 16_666_666 + 8_333_333;
        assertEq(usdc.balanceOf(feeRecipient), fee);
        assertEq(usdc.balanceOf(scouts[1]), (net * 16_666_666) / total);
        assertEq(usdc.balanceOf(scouts[2]), (net * 8_333_333) / total);
        assertEq(
            usdc.balanceOf(scouts[0]), net - usdc.balanceOf(scouts[1]) - usdc.balanceOf(scouts[2]), "rank 0 takes dust"
        );
        assertApproxEqRel(usdc.balanceOf(scouts[0]), (net * 6) / 9, 1e12);
        assertEq(tipoff.getProgram(id).openHits, 0);
        assertTrue(tipoff.getHit(id, X).settled);

        vm.expectRevert(Tipoff.AlreadySettled.selector);
        tipoff.settle(id, X);
    }

    function test_settle_loneFinderTakesAll() public {
        uint256 id = _create();
        uint256 t0 = _commit(0, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, t0, X);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);
        uint256 fee = (uint256(REWARD) * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(scouts[0]), REWARD - fee);
    }

    function test_settle_unclaimedRewardReturnsToPool() public {
        uint256 id = _create();
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);
        assertEq(tipoff.getProgram(id).available, BOUNTY);
        assertEq(usdc.balanceOf(feeRecipient), 0);
    }

    // ─── Withdraw ──────────────────────────────────────────────────────────────────────────────────────────────────

    function test_withdraw_onlyAfterTailAndSettlement() public {
        uint256 id = _create();
        uint256 t0 = _commit(0, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, t0, X);

        Tipoff.Program memory p = tipoff.getProgram(id);
        vm.prank(sponsor);
        vm.expectRevert(Tipoff.TailNotOver.selector);
        tipoff.withdrawRemainder(id);

        vm.warp(uint256(p.tailEnd) + p.claimWindow + 1);
        vm.expectRevert(Tipoff.NotSponsor.selector);
        tipoff.withdrawRemainder(id);

        // The hit's claim window closed long ago, but it is unsettled: the sponsor must settle (pay) first.
        vm.prank(sponsor);
        vm.expectRevert(Tipoff.HitsOpen.selector);
        tipoff.withdrawRemainder(id);

        tipoff.settle(id, X);
        uint256 before = usdc.balanceOf(sponsor);
        vm.prank(sponsor);
        tipoff.withdrawRemainder(id);
        assertEq(usdc.balanceOf(sponsor), before + BOUNTY, "the whole bond comes back");
        assertEq(tipoff.getProgram(id).available, 0);
    }

    function test_withdrawRemainderFor_relayed() public {
        uint256 id = _create();
        Tipoff.Program memory p = tipoff.getProgram(id);
        vm.warp(uint256(p.tailEnd) + p.claimWindow + 1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig =
            _sign(sponsorPk, keccak256(abi.encode(tipoff.WITHDRAW_TYPEHASH(), id, tipoff.nonces(sponsor), deadline)));
        uint256 before = usdc.balanceOf(sponsor);
        vm.prank(relayer);
        tipoff.withdrawRemainderFor(id, deadline, sig);
        assertEq(usdc.balanceOf(sponsor), before + BOUNTY); // funds go to the sponsor, never the relayer
        assertEq(usdc.balanceOf(relayer), 0);
    }

    // ─── The backdoor deal ─────────────────────────────────────────────────────────────────────────────────────────

    /// @notice The sponsor sees a tip, waits out the window, pays the founder from its treasury and never resolves.
    ///         Evidence resolves it anyway and the scouts are paid.
    function test_backdoorDealStillPaysScouts() public {
        uint256 id = _create();
        uint256 t0 = _commit(0, id, X);
        uint256 t1 = _commit(1, id, X);

        Tipoff.Program memory p = tipoff.getProgram(id);
        vm.warp(p.tipDeadline + 60 days); // well after tipping closed, inside the tail
        uint64 paidAt = uint64(block.timestamp);
        _report(id, X, paidAt); // CRE saw the treasury → founder transfer

        _prove(0, t0, X);
        _prove(1, t1, X);
        vm.warp(tipoff.getHit(id, X).claimDeadline + 1);
        tipoff.settle(id, X);

        uint256 net = REWARD - (uint256(REWARD) * FEE_BPS) / 10_000;
        uint256 second = (net * 16_666_666) / (50e6 + 16_666_666); // shares 50 : 16.67, so 3/4 and 1/4
        assertEq(usdc.balanceOf(scouts[1]), second);
        assertEq(usdc.balanceOf(scouts[0]), net - second);
    }
}
