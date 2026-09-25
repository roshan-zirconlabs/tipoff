// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script} from "forge-std/Script.sol";
import {Tipoff} from "../src/Tipoff.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// @notice Deploys Tipoff and writes deployments/<chainId>.json.
///
/// Env:
///   USDC           existing token address; if unset (local only) a MockUSDC is deployed
///   FORWARDER      CRE forwarder (or the local dev resolver)
///   FEE_RECIPIENT  defaults to the deployer
///   FEE_BPS        defaults to 50 (0.5%), capped at 100 by the contract
contract Deploy is Script {
    function run() external {
        address deployer = msg.sender;
        address usdc = vm.envOr("USDC", address(0));
        address forwarder = vm.envOr("FORWARDER", address(0));
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(50));

        vm.startBroadcast();
        if (usdc == address(0)) {
            require(block.chainid == 31337, "USDC required outside local");
            usdc = address(new MockUSDC());
        }
        Tipoff tipoff = new Tipoff(deployer, feeRecipient, feeBps);
        tipoff.setAllowedToken(usdc, true);
        if (forwarder != address(0)) tipoff.setResolverConfig(forwarder, bytes32(0), address(0));
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", block.number);
        vm.serializeAddress(key, "usdc", usdc);
        vm.serializeAddress(key, "forwarder", forwarder);
        string memory json = vm.serializeAddress(key, "tipoff", address(tipoff));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
