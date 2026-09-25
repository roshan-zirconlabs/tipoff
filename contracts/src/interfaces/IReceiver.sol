// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice Consumer interface for Chainlink CRE workflow reports, delivered by a KeystoneForwarder.
/// @dev `metadata` packs workflowId (bytes32) | workflowName (bytes10) | workflowOwner (address) [| reportId (bytes2)].
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
