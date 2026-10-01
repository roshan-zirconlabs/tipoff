// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script} from "forge-std/Script.sol";
import {Tipoff} from "../src/Tipoff.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {TestUSDC} from "../src/testnet/TestUSDC.sol";

/// @notice Deploys Tipoff and writes deployments/<chainId>.json.
///
/// Env:
///   USDC           existing token address; if unset (local only) a MockUSDC is deployed
///   FORWARDER      CRE forwarder (or the local dev resolver)
///   WORKFLOW_ID    the only workflow allowed to report (required with FORWARDER; CRE simulation uses 0x11…11)
///   WORKFLOW_OWNER that workflow's owner (required with FORWARDER; CRE simulation uses 0xaa…aa)
///   FEE_RECIPIENT  defaults to the deployer
///   FEE_BPS        defaults to 50 (0.5%), capped at 100 by the contract
///   TEST_TOKEN     1 on testnet: also deploy TestUSDC (faucet for judges and testers) and allow it
contract Deploy is Script {
    function run() external {
        address deployer = msg.sender;
        address usdc = vm.envOr("USDC", address(0));
        address forwarder = vm.envOr("FORWARDER", address(0));
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(50));
        bytes32 workflowId = vm.envOr("WORKFLOW_ID", bytes32(0));
        address workflowOwner = vm.envOr("WORKFLOW_OWNER", address(0));

        vm.startBroadcast();
        if (usdc == address(0)) {
            require(block.chainid == 31337, "USDC required outside local");
            usdc = address(new MockUSDC());
        }
        Tipoff tipoff = new Tipoff(deployer, feeRecipient, feeBps);
        tipoff.setAllowedToken(usdc, true);
        address testToken = address(0);
        if (vm.envOr("TEST_TOKEN", uint256(0)) == 1) {
            require(block.chainid != 143, "no test token on mainnet");
            testToken = address(new TestUSDC());
            tipoff.setAllowedToken(testToken, true);
        }
        if (forwarder != address(0)) tipoff.setResolverConfig(forwarder, workflowId, workflowOwner);
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", block.number);
        vm.serializeAddress(key, "usdc", usdc);
        vm.serializeAddress(key, "testToken", testToken);
        vm.serializeAddress(key, "forwarder", forwarder);
        vm.serializeBytes32(key, "workflowId", workflowId);
        vm.serializeAddress(key, "workflowOwner", workflowOwner);
        string memory json = vm.serializeAddress(key, "tipoff", address(tipoff));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
