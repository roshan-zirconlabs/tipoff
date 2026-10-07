import type { Address } from "viem";

/** A Farcaster profile as Tipoff shows it: who the creator is, and which wallets they've verified they own. */
export type FarcasterProfile = {
  fid: number;
  username: string;
  displayName: string;
  /** https URL of their profile picture, or null. */
  pfp: string | null;
  /** The wallet they chose as primary on Farcaster: where a patron would pay them. */
  primary: Address | null;
  /** Every Ethereum wallet they've verified. A tip is "theirs" only if it names one of these. */
  wallets: Address[];
};
