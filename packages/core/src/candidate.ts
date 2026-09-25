import { type Address, encodeAbiParameters, getAddress, type Hex, isAddress, keccak256, toBytes, toHex } from "viem";

/** How a candidate is identified. The id must be canonical so evidence and tips agree on the same bytes. */
export const CandidateKind = {
  /** A wallet on Monad — resolvable on-chain when the sponsor's treasury pays it. */
  Wallet: 1,
  /** A Deezer artist id — resolvable from label metadata (stretch adapter). */
  DeezerArtist: 2,
} as const;

export type CandidateKind = (typeof CandidateKind)[keyof typeof CandidateKind];

export type CandidateRef =
  | { kind: typeof CandidateKind.Wallet; value: Address }
  | { kind: typeof CandidateKind.DeezerArtist; value: string };

export const candidateKindLabel: Record<CandidateKind, string> = {
  [CandidateKind.Wallet]: "Wallet",
  [CandidateKind.DeezerArtist]: "Deezer artist",
};

/** Canonical bytes for a candidate, matching `abi.encodePacked(address)` for wallets. */
export function candidateExternalId(ref: CandidateRef): Hex {
  switch (ref.kind) {
    case CandidateKind.Wallet:
      return getAddress(ref.value).toLowerCase() as Hex;
    case CandidateKind.DeezerArtist:
      return toHex(toBytes(ref.value));
  }
}

/** keccak256(abi.encode(uint8 kind, bytes externalId)) — the on-chain candidate id. */
export function candidateId(ref: CandidateRef): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], [ref.kind, candidateExternalId(ref)]));
}

export class CandidateInputError extends Error {}

/** Parse what a scout typed into a canonical candidate, or throw a message fit for the UI. */
export function parseCandidate(kind: CandidateKind, input: string): CandidateRef {
  const raw = input.trim();
  switch (kind) {
    case CandidateKind.Wallet: {
      if (!isAddress(raw, { strict: false })) {
        throw new CandidateInputError("Paste a full wallet address (0x… with 40 hex characters).");
      }
      return { kind, value: getAddress(raw) };
    }
    case CandidateKind.DeezerArtist: {
      const fromUrl = raw.match(/deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/i)?.[1];
      const id = fromUrl ?? (/^\d+$/.test(raw) ? raw : undefined);
      if (!id) throw new CandidateInputError("Paste a Deezer artist link or numeric artist id.");
      return { kind, value: String(BigInt(id)) };
    }
  }
}

export function shortCandidate(ref: CandidateRef): string {
  return ref.kind === CandidateKind.Wallet ? `${ref.value.slice(0, 6)}…${ref.value.slice(-4)}` : `#${ref.value}`;
}
