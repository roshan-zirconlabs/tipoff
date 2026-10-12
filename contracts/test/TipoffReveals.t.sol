// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TipoffBase} from "./Base.t.sol";
import {TipoffReveals} from "../src/TipoffReveals.sol";

contract TipoffRevealsTest is TipoffBase {
    TipoffReveals internal reveals;
    address internal creator = makeAddr("creator");
    bytes32 internal X;

    function setUp() public override {
        super.setUp();
        reveals = new TipoffReveals(tipoff);
        X = _candidate(creator);
    }

    function _wonTip() internal returns (uint256 id, uint256 tipId) {
        id = _create();
        tipId = _commit(0, id, X);
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(sponsor);
        tipoff.resolve(id, X);
        _prove(0, tipId, X);
    }

    function test_reveal_publishesTheCreatorOfAWinningTip() public {
        (, uint256 tipId) = _wonTip();
        vm.prank(relayer); // anyone may submit it: the commitment check is the authority
        reveals.reveal(tipId, creator, _salt(0, X), "nala");
        (address c, string memory h) = reveals.revealOf(tipId);
        assertEq(c, creator);
        assertEq(h, "nala");
    }

    function test_reveal_rejectsLosingTipsAndWrongCreators() public {
        uint256 id = _create();
        uint256 losing = _commit(0, id, X);
        vm.expectRevert(TipoffReveals.NotProven.selector);
        reveals.reveal(losing, creator, _salt(0, X), "nala");

        (, uint256 tipId) = _wonTip();
        vm.expectRevert(TipoffReveals.WrongCreator.selector);
        reveals.reveal(tipId, makeAddr("impostor"), _salt(0, X), "nala");
        vm.expectRevert(TipoffReveals.WrongCreator.selector);
        reveals.reveal(tipId, creator, bytes32(uint256(1)), "nala");
        vm.expectRevert(TipoffReveals.BadHandle.selector);
        reveals.reveal(tipId, creator, _salt(0, X), "this-handle-is-too-long");
    }

    function test_reveal_handleIsSetOnceUnlessTheScoutChangesIt() public {
        (, uint256 tipId) = _wonTip();
        reveals.reveal(tipId, creator, _salt(0, X), "");
        reveals.reveal(tipId, creator, _salt(0, X), "nala"); // empty → set by anyone
        vm.prank(relayer);
        vm.expectRevert(TipoffReveals.AlreadyRevealed.selector);
        reveals.reveal(tipId, creator, _salt(0, X), "griefer");
        vm.prank(scouts[0]);
        reveals.reveal(tipId, creator, _salt(0, X), "nala-bloom"); // the scout may correct it
        (, string memory h) = reveals.revealOf(tipId);
        assertEq(h, "nala-bloom");
    }
}
