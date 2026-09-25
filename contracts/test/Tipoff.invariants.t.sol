// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Tipoff} from "../src/Tipoff.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Drives Tipoff through random, valid-looking sequences of every action.
contract Handler is Test {
    Tipoff internal tipoff;
    MockUSDC internal usdc;
    address internal sponsor = makeAddr("inv-sponsor");
    address internal forwarder;
    bytes internal metadata;
    address[4] internal scouts;
    bytes32[3] internal candidates;

    struct TipRecord {
        uint256 tipId;
        uint256 programId;
        address scout;
        bytes32 candidateId;
        bytes32 salt;
    }

    struct HitRecord {
        uint256 programId;
        bytes32 candidateId;
    }

    uint256[] public programIds;
    TipRecord[] internal tips;
    HitRecord[] internal hits;

    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;

    constructor(Tipoff tipoff_, MockUSDC usdc_, address forwarder_, bytes memory metadata_) {
        tipoff = tipoff_;
        usdc = usdc_;
        forwarder = forwarder_;
        metadata = metadata_;
        for (uint256 i = 0; i < 4; ++i) {
            scouts[i] = makeAddr(string(abi.encode("inv-scout", i)));
        }
        for (uint256 i = 0; i < 3; ++i) {
            candidates[i] = keccak256(abi.encode("candidate", i));
        }
        usdc.mint(sponsor, type(uint128).max);
        vm.prank(sponsor);
        usdc.approve(address(tipoff), type(uint256).max);
    }

    function createProgram(uint96 rawReward, uint8 rawHits, uint8 rawK) external {
        uint128 reward = uint128(bound(rawReward, 1, 1e12));
        uint128 bounty = reward * uint128(bound(rawHits, 1, 4));
        Tipoff.ProgramParams memory p = Tipoff.ProgramParams({
            token: address(usdc),
            bounty: bounty,
            rewardPerHit: reward,
            tipDeadline: uint64(block.timestamp + 7 days),
            tailEnd: uint64(block.timestamp + 7 days + 90 days),
            claimWindow: 7 days,
            topK: uint8(bound(rawK, 1, 5)),
            maxTipsPerScout: 5,
            sealKey: bytes32(uint256(1)),
            evidenceSpec: "",
            metadata: ""
        });
        vm.prank(sponsor);
        programIds.push(tipoff.createProgram(p));
        ghostDeposited += bounty;
    }

    function commit(uint256 pSeed, uint256 sSeed, uint256 cSeed) external {
        if (programIds.length == 0) return;
        uint256 id = programIds[pSeed % programIds.length];
        address scout = scouts[sSeed % 4];
        bytes32 candidate = candidates[cSeed % 3];
        bytes32 salt = keccak256(abi.encode(pSeed, sSeed, cSeed, tips.length));
        vm.prank(scout);
        try tipoff.commitTip(id, tipoff.commitmentOf(id, scout, candidate, salt), hex"01", "") returns (uint256 t) {
            tips.push(TipRecord(t, id, scout, candidate, salt));
        } catch {}
    }

    function resolve(uint256 pSeed, uint256 cSeed) external {
        if (programIds.length == 0) return;
        uint256 id = programIds[pSeed % programIds.length];
        bytes32 candidate = candidates[cSeed % 3];
        vm.prank(sponsor);
        try tipoff.resolve(id, candidate) {
            hits.push(HitRecord(id, candidate));
        } catch {}
    }

    function report(uint256 pSeed, uint256 cSeed, uint32 ago) external {
        if (programIds.length == 0) return;
        uint256 id = programIds[pSeed % programIds.length];
        bytes32 candidate = candidates[cSeed % 3];
        bool existed = tipoff.getHit(id, candidate).actedAt != 0;
        uint64 actedAt = uint64(block.timestamp - bound(ago, 0, 3 days));
        vm.prank(forwarder);
        try tipoff.onReport(metadata, abi.encode(id, candidate, actedAt, bytes32(0))) {
            if (!existed && tipoff.getHit(id, candidate).actedAt != 0) hits.push(HitRecord(id, candidate));
        } catch {}
    }

    function prove(uint256 tSeed) external {
        if (tips.length == 0) return;
        TipRecord memory t = tips[tSeed % tips.length];
        try tipoff.proveTip(t.tipId, t.candidateId, t.salt) {} catch {}
    }

    function settle(uint256 hSeed) external {
        if (hits.length == 0) return;
        HitRecord memory h = hits[hSeed % hits.length];
        try tipoff.settle(h.programId, h.candidateId) {} catch {}
    }

    function withdraw(uint256 pSeed) external {
        if (programIds.length == 0) return;
        uint256 id = programIds[pSeed % programIds.length];
        uint256 before = usdc.balanceOf(sponsor);
        vm.prank(sponsor);
        try tipoff.withdrawRemainder(id) {
            ghostWithdrawn += usdc.balanceOf(sponsor) - before;
        } catch {}
    }

    function warp(uint32 secondsForward) external {
        vm.warp(block.timestamp + bound(secondsForward, 1, 20 days));
    }

    // ─── Views for invariants ──────────────────────────────────────────────────────────────────────────────────────

    function lockedByAccounting() external view returns (uint256 total) {
        for (uint256 i = 0; i < programIds.length; ++i) {
            total += tipoff.getProgram(programIds[i]).available;
        }
        for (uint256 i = 0; i < hits.length; ++i) {
            Tipoff.Hit memory h = tipoff.getHit(hits[i].programId, hits[i].candidateId);
            if (!h.settled) total += h.reward;
        }
    }

    function paidToScoutsAndFees(address feeRecipient) external view returns (uint256 total) {
        for (uint256 i = 0; i < 4; ++i) {
            total += usdc.balanceOf(scouts[i]);
        }
        total += usdc.balanceOf(feeRecipient);
    }

    function hitCount() external view returns (uint256) {
        return hits.length;
    }

    function hitAt(uint256 i) external view returns (uint256, bytes32) {
        return (hits[i].programId, hits[i].candidateId);
    }
}

