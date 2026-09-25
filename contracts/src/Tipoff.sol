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
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @title Tipoff — sealed scout markets with enforceable finder's fees.
/// @notice A sponsor locks a bounty for a kind of opportunity. Scouts commit sealed tips. When the sponsor acts on a
///         candidate — declared by the sponsor, or proven by evidence delivered through Chainlink CRE — the earliest
///         scouts who tipped that candidate are paid. The bounty stays locked through a tail period, so acting after
///         the window, or without resolving, still pays.
/// @dev Losing tips are never revealed: a tip is opened only when it wins, by proving its commitment preimage.
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

    uint8 public constant SOURCE_SPONSOR = 1;
    uint8 public constant SOURCE_EVIDENCE = 2;

    bytes32 public constant CREATE_PROGRAM_TYPEHASH =
        keccak256("CreateProgram(bytes32 paramsHash,uint256 nonce,uint256 deadline)");
    bytes32 public constant RESOLVE_TYPEHASH =
        keccak256("Resolve(uint256 programId,bytes32 candidateId,uint256 nonce,uint256 deadline)");
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("WithdrawRemainder(uint256 programId,uint256 nonce,uint256 deadline)");
    bytes32 public constant COMMIT_TIP_TYPEHASH = keccak256(
        "CommitTip(uint256 programId,bytes32 commitment,bytes32 envelopesHash,uint256 nonce,uint256 deadline)"
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
        bytes32 sealKey; // sponsor X25519 public key; tips are encrypted to it
        bytes evidenceSpec; // JSON: how the evidence resolver recognises the sponsor acting
        string metadata; // JSON: title, brief, what counts as a candidate
    }

    struct PermitSig {
        uint256 deadline; // 0 = skip permit (allowance already set)
        uint8 v;
        bytes32 r;
        bytes32 s;
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
    }

    struct Tip {
        address scout;
        uint64 committedAt;
        uint32 programId;
        bytes32 commitment;
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
        bytes32 sealKey,
        bytes evidenceSpec,
        string metadata
    );
    event TipCommitted(
        uint256 indexed programId,
        uint256 indexed tipId,
        address indexed scout,
        bytes32 commitment,
        bytes sponsorEnvelope,
        bytes scoutEnvelope
    );
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
    event ResolverConfigured(address forwarder, bytes32 workflowId, address workflowOwner);

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

    /// @notice Configure the CRE forwarder and, optionally, the only workflow allowed to deliver evidence.
    ///         A zero forwarder disables evidence resolution; zero workflow fields skip that check.
    // forge-lint: disable-next-line(missing-zero-check)
    function setResolverConfig(address forwarder_, bytes32 workflowId, address workflowOwner) external onlyOwner {
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
                || bytes(p.metadata).length > MAX_METADATA_BYTES
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
            openHits: 0
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
            p.sealKey,
            p.evidenceSpec,
            p.metadata
        );

        // `sponsor` is msg.sender or the verified signer of a CreateProgram intent.
        // forge-lint: disable-next-line(arbitrary-send-erc20)
        IERC20(p.token).safeTransferFrom(sponsor, address(this), p.bounty);
    }

    // ─── Scout: commit ───────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Commit a sealed tip directly (scout pays gas). Always available, so the relayer cannot censor.
    function commitTip(
        uint256 programId,
        bytes32 commitment,
        bytes calldata sponsorEnvelope,
        bytes calldata scoutEnvelope
    ) external returns (uint256 tipId) {
        tipId = _commit(msg.sender, programId, commitment, sponsorEnvelope, scoutEnvelope);
    }

    /// @notice Commit a sealed tip from the scout's signed intent (relayer pays gas). The signature covers both
    ///         envelopes, so the relayer cannot swap ciphertexts.
    function commitTipFor(
        address scout,
        uint256 programId,
        bytes32 commitment,
        bytes calldata sponsorEnvelope,
        bytes calldata scoutEnvelope,
        uint256 deadline,
        bytes calldata sig
    ) external returns (uint256 tipId) {
        _verify(
            scout,
            keccak256(
                abi.encode(
                    COMMIT_TIP_TYPEHASH,
                    programId,
                    commitment,
                    envelopesHash(sponsorEnvelope, scoutEnvelope),
                    _useNonce(scout),
                    deadline
                )
            ),
            deadline,
            sig
        );
        tipId = _commit(scout, programId, commitment, sponsorEnvelope, scoutEnvelope);
    }

    function _commit(
        address scout,
        uint256 programId,
        bytes32 commitment,
        bytes calldata sponsorEnvelope,
        bytes calldata scoutEnvelope
    ) internal returns (uint256 tipId) {
        Program storage p = _program(programId);
        if (block.timestamp > p.tipDeadline) revert TippingClosed();
        if (scout == p.sponsor) revert SponsorCannotTip();
        if (
            commitment == bytes32(0) || sponsorEnvelope.length == 0 || sponsorEnvelope.length > MAX_ENVELOPE_BYTES
                || scoutEnvelope.length > MAX_ENVELOPE_BYTES
        ) revert InvalidParams();
        uint16 used = tipsByScout[programId][scout];
        if (used >= p.maxTipsPerScout) revert TipLimitReached();

        tipsByScout[programId][scout] = used + 1;
        p.tipCount += 1;
        tipId = ++tipCount;
        if (tipId > type(uint32).max) revert InvalidParams();
        _tips[tipId] = Tip({
            scout: scout,
            committedAt: _now(),
            // Bounded above: programId <= type(uint32).max.
            // forge-lint: disable-next-line(unsafe-typecast)
            programId: uint32(programId),
            commitment: commitment
        });

        // Only an ERC-1271 staticcall (signature check) may run before this.
        // forge-lint: disable-next-line(reentrancy-events)
        emit TipCommitted(programId, tipId, scout, commitment, sponsorEnvelope, scoutEnvelope);
    }

    // ─── Resolution ──────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice The honest path: the sponsor declares it acts on a candidate now. The sponsor cannot backdate — every
    ///         tip committed before this block counts. Resolving a candidate before anyone tips it is how a sponsor
    ///         publicly excludes a candidate it already knew about.
    function resolve(uint256 programId, bytes32 candidateId) external {
        _resolve(msg.sender, programId, candidateId);
    }

    /// @notice `resolve` from the sponsor's signed intent (relayer pays gas).
    function resolveFor(uint256 programId, bytes32 candidateId, uint256 deadline, bytes calldata sig) external {
        address sponsor = _program(programId).sponsor;
        _verify(
            sponsor,
            keccak256(abi.encode(RESOLVE_TYPEHASH, programId, candidateId, _useNonce(sponsor), deadline)),
            deadline,
            sig
        );
        _resolve(sponsor, programId, candidateId);
    }

    function _resolve(address caller, uint256 programId, bytes32 candidateId) internal {
        Program storage p = _program(programId);
        if (caller != p.sponsor) revert NotSponsor();
        if (_hits[programId][candidateId].actedAt != 0) revert AlreadyActed();
        _recordHit(programId, p, candidateId, _now(), SOURCE_SPONSOR, bytes32(0));
    }

    /// @notice The enforcement path: a Chainlink CRE workflow reports that evidence shows the sponsor acted.
    /// @dev report = abi.encode(uint256 programId, bytes32 candidateId, uint64 actedAt, bytes32 evidenceRef).
    ///      Duplicate reports are ignored so workflow retries never fail.
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder || forwarder == address(0)) revert NotForwarder();
        if (metadata.length < 62) revert UnexpectedWorkflow();
        bytes32 workflowId = bytes32(metadata[0:32]);
        address workflowOwner = address(bytes20(metadata[42:62]));
        if (expectedWorkflowId != bytes32(0) && workflowId != expectedWorkflowId) revert UnexpectedWorkflow();
        if (expectedWorkflowOwner != address(0) && workflowOwner != expectedWorkflowOwner) {
            revert UnexpectedWorkflow();
        }

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

        uint128 reward = p.available < p.rewardPerHit ? p.available : p.rewardPerHit;
        p.available -= reward;
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
        if (t.committedAt >= h.actedAt) revert TipAfterAction();

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
            p.available += reward;
            emit HitSettled(programId, candidateId, tipIds, scouts, amounts, 0, reward);
            return;
        }

        uint256 fee = (reward * feeBps) / 10_000;
        uint256[] memory split = payoutSplit(reward - fee, n);
        for (uint256 i = 0; i < n; ++i) {
            tipIds[i] = h.topTipIds[i];
            scouts[i] = _tips[tipIds[i]].scout;
            amounts[i] = split[i];
        }

        emit HitSettled(programId, candidateId, tipIds, scouts, amounts, fee, 0);

        IERC20 token = IERC20(p.token);
        if (fee != 0) token.safeTransfer(feeRecipient, fee);
        for (uint256 i = 0; i < n; ++i) {
            token.safeTransfer(scouts[i], amounts[i]);
        }
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
                p.sealKey,
                keccak256(p.evidenceSpec),
                keccak256(bytes(p.metadata))
            )
        );
    }

    /// @notice Geometric split over the ranks actually proven: rank i gets 2^(n-1-i) / (2^n - 1), rounded down; the
    ///         earliest scout takes the rounding dust, so earlier ranks never earn less. n = 3 → 4/7, 2/7, 1/7.
    ///         A lone finder gets everything.
    function payoutSplit(uint256 net, uint256 n) public pure returns (uint256[] memory amounts) {
        amounts = new uint256[](n);
        if (n == 0) return amounts;
        uint256 denominator = (1 << n) - 1;
        uint256 paid = 0;
        for (uint256 i = 1; i < n; ++i) {
            amounts[i] = (net * (1 << (n - 1 - i))) / denominator;
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
