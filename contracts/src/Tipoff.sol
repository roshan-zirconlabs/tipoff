// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @title Tipoff — sealed scout markets with enforceable finder's fees.
/// @notice A sponsor locks a bounty for a kind of opportunity. Scouts commit sealed tips, optionally backed by a
///         refundable stake. When the sponsor acts on a candidate — declared by the sponsor, or proven by evidence
///         delivered through Chainlink CRE — the scouts who tipped it are paid by conviction and timing. The bounty
///         stays locked through a tail period, so acting after the window, or without resolving, still pays.
/// @dev Sealed bonding curve: the chain sees each tip's stake but never its candidate, so no price can exist while
///      tipping is open — except for the sponsor, who can decrypt every tip and so sees each candidate's implied price
///      privately. At settlement the curve is replayed over the proven tips in commit order: tip i with weight
///      w = baseWeight + stake buys depth²·w / ((depth + S)(depth + S + w)) shares, where S is the weight committed
///      to that candidate before it. Earlier and bigger conviction buys cheaper shares. Stakes are always refunded,
///      so nobody can lose money. Losing tips are never revealed.
contract Tipoff is EIP712, Nonces, ReentrancyGuardTransient, Ownable2Step, IReceiver {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────────────────────────────────────────

    uint256 public constant MAX_FEE_BPS = 100; // 1% hard cap
    uint8 public constant MAX_TOP_K = 5;
    uint64 public constant MIN_TAIL = 90 days;
    uint32 public constant MIN_CLAIM_WINDOW = 7 days;
    uint256 public constant MAX_ENVELOPE_BYTES = 1024;
    uint256 public constant MAX_SPEC_BYTES = 2048;
    uint256 public constant MAX_METADATA_BYTES = 4096;

    /// @notice A tip must predate the action by this much. The action's transaction names the candidate while it is
    ///         pending, so without a margin a mempool watcher could tip it in an earlier block and still be paid.
    uint64 public constant MIN_TIP_AGE = 60;
    /// @notice Once programs exist, a new resolver only takes effect after this delay, so scouts and sponsors can see
    ///         who will deliver evidence before it can act. Disabling evidence is immediate.
    uint64 public constant RESOLVER_DELAY = 2 days;

    uint8 public constant SOURCE_SPONSOR = 1;
    uint8 public constant SOURCE_EVIDENCE = 2;

    bytes32 public constant CREATE_PROGRAM_TYPEHASH =
        keccak256("CreateProgram(bytes32 paramsHash,uint256 nonce,uint256 deadline)");
    bytes32 public constant RESOLVE_TYPEHASH =
        keccak256("Resolve(uint256 programId,bytes32 candidateId,uint256 nonce,uint256 deadline)");
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("WithdrawRemainder(uint256 programId,uint256 nonce,uint256 deadline)");
    bytes32 public constant WITHDRAW_OWED_TYPEHASH =
        keccak256("WithdrawOwed(address token,uint256 nonce,uint256 deadline)");
    bytes32 public constant COMMIT_TIP_TYPEHASH = keccak256(
        "CommitTip(uint256 programId,bytes32 commitment,uint256 stake,bytes32 envelopesHash,uint256 nonce,uint256 deadline)"
    );

    uint256 public immutable feeBps;
    address public immutable feeRecipient;

    // ─── Types ───────────────────────────────────────────────────────────────────────────────────────────────────

    struct ProgramParams {
        address token;
        uint128 bounty;
        uint128 rewardPerHit;
        uint64 tipDeadline;
        uint64 tailEnd;
        uint32 claimWindow;
        uint8 topK;
        uint16 maxTipsPerScout;
        uint128 baseWeight; // weight every tip carries before its stake — free tips still count
        uint128 minStake; // smallest stake a tip must carry (0 = staking optional)
        uint128 curveDepth; // curve depth L: how fast shares get dearer as weight piles onto a candidate
        bytes32 sealKey; // sponsor X25519 public key; tips are encrypted to it
        bytes evidenceSpec; // JSON: how the evidence resolver recognises the sponsor acting
        string metadata; // JSON: title, brief, what counts as a candidate
    }

    struct TipInput {
        uint256 programId;
        bytes32 commitment;
        uint128 stake;
        bytes sponsorEnvelope;
        bytes scoutEnvelope;
    }

    struct PermitSig {
        uint256 deadline; // 0 = skip permit (allowance already set)
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct PendingResolver {
        address forwarder;
        bytes32 workflowId;
        address workflowOwner;
        uint64 eta;
    }

    struct Program {
        address sponsor;
        uint64 tipDeadline;
        uint32 tipCount;
        address token;
        uint64 tailEnd;
        uint32 claimWindow;
        uint128 rewardPerHit;
        uint128 available;
        bytes32 sealKey;
        bytes32 evidenceHash;
        uint64 createdAt;
        uint8 topK;
        uint16 maxTipsPerScout;
        uint32 openHits;
        uint128 baseWeight;
        uint128 minStake;
        uint128 curveDepth;
        uint128 staked; // stakes held for this program, not yet returned
    }

    struct Tip {
        address scout;
        uint64 committedAt;
        uint32 programId;
        bytes32 commitment;
        uint128 stake;
        bool stakeReturned;
    }

    struct Hit {
        uint64 actedAt;
        uint64 claimDeadline;
        uint8 source;
        uint8 proven;
        bool settled;
        uint128 reward;
        uint32[5] topTipIds; // ascending tip ids = commit order, first `proven` entries used
    }

    // ─── Storage ─────────────────────────────────────────────────────────────────────────────────────────────────

    uint256 public programCount;
    uint256 public tipCount;

    mapping(uint256 programId => Program) internal _programs;
    mapping(uint256 tipId => Tip) internal _tips;
    mapping(uint256 programId => mapping(bytes32 candidateId => Hit)) internal _hits;
    mapping(uint256 programId => mapping(address scout => uint16)) public tipsByScout;
    mapping(uint256 tipId => bool) public tipProven;
    mapping(address token => bool) public allowedToken;

    address public forwarder;
    bytes32 public expectedWorkflowId;
    address public expectedWorkflowOwner;
    PendingResolver public pendingResolver;

    /// @notice Payouts whose transfer failed (e.g. a blocklisted recipient), held for the recipient to pull later so
    ///         one bad recipient can never block a settlement.
    mapping(address token => mapping(address account => uint256)) public owed;
    mapping(address token => uint256) public totalOwed;

    // ─── Events ──────────────────────────────────────────────────────────────────────────────────────────────────

    event ProgramCreated(
        uint256 indexed programId,
        address indexed sponsor,
        address indexed token,
        uint128 bounty,
        uint128 rewardPerHit,
        uint64 tipDeadline,
        uint64 tailEnd,
        uint32 claimWindow,
        uint8 topK,
        uint16 maxTipsPerScout,
        uint128 baseWeight,
        uint128 minStake,
        uint128 curveDepth,
        bytes32 sealKey,
        bytes evidenceSpec,
        string metadata
    );
    event TipCommitted(
        uint256 indexed programId,
        uint256 indexed tipId,
        address indexed scout,
        bytes32 commitment,
        uint128 stake,
        bytes sponsorEnvelope,
        bytes scoutEnvelope
    );
    event StakeReturned(uint256 indexed programId, uint256 indexed tipId, address indexed scout, uint128 amount);
    event CandidateActed(
        uint256 indexed programId,
        bytes32 indexed candidateId,
        uint8 source,
        uint64 actedAt,
        uint64 claimDeadline,
        uint128 reward,
        bytes32 evidenceRef
    );
    event TipProven(uint256 indexed programId, bytes32 indexed candidateId, uint256 indexed tipId, address scout);
    event HitSettled(
        uint256 indexed programId,
        bytes32 indexed candidateId,
        uint256[] tipIds,
        address[] scouts,
        uint256[] amounts,
        uint256 fee,
        uint256 returned
    );
    event RemainderWithdrawn(uint256 indexed programId, address indexed sponsor, uint256 amount);
    event TokenAllowed(address indexed token, bool allowed);
    event ResolverConfigured(address indexed forwarder, bytes32 workflowId, address indexed workflowOwner);
    event ResolverProposed(address indexed forwarder, bytes32 workflowId, address indexed workflowOwner, uint64 eta);
    event PaymentDeferred(address indexed token, address indexed account, uint256 amount);
    event OwedWithdrawn(address indexed token, address indexed account, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────────────────────────────────────────

    error FeeTooHigh();
    error ZeroAddress();
    error TokenNotAllowed();
    error InvalidParams();
    error ProgramNotFound();
    error TipNotFound();
    error Expired();
    error InvalidSignature();
    error TippingClosed();
    error SponsorCannotTip();
    error TipLimitReached();
    error NotSponsor();
    error NotForwarder();
    error UnexpectedWorkflow();
    error AlreadyActed();
    error ActedOutsideWindow();
    error ResolutionClosed();
    error NoHit();
    error AlreadySettled();
    error ClaimClosed();
    error ClaimStillOpen();
    error InvalidProof();
    error TipAfterAction();
    error AlreadyProven();
    error NotInTopK();
    error TailNotOver();
    error HitsOpen();
    error StakeTooLow();
    error StakeLocked();
    error NothingToReturn();
    error NothingPending();
    error TooEarly();

    // ─── Construction & admin ────────────────────────────────────────────────────────────────────────────────────

    constructor(address owner_, address feeRecipient_, uint256 feeBps_) EIP712("Tipoff", "1") Ownable(owner_) {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    /// @notice Allow a payout token. Only plain ERC-20s (USDC, AUSD) — no fee-on-transfer or rebasing tokens.
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// @notice Configure the CRE forwarder and the only workflow (id and owner) allowed to deliver evidence through it.
    ///         Both workflow fields are required: the production forwarder delivers any workflow's report to whatever
    ///         receiver it names. A zero forwarder disables evidence resolution, immediately. Any other change takes
    ///         effect at once only before the first program exists; after that it waits RESOLVER_DELAY and is applied
    ///         with `applyResolverConfig`.
    function setResolverConfig(address forwarder_, bytes32 workflowId, address workflowOwner) external onlyOwner {
        if (forwarder_ != address(0) && (workflowId == bytes32(0) || workflowOwner == address(0))) {
            revert InvalidParams();
        }
        if (programCount == 0 || forwarder_ == address(0)) {
            delete pendingResolver;
            _applyResolver(forwarder_, workflowId, workflowOwner);
            return;
        }
        uint64 eta = _now() + RESOLVER_DELAY;
        pendingResolver =
            PendingResolver({forwarder: forwarder_, workflowId: workflowId, workflowOwner: workflowOwner, eta: eta});
        emit ResolverProposed(forwarder_, workflowId, workflowOwner, eta);
    }

    /// @notice Apply a proposed resolver once its delay has passed. Permissionless.
    function applyResolverConfig() external {
        PendingResolver memory r = pendingResolver;
        if (r.eta == 0) revert NothingPending();
        if (block.timestamp < r.eta) revert TooEarly();
        delete pendingResolver;
        _applyResolver(r.forwarder, r.workflowId, r.workflowOwner);
    }

    function _applyResolver(address forwarder_, bytes32 workflowId, address workflowOwner) internal {
        forwarder = forwarder_;
        expectedWorkflowId = workflowId;
        expectedWorkflowOwner = workflowOwner;
        emit ResolverConfigured(forwarder_, workflowId, workflowOwner);
    }

    // ─── Sponsor: create ─────────────────────────────────────────────────────────────────────────────────────────

    function createProgram(ProgramParams calldata p) external nonReentrant returns (uint256 programId) {
        programId = _createProgram(msg.sender, p);
    }

    /// @notice Create a program for `sponsor` from a signed intent, pulling the bounty with an EIP-2612 permit, so a
    ///         passkey sponsor never needs gas.
    function createProgramFor(
        ProgramParams calldata p,
        address sponsor,
        uint256 deadline,
        bytes calldata sponsorSig,
        PermitSig calldata permit
    ) external nonReentrant returns (uint256 programId) {
        _verify(
            sponsor,
            keccak256(abi.encode(CREATE_PROGRAM_TYPEHASH, hashProgramParams(p), _useNonce(sponsor), deadline)),
            deadline,
            sponsorSig
        );
        if (permit.deadline != 0) {
            // A front-run permit leaves the allowance in place; the transfer below is the real check.
            try IERC20Permit(p.token)
                .permit(sponsor, address(this), p.bounty, permit.deadline, permit.v, permit.r, permit.s) {}
                catch {}
        }
        programId = _createProgram(sponsor, p);
    }

    function _createProgram(address sponsor, ProgramParams calldata p) internal returns (uint256 programId) {
        if (!allowedToken[p.token]) revert TokenNotAllowed();
        if (
            p.rewardPerHit == 0 || p.bounty < p.rewardPerHit || p.bounty % p.rewardPerHit != 0 || p.topK == 0
                || p.topK > MAX_TOP_K || p.maxTipsPerScout == 0 || p.sealKey == bytes32(0)
                || p.tipDeadline <= block.timestamp || p.tailEnd < p.tipDeadline + MIN_TAIL
                || p.claimWindow < MIN_CLAIM_WINDOW || p.evidenceSpec.length > MAX_SPEC_BYTES
                || bytes(p.metadata).length > MAX_METADATA_BYTES || p.baseWeight == 0 || p.curveDepth == 0
        ) revert InvalidParams();

        programId = ++programCount;
        if (programId > type(uint32).max) revert InvalidParams();
        _programs[programId] = Program({
            sponsor: sponsor,
            tipDeadline: p.tipDeadline,
            tipCount: 0,
            token: p.token,
            tailEnd: p.tailEnd,
            claimWindow: p.claimWindow,
            rewardPerHit: p.rewardPerHit,
            available: p.bounty,
            sealKey: p.sealKey,
            evidenceHash: keccak256(p.evidenceSpec),
            createdAt: _now(),
            topK: p.topK,
            maxTipsPerScout: p.maxTipsPerScout,
            openHits: 0,
            baseWeight: p.baseWeight,
            minStake: p.minStake,
            curveDepth: p.curveDepth,
            staked: 0
        });

        // Only the token's permit may run before this (try/catch, result ignored); no state depends on it.
        // forge-lint: disable-next-item(reentrancy-events)
        emit ProgramCreated(
            programId,
            sponsor,
            p.token,
            p.bounty,
            p.rewardPerHit,
            p.tipDeadline,
            p.tailEnd,
            p.claimWindow,
            p.topK,
            p.maxTipsPerScout,
            p.baseWeight,
            p.minStake,
            p.curveDepth,
            p.sealKey,
            p.evidenceSpec,
            p.metadata
        );

        // `sponsor` is msg.sender or the verified signer of a CreateProgram intent.
        // forge-lint: disable-next-line(arbitrary-send-erc20)
        IERC20(p.token).safeTransferFrom(sponsor, address(this), p.bounty);
    }

    // ─── Scout: commit ───────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Commit a sealed tip directly (scout pays gas and approves any stake). Always available, so the relayer
    ///         cannot censor.
    function commitTip(TipInput calldata tip) external nonReentrant returns (uint256 tipId) {
        tipId = _commit(msg.sender, tip);
    }

    /// @notice Commit a sealed tip from the scout's signed intent (relayer pays gas). The signature covers the stake
    ///         and both envelopes, so the relayer cannot change either; an EIP-2612 permit funds the stake.
    function commitTipFor(
        address scout,
        TipInput calldata tip,
        uint256 deadline,
        bytes calldata sig,
        PermitSig calldata permit
    ) external nonReentrant returns (uint256 tipId) {
        _verify(
            scout,
            keccak256(
                abi.encode(
                    COMMIT_TIP_TYPEHASH,
                    tip.programId,
                    tip.commitment,
                    tip.stake,
                    envelopesHash(tip.sponsorEnvelope, tip.scoutEnvelope),
                    _useNonce(scout),
                    deadline
                )
            ),
            deadline,
            sig
        );
        if (tip.stake != 0 && permit.deadline != 0) {
            // A front-run permit leaves the allowance in place; the transfer in _commit is the real check.
            try IERC20Permit(_program(tip.programId).token)
                .permit(scout, address(this), tip.stake, permit.deadline, permit.v, permit.r, permit.s) {}
                catch {}
        }
        tipId = _commit(scout, tip);
    }

    function _commit(address scout, TipInput calldata tip) internal returns (uint256 tipId) {
        uint256 programId = tip.programId;
        Program storage p = _program(programId);
        if (block.timestamp > p.tipDeadline) revert TippingClosed();
        if (scout == p.sponsor) revert SponsorCannotTip();
        if (
            tip.commitment == bytes32(0) || tip.sponsorEnvelope.length == 0
                || tip.sponsorEnvelope.length > MAX_ENVELOPE_BYTES || tip.scoutEnvelope.length > MAX_ENVELOPE_BYTES
        ) revert InvalidParams();
        if (tip.stake < p.minStake) revert StakeTooLow();
        uint16 used = tipsByScout[programId][scout];
        if (used >= p.maxTipsPerScout) revert TipLimitReached();

        tipsByScout[programId][scout] = used + 1;
        p.tipCount += 1;
        p.staked += tip.stake;
        tipId = ++tipCount;
        if (tipId > type(uint32).max) revert InvalidParams();
        _tips[tipId] = Tip({
            scout: scout,
            committedAt: _now(),
            // Bounded above: programId <= type(uint32).max.
            // forge-lint: disable-next-line(unsafe-typecast)
            programId: uint32(programId),
            commitment: tip.commitment,
            stake: tip.stake,
            stakeReturned: false
        });

        // Only the token's permit or an ERC-1271 staticcall can precede this; the stake transfer comes after.
        // forge-lint: disable-next-item(reentrancy-events)
        emit TipCommitted(programId, tipId, scout, tip.commitment, tip.stake, tip.sponsorEnvelope, tip.scoutEnvelope);

        if (tip.stake != 0) {
            // `scout` is msg.sender or the verified signer of a CommitTip intent that names this stake.
            // forge-lint: disable-next-line(arbitrary-send-erc20)
            IERC20(p.token).safeTransferFrom(scout, address(this), tip.stake);
        }
    }

    /// @notice Return a tip's stake once tipping has closed — win or lose. Permissionless; funds go to the scout.
    ///         Returning a stake never changes a payout: shares use the stake recorded at commit time.
    function returnStake(uint256 tipId) external nonReentrant {
        Tip storage t = _tips[tipId];
        if (t.scout == address(0)) revert TipNotFound();
        if (t.stake == 0 || t.stakeReturned) revert NothingToReturn();
        Program storage p = _programs[t.programId];
        if (block.timestamp <= p.tipDeadline) revert StakeLocked();

        t.stakeReturned = true;
        p.staked -= t.stake;
        emit StakeReturned(t.programId, tipId, t.scout, t.stake);
        IERC20(p.token).safeTransfer(t.scout, t.stake);
    }

    // ─── Resolution ──────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice The honest path: the sponsor declares it acts on a candidate now and pays the hit's reward from its
    ///         wallet. The locked bounty is a bond only evidence can spend, so declaring sham hits (say, on candidates a
    ///         sponsor's own sybil tipped) can never drain what backs the backdoor-deal guarantee. The sponsor cannot
    ///         backdate — every tip committed before this block counts. An unclaimed declared hit is refunded to the
    ///         sponsor at settlement, which is also how a sponsor publicly excludes a candidate it already knew.
    function resolve(uint256 programId, bytes32 candidateId) external nonReentrant {
        _resolve(msg.sender, programId, candidateId);
    }

    /// @notice `resolve` from the sponsor's signed intent (relayer pays gas); an EIP-2612 permit funds the reward.
    function resolveFor(
        uint256 programId,
        bytes32 candidateId,
        uint256 deadline,
        bytes calldata sig,
        PermitSig calldata permit
    ) external nonReentrant {
        Program storage p = _program(programId);
        address sponsor = p.sponsor;
        _verify(
            sponsor,
            keccak256(abi.encode(RESOLVE_TYPEHASH, programId, candidateId, _useNonce(sponsor), deadline)),
            deadline,
            sig
        );
        if (permit.deadline != 0) {
            // A front-run permit leaves the allowance in place; the transfer in _resolve is the real check.
            try IERC20Permit(p.token)
                .permit(sponsor, address(this), p.rewardPerHit, permit.deadline, permit.v, permit.r, permit.s) {}
                catch {}
        }
        _resolve(sponsor, programId, candidateId);
    }

    function _resolve(address caller, uint256 programId, bytes32 candidateId) internal {
        Program storage p = _program(programId);
        if (caller != p.sponsor) revert NotSponsor();
        if (_hits[programId][candidateId].actedAt != 0) revert AlreadyActed();
        _recordHit(programId, p, candidateId, _now(), SOURCE_SPONSOR, bytes32(0));
        // `caller` is the sponsor: msg.sender or the verified signer of a Resolve intent.
        // forge-lint: disable-next-line(arbitrary-send-erc20)
        IERC20(p.token).safeTransferFrom(caller, address(this), p.rewardPerHit);
    }

    /// @notice The enforcement path: a Chainlink CRE workflow reports that evidence shows the sponsor acted.
    /// @dev report = abi.encode(uint256 programId, bytes32 candidateId, uint64 actedAt, bytes32 evidenceRef).
    ///      Duplicate reports are ignored so workflow retries never fail.
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder || forwarder == address(0)) revert NotForwarder();
        if (metadata.length < 62) revert UnexpectedWorkflow();
        bytes32 workflowId = bytes32(metadata[0:32]);
        address workflowOwner = address(bytes20(metadata[42:62]));
        if (workflowId != expectedWorkflowId || workflowOwner != expectedWorkflowOwner) revert UnexpectedWorkflow();

        (uint256 programId, bytes32 candidateId, uint64 actedAt, bytes32 evidenceRef) =
            abi.decode(report, (uint256, bytes32, uint64, bytes32));
        Program storage p = _program(programId);
        if (actedAt > block.timestamp) revert ActedOutsideWindow();
        if (_hits[programId][candidateId].actedAt != 0) return;
        _recordHit(programId, p, candidateId, actedAt, SOURCE_EVIDENCE, evidenceRef);
    }

    function _recordHit(
        uint256 programId,
        Program storage p,
        bytes32 candidateId,
        uint64 actedAt,
        uint8 source,
        bytes32 evidenceRef
    ) internal {
        if (actedAt < p.createdAt || actedAt > p.tailEnd) revert ActedOutsideWindow();
        // Evidence for an action inside the tail may arrive a little later; one claim window of grace.
        if (block.timestamp > uint256(p.tailEnd) + p.claimWindow) revert ResolutionClosed();

        uint128 reward;
        if (source == SOURCE_SPONSOR) {
            reward = p.rewardPerHit; // funded by the sponsor in _resolve, never from the bond
        } else {
            reward = p.available < p.rewardPerHit ? p.available : p.rewardPerHit;
            p.available -= reward;
        }
        uint64 claimFrom = block.timestamp > p.tipDeadline ? _now() : p.tipDeadline;
        uint64 claimDeadline = claimFrom + p.claimWindow;

        Hit storage h = _hits[programId][candidateId];
        h.actedAt = actedAt;
        h.claimDeadline = claimDeadline;
        h.source = source;
        h.reward = reward;
        if (reward == 0) {
            h.settled = true; // bounty exhausted: the action is on record, nothing to pay
        } else {
            p.openHits += 1;
        }

        // Only an ERC-1271 staticcall (relayed signature check) can precede this.
        // forge-lint: disable-next-line(reentrancy-events)
        emit CandidateActed(programId, candidateId, source, actedAt, claimDeadline, reward, evidenceRef);
    }

    // ─── Claims ──────────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Open a winning tip. Permissionless — the payout always goes to the tip's scout. Rank is commit order,
    ///         so the order in which tips are proven never matters.
    function proveTip(uint256 tipId, bytes32 candidateId, bytes32 salt) external {
        Tip storage t = _tips[tipId];
        if (t.scout == address(0)) revert TipNotFound();
        uint256 programId = t.programId;
        Hit storage h = _hits[programId][candidateId];
        if (h.actedAt == 0) revert NoHit();
        if (h.settled) revert AlreadySettled();
        if (block.timestamp > h.claimDeadline) revert ClaimClosed();
        if (tipProven[tipId]) revert AlreadyProven();
        if (commitmentOf(programId, t.scout, candidateId, salt) != t.commitment) revert InvalidProof();
        if (uint256(t.committedAt) + MIN_TIP_AGE > h.actedAt) revert TipAfterAction();

        uint8 k = _programs[programId].topK;
        uint8 n = h.proven;
        // Tip ids are bounded by type(uint32).max at commit time.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 id = uint32(tipId);
        // Find the insertion point in the ascending list.
        uint8 pos = n;
        while (pos > 0 && h.topTipIds[pos - 1] > id) {
            pos--;
        }
        if (pos >= k) revert NotInTopK();
        uint8 end = n < k ? n : k - 1; // when full, the last entry drops off
        for (uint8 i = end; i > pos; i--) {
            h.topTipIds[i] = h.topTipIds[i - 1];
        }
        h.topTipIds[pos] = id;
        if (n < k) h.proven = n + 1;
        tipProven[tipId] = true;

        emit TipProven(programId, candidateId, tipId, t.scout);
    }

    /// @notice Pay a hit after its claim window. Permissionless.
    function settle(uint256 programId, bytes32 candidateId) external nonReentrant {
        Program storage p = _program(programId);
        Hit storage h = _hits[programId][candidateId];
        if (h.actedAt == 0) revert NoHit();
        if (h.settled) revert AlreadySettled();
        if (block.timestamp <= h.claimDeadline) revert ClaimStillOpen();

        h.settled = true;
        p.openHits -= 1;

        uint256 n = h.proven;
        uint128 reward = h.reward;
        uint256[] memory tipIds = new uint256[](n);
        address[] memory scouts = new address[](n);
        uint256[] memory amounts = new uint256[](n);

        if (n == 0) {
            emit HitSettled(programId, candidateId, tipIds, scouts, amounts, 0, reward);
            // Unclaimed: a declared hit's reward goes back to the sponsor who paid it; an evidence hit's to the bond.
            if (h.source == SOURCE_SPONSOR) _pay(IERC20(p.token), p.sponsor, reward);
            else p.available += reward;
            return;
        }

        uint256 fee = (reward * feeBps) / 10_000;
        uint256[] memory weights = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            tipIds[i] = h.topTipIds[i];
            Tip storage t = _tips[tipIds[i]];
            scouts[i] = t.scout;
            weights[i] = uint256(p.baseWeight) + t.stake;
        }
        uint256[] memory split = splitByShares(reward - fee, curveShares(p.curveDepth, weights));
        for (uint256 i = 0; i < n; ++i) {
            amounts[i] = split[i];
        }

        // Every transfer comes after this event; the guard blocks re-entry.
        // forge-lint: disable-next-line(reentrancy-events)
        emit HitSettled(programId, candidateId, tipIds, scouts, amounts, fee, 0);

        IERC20 token = IERC20(p.token);
        if (fee != 0) _pay(token, feeRecipient, fee);
        for (uint256 i = 0; i < n; ++i) {
            _pay(token, scouts[i], amounts[i]);
        }
    }

    /// @notice Pull a payout that couldn't be pushed. Pays only the account it's owed to — never redirected, so a
    ///         token's blocklist still applies.
    function withdrawOwed(address token) external nonReentrant {
        _withdrawOwed(token, msg.sender);
    }

    /// @notice `withdrawOwed` from the account's signed intent (relayer pays gas). Funds go to the signer only.
    function withdrawOwedFor(address token, address account, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        _verify(
            account, keccak256(abi.encode(WITHDRAW_OWED_TYPEHASH, token, _useNonce(account), deadline)), deadline, sig
        );
        _withdrawOwed(token, account);
    }

    function _withdrawOwed(address token, address account) internal {
        uint256 amount = owed[token][account];
        if (amount == 0) revert NothingToReturn();
        owed[token][account] = 0;
        totalOwed[token] -= amount;
        // Only an ERC-1271 staticcall (relayed signature check) can precede this; the transfer comes after.
        // forge-lint: disable-next-line(reentrancy-events)
        emit OwedWithdrawn(token, account, amount);
        IERC20(token).safeTransfer(account, amount);
    }

    /// @dev Push a payout; if the token refuses it (blocklist, paused), hold it for `withdrawOwed` instead of reverting.
    function _pay(IERC20 token, address to, uint256 amount) internal {
        if (amount == 0 || token.trySafeTransfer(to, amount)) return;
        owed[address(token)][to] += amount;
        totalOwed[address(token)] += amount;
        // Records that the transfer just attempted failed; callers are nonReentrant.
        // forge-lint: disable-next-line(reentrancy-events)
        emit PaymentDeferred(address(token), to, amount);
    }

    /// @notice Return the unallocated bounty to the sponsor once the tail and its grace period are over.
    function withdrawRemainder(uint256 programId) external nonReentrant {
        _withdraw(msg.sender, programId);
    }

    /// @notice `withdrawRemainder` from the sponsor's signed intent (relayer pays gas). Funds go to the sponsor.
    function withdrawRemainderFor(uint256 programId, uint256 deadline, bytes calldata sig) external nonReentrant {
        address sponsor = _program(programId).sponsor;
        _verify(
            sponsor, keccak256(abi.encode(WITHDRAW_TYPEHASH, programId, _useNonce(sponsor), deadline)), deadline, sig
        );
        _withdraw(sponsor, programId);
    }

    function _withdraw(address caller, uint256 programId) internal {
        Program storage p = _program(programId);
        if (caller != p.sponsor) revert NotSponsor();
        if (block.timestamp <= uint256(p.tailEnd) + p.claimWindow) revert TailNotOver();
        if (p.openHits != 0) revert HitsOpen();
        uint256 amount = p.available;
        p.available = 0;
        // Only an ERC-1271 staticcall (relayed signature check) can precede this; the transfer comes after.
        // forge-lint: disable-next-line(reentrancy-events)
        emit RemainderWithdrawn(programId, p.sponsor, amount);
        if (amount != 0) IERC20(p.token).safeTransfer(p.sponsor, amount);
    }

    // ─── Views & pure helpers ────────────────────────────────────────────────────────────────────────────────────

    function getProgram(uint256 programId) external view returns (Program memory) {
        return _programs[programId];
    }

    function getTip(uint256 tipId) external view returns (Tip memory) {
        return _tips[tipId];
    }

    function getHit(uint256 programId, bytes32 candidateId) external view returns (Hit memory) {
        return _hits[programId][candidateId];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function commitmentOf(uint256 programId, address scout, bytes32 candidateId, bytes32 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(programId, scout, candidateId, salt));
    }

    function envelopesHash(bytes calldata sponsorEnvelope, bytes calldata scoutEnvelope) public pure returns (bytes32) {
        return keccak256(abi.encode(keccak256(sponsorEnvelope), keccak256(scoutEnvelope)));
    }

    function hashProgramParams(ProgramParams calldata p) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                p.token,
                p.bounty,
                p.rewardPerHit,
                p.tipDeadline,
                p.tailEnd,
                p.claimWindow,
                p.topK,
                p.maxTipsPerScout,
                p.baseWeight,
                p.minStake,
                p.curveDepth,
                p.sealKey,
                keccak256(p.evidenceSpec),
                keccak256(bytes(p.metadata))
            )
        );
    }

    /// @notice The sealed bonding curve, replayed in commit order over a candidate's proven tips. Tip i with weight
    ///         w buys depth²·w / ((depth + S)(depth + S + w)) shares, S being the weight committed before it: the
    ///         integral of a price (1 + x/depth)² that rises as weight piles onto the candidate. Integer-only;
    ///         mulDiv keeps intermediates in range.
    function curveShares(uint256 depth, uint256[] memory weights) public pure returns (uint256[] memory shares) {
        shares = new uint256[](weights.length);
        uint256 before = 0;
        for (uint256 i = 0; i < weights.length; ++i) {
            uint256 w = weights[i];
            shares[i] = Math.mulDiv(Math.mulDiv(depth, w, depth + before), depth, depth + before + w);
            before += w;
        }
    }

    /// @notice Split `net` in proportion to shares, rounding down; the earliest proven tip takes the dust. If every
    ///         share rounds to zero (a degenerate curve), split equally.
    function splitByShares(uint256 net, uint256[] memory shares) public pure returns (uint256[] memory amounts) {
        uint256 n = shares.length;
        amounts = new uint256[](n);
        if (n == 0) return amounts;
        uint256 total = 0;
        for (uint256 i = 0; i < n; ++i) {
            total += shares[i];
        }
        uint256 paid = 0;
        for (uint256 i = 1; i < n; ++i) {
            amounts[i] = total == 0 ? net / n : Math.mulDiv(net, shares[i], total);
            paid += amounts[i];
        }
        amounts[0] = net - paid;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _verify(address signer, bytes32 structHash, uint256 deadline, bytes calldata sig) internal view {
        if (signer == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert Expired();
        if (!SignatureChecker.isValidSignatureNow(signer, _hashTypedDataV4(structHash), sig)) {
            revert InvalidSignature();
        }
    }

    function _now() internal view returns (uint64) {
        // Timestamps fit in uint64 for the next ~584 billion years.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(block.timestamp);
    }

    function _program(uint256 programId) internal view returns (Program storage p) {
        p = _programs[programId];
        if (p.sponsor == address(0)) revert ProgramNotFound();
    }
}