contract TipoffInvariantTest is Test {
    Tipoff internal tipoff;
    MockUSDC internal usdc;
    Handler internal handler;
    address internal feeRecipient = makeAddr("inv-fee");

    function setUp() public {
        vm.warp(1_760_000_000);
        usdc = new MockUSDC();
        address forwarder = makeAddr("inv-forwarder");
        tipoff = new Tipoff(address(this), feeRecipient, 50);
        tipoff.setAllowedToken(address(usdc), true);
        tipoff.setResolverConfig(forwarder, bytes32(0), address(0));
        handler = new Handler(tipoff, usdc, forwarder, abi.encodePacked(bytes32(0), bytes10(0), address(0)));
        targetContract(address(handler));
    }

    /// Every token the contract holds is owed to someone: unallocated bounty or an unsettled hit.
    function invariant_solvency() public view {
        assertEq(usdc.balanceOf(address(tipoff)), handler.lockedByAccounting());
    }

    /// Nothing is created or lost: deposits = still held + paid out + returned to sponsors.
    function invariant_conservation() public view {
        assertEq(
            handler.ghostDeposited(),
            usdc.balanceOf(address(tipoff)) + handler.paidToScoutsAndFees(feeRecipient) + handler.ghostWithdrawn()
        );
    }

    /// A hit never ranks more tips than its program pays, and ranked tips stay strictly in commit order.
    function invariant_rankedTipsAreOrderedAndBounded() public view {
        for (uint256 i = 0; i < handler.hitCount(); ++i) {
            (uint256 programId, bytes32 candidateId) = handler.hitAt(i);
            Tipoff.Hit memory h = tipoff.getHit(programId, candidateId);
            assertLe(h.proven, tipoff.getProgram(programId).topK);
            for (uint256 j = 1; j < h.proven; ++j) {
                assertLt(h.topTipIds[j - 1], h.topTipIds[j]);
            }
        }
    }
}
