import type { Address } from "viem";
import type { FarcasterProfile } from "./farcaster-types";

/** Who a winning call named, and (when their handle verifiably owns that wallet) their Farcaster profile. */
export type CreatorView = { wallet: Address; profile: FarcasterProfile | null };
