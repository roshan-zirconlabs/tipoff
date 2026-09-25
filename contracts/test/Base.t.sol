// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Tipoff} from "../src/Tipoff.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

abstract contract TipoffBase is Test {
    Tipoff internal tipoff;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal forwarder = makeAddr("forwarder");
    address internal relayer = makeAddr("relayer");

    uint256 internal sponsorPk = 0xA11CE;
    address internal sponsor = vm.addr(sponsorPk);
    uint256[] internal scoutPks;
    address[] internal scouts;

    uint256 internal constant FEE_BPS = 50; // 0.5%
    uint128 internal constant REWARD = 700e6; // divisible by 7 for clean 4/7, 2/7, 1/7 checks
    uint128 internal constant BOUNTY = 2_100e6; // three hits
    bytes32 internal constant SEAL_KEY = bytes32(uint256(0x5EA1));
    bytes32 internal constant WORKFLOW_ID = keccak256("tipoff-resolver");
    address internal workflowOwner = makeAddr("workflowOwner");

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        usdc = new MockUSDC();
        tipoff = new Tipoff(owner, feeRecipient, FEE_BPS);
        vm.startPrank(owner);
        tipoff.setAllowedToken(address(usdc), true);
        tipoff.setResolverConfig(forwarder, WORKFLOW_ID, workflowOwner);
        vm.stopPrank();

        for (uint256 i = 0; i < 6; ++i) {
            uint256 pk = 0xB0B0 + i;
            scoutPks.push(pk);
            scouts.push(vm.addr(pk));
        }
        usdc.mint(sponsor, 1_000_000e6);
        vm.prank(sponsor);
        usdc.approve(address(tipoff), type(uint256).max);
    }

    // ─── Builders ──────────────────────────────────────────────────────────────────────────────────────────────────

    function _params() internal view returns (Tipoff.ProgramParams memory p) {
        p = Tipoff.ProgramParams({
            token: address(usdc),
            bounty: BOUNTY,
            rewardPerHit: REWARD,
            tipDeadline: uint64(block.timestamp + 14 days),
            tailEnd: uint64(block.timestamp + 14 days + 90 days),
            claimWindow: 30 days,
            topK: 3,
            maxTipsPerScout: 3,
            sealKey: SEAL_KEY,
            evidenceSpec: bytes('{"kind":"evm-payment","treasuries":[]}'),
            metadata: '{"title":"Founders we will fund"}'
        });
    }

    function _create() internal returns (uint256 programId) {
        vm.prank(sponsor);
        programId = tipoff.createProgram(_params());
    }

    function _candidate(address who) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint8(1), abi.encodePacked(who)));
    }

    function _salt(uint256 scoutIndex, bytes32 candidateId) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", scoutIndex, candidateId));
    }

    function _commit(uint256 scoutIndex, uint256 programId, bytes32 candidateId) internal returns (uint256 tipId) {
        address scout = scouts[scoutIndex];
        bytes32 c = tipoff.commitmentOf(programId, scout, candidateId, _salt(scoutIndex, candidateId));
        vm.prank(scout);
        tipId = tipoff.commitTip(programId, c, hex"01", hex"02");
    }

    function _prove(uint256 scoutIndex, uint256 tipId, bytes32 candidateId) internal {
        tipoff.proveTip(tipId, candidateId, _salt(scoutIndex, candidateId));
    }

    function _metadata() internal view returns (bytes memory) {
        return abi.encodePacked(WORKFLOW_ID, bytes10("resolver"), workflowOwner, bytes2(0));
    }

    function _report(uint256 programId, bytes32 candidateId, uint64 actedAt) internal {
        vm.prank(forwarder);
        tipoff.onReport(_metadata(), abi.encode(programId, candidateId, actedAt, keccak256("tx")));
    }

    // ─── Signing ───────────────────────────────────────────────────────────────────────────────────────────────────

    function _sign(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", tipoff.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _commitSig(
        uint256 pk,
        uint256 programId,
        bytes32 commitment,
        bytes memory sponsorEnv,
        bytes memory scoutEnv,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 envHash = keccak256(abi.encode(keccak256(sponsorEnv), keccak256(scoutEnv)));
        return
            _sign(
                pk, keccak256(abi.encode(tipoff.COMMIT_TIP_TYPEHASH(), programId, commitment, envHash, nonce, deadline))
            );
    }

    function _permit(uint256 pk, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (Tipoff.PermitSig memory)
    {
        address holder = vm.addr(pk);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                holder,
                spender,
                value,
                usdc.nonces(holder),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return Tipoff.PermitSig({deadline: deadline, v: v, r: r, s: s});
    }
}
