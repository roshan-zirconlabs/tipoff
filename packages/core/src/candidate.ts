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
      if (isAddress(raw, { strict: false })) return { kind, value: getAddress(raw) };
      // Pasted from an explorer link, a profile or a bio: take the one wallet in it. A 64-hex tx hash never matches.
      const found = [
        ...new Set(
          [...raw.matchAll(/(?<![0-9a-fA-F])0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)].map((m) => m[0].toLowerCase()),
        ),
      ];
      if (found.length > 1) throw new CandidateInputError("That contains more than one wallet. Paste just theirs.");
      if (found.length === 0 || !isAddress(found[0] as string, { strict: false })) {
        throw new CandidateInputError(
          "Paste their wallet address (0x… with 40 hex characters), or a link that has it.",
        );
      }
      return { kind, value: getAddress(found[0] as string) };
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
