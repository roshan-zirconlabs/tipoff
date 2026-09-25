// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Tipoff} from "../src/Tipoff.sol";

/// @notice Fixed vectors shared with packages/core (test/vectors.test.ts). If either side changes an encoding, both
///         suites fail.
contract VectorsTest is Test {
    Tipoff internal tipoff;

    uint256 internal constant PROGRAM_ID = 7;
    address internal constant SCOUT = 0x1111111111111111111111111111111111111111;
    address internal constant FOUNDER = 0x2222222222222222222222222222222222222222;
    address internal constant VERIFYING = 0x3333333333333333333333333333333333333333;
    bytes32 internal constant SALT = bytes32(uint256(0x5A17));

    bytes32 internal constant CANDIDATE = 0x14ad4897ee970425389d12ff39927db9a16d3b0fc272c700ef0c2c1ec3e4cfec;
    bytes32 internal constant COMMITMENT = 0xb3f75372009b457621617e60f1e0c2d1b23a8739e08f5ee85442f8713812ab8f;
    bytes32 internal constant ENVELOPES = 0xcdbb4b0a5b6e1152ec31ae7f09941bef1ef0618df54863b5eb65e3f6d66f34eb;
    bytes32 internal constant PARAMS = 0xa18916369e11f63ebb50f9f01fabbf57da6683e665b0e19a23a8b0d14e0571cf;
    bytes32 internal constant COMMIT_DIGEST = 0x1b255811897a873da6523884705e8b324b442818091bf44d2fbbadbb8e52a13d;

    function setUp() public {
        tipoff = new Tipoff(address(this), address(this), 50);
    }

    function _params() internal pure returns (Tipoff.ProgramParams memory) {
        return Tipoff.ProgramParams({
            token: 0x4444444444444444444444444444444444444444,
            bounty: 2_100_000_000,
            rewardPerHit: 700_000_000,
            tipDeadline: 1_800_000_000,
            tailEnd: 1_807_776_000,
            claimWindow: 2_592_000,
            topK: 3,
            maxTipsPerScout: 3,
            sealKey: bytes32(uint256(0x5EA1)),
            evidenceSpec: bytes('{"kind":"evm-payment"}'),
            metadata: '{"title":"Vectors"}'
        });
    }

    function _domainSeparator(uint256 chainId, address verifying) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Tipoff"),
                keccak256("1"),
                chainId,
                verifying
            )
        );
    }

    function test_vectors() public view {
        bytes32 candidate = keccak256(abi.encode(uint8(1), abi.encodePacked(FOUNDER)));
        bytes32 commitment = tipoff.commitmentOf(PROGRAM_ID, SCOUT, candidate, SALT);
        bytes32 envelopes = tipoff.envelopesHash(hex"aabb", hex"ccdd");
        bytes32 params = tipoff.hashProgramParams(_params());
        bytes32 structHash = keccak256(
            abi.encode(tipoff.COMMIT_TIP_TYPEHASH(), PROGRAM_ID, commitment, envelopes, uint256(0), 1_800_000_000)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(143, VERIFYING), structHash));

        assertEq(candidate, CANDIDATE);
        assertEq(commitment, COMMITMENT);
        assertEq(envelopes, ENVELOPES);
        assertEq(params, PARAMS);
        assertEq(digest, COMMIT_DIGEST);
    }

    /// The deployed contract's domain separator follows the standard formula (so viem's hashTypedData matches).
    function test_domainSeparatorFormula() public view {
        assertEq(tipoff.domainSeparator(), _domainSeparator(block.chainid, address(tipoff)));
    }
}
