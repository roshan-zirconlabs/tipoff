import type { Address } from "viem";

export type Deployment = {
  chainId: number;
  tipoff: Address;
  usdc: Address;
  /** Block the contract was deployed at; readers start scanning here. */
  startBlock: bigint;
};

export const USDC = {
  /** Circle native USDC — developers.circle.com/stablecoins/usdc-contract-addresses */
  143: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
  10143: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
} as const satisfies Record<number, Address>;

export const CRE_FORWARDER = {
  /** docs.chain.link/cre — forwarder directory */
  143: {
    production: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    simulation: "0x9eF6468C5f37b976E57d52054c693269479A784d",
  },
  10143: {
    production: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    simulation: "0xB9F79d863261869B234c481D1f9A7af84AeAd192",
  },
} as const satisfies Record<number, { production: Address; simulation: Address }>;

export const USDC_DECIMALS = 6;
