// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Tipoff} from "./Tipoff.sol";

/// @title TipoffReveals — who a winning call named, made public and verifiable.
/// @notice Tips stay sealed forever unless they win. Once a tip is proven (the patron acted on its creator), naming
///         that creator reveals nothing the patron's payment didn't already make public. A reveal is accepted only if
///         the creator wallet reproduces the tip's on-chain commitment, so nobody can attach a call to the wrong
///         person. The optional Farcaster handle is a display hint: apps must check the handle actually owns the
///         wallet before showing a face.
contract TipoffReveals {
    Tipoff public immutable tipoff;

    uint256 public constant MAX_HANDLE_BYTES = 20;

    struct Reveal {
        address creator;
        string handle;
    }

    mapping(uint256 tipId => Reveal) internal _reveals;

    event Revealed(uint256 indexed tipId, address indexed creator, string handle);

    error NotProven();
    error WrongCreator();
    error BadHandle();
    error AlreadyRevealed();

    constructor(Tipoff tipoff_) {
        tipoff = tipoff_;
    }

    /// @notice Publish the creator a winning tip named. `salt` is the tip's commitment salt (public once proven).
    ///         The wallet is write-once; the handle can be set while empty, or changed later by the tip's own scout.
    function reveal(uint256 tipId, address creator, bytes32 salt, string calldata handle) external {
        if (!tipoff.tipProven(tipId)) revert NotProven();
        Tipoff.Tip memory t = tipoff.getTip(tipId);
        bytes32 candidateId = keccak256(abi.encode(uint8(1), abi.encodePacked(creator)));
        if (tipoff.commitmentOf(t.programId, t.scout, candidateId, salt) != t.commitment) revert WrongCreator();
        if (bytes(handle).length > MAX_HANDLE_BYTES) revert BadHandle();

        Reveal storage r = _reveals[tipId];
        if (r.creator != address(0)) {
            // Same creator by construction; only the handle may change, and only by its scout or when unset.
            if (bytes(r.handle).length != 0 && msg.sender != t.scout) revert AlreadyRevealed();
        } else {
            r.creator = creator;
        }
        r.handle = handle;
        emit Revealed(tipId, creator, handle);
    }

    function revealOf(uint256 tipId) external view returns (address creator, string memory handle) {
        Reveal storage r = _reveals[tipId];
        return (r.creator, r.handle);
    }
}
