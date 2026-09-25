import type { Address, TypedDataDomain } from "viem";

export function tipoffDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: "Tipoff", version: "1", chainId, verifyingContract };
}

/** EIP-712 types. Must match the *_TYPEHASH constants in Tipoff.sol (checked by vector tests). */
export const tipoffTypes = {
  CreateProgram: [
    { name: "paramsHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  CommitTip: [
    { name: "programId", type: "uint256" },
    { name: "commitment", type: "bytes32" },
    { name: "envelopesHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Resolve: [
    { name: "programId", type: "uint256" },
    { name: "candidateId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  WithdrawRemainder: [
    { name: "programId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
