// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script} from "forge-std/Script.sol";
import {Tipoff} from "../src/Tipoff.sol";
import {TipoffReveals} from "../src/TipoffReveals.sol";

/// @notice Deploys the reveal registry next to an existing Tipoff (env TIPOFF) and records it in deployments/<chain>.json.
contract DeployReveals is Script {
    function run() external {
        address tipoff = vm.envAddress("TIPOFF");
        vm.startBroadcast();
        TipoffReveals reveals = new TipoffReveals(Tipoff(tipoff));
        vm.stopBroadcast();
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(vm.toString(address(reveals)), path, ".reveals");
    }
}
