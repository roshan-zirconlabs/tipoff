import { x25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/** PRF salt evaluated by the passkey. Domain-separates Tipoff from any other app using the same salt scheme. */
export const PRF_SALT: Uint8Array = sha256(utf8ToBytes("tipoff/prf/v1"));

const HKDF_SALT = utf8ToBytes("tipoff/keys/v1");

export type DerivedKeys = {
  /** secp256k1 secret for the EVM account (signs EIP-712 intents). */
  evmSecret: Uint8Array;
  /** X25519 secret that opens envelopes sealed to this user. */
  sealSecret: Uint8Array;
  /** X25519 public key others seal to (a sponsor publishes it on-chain as `sealKey`). */
  sealPublic: Uint8Array;
};

/**
 * One passkey, many keys: a single 32-byte PRF output becomes an EVM signing key and an X25519 sealing key through
 * domain-separated HKDF. The same passkey on any synced device reproduces both.
 */
export function deriveKeys(prf: Uint8Array): DerivedKeys {
  if (prf.length !== 32) throw new Error("PRF output must be 32 bytes");
  const sealSecret = hkdf(sha256, prf, HKDF_SALT, utf8ToBytes("x25519-seal"), 32);
  return { evmSecret: deriveEvmSecret(prf), sealSecret, sealPublic: x25519.getPublicKey(sealSecret) };
}

function deriveEvmSecret(prf: Uint8Array): Uint8Array {
  // A 32-byte HKDF output is a valid secp256k1 scalar except with probability ~2^-128; retry covers it.
  for (let i = 0; i < 16; i++) {
    const candidate = hkdf(sha256, prf, HKDF_SALT, utf8ToBytes(`evm-signing/${i}`), 32);
    if (secp256k1.utils.isValidSecretKey(candidate)) return candidate;
  }
  throw new Error("Could not derive a valid secp256k1 key");
}
