import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const VERSION = 1;
const INFO = utf8ToBytes("tipoff/seal/v1");
const HEADER = 1 + 32 + 24; // version | ephemeral public key | nonce

export class SealError extends Error {}

function deriveKey(shared: Uint8Array, ephPublic: Uint8Array, recipientPublic: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concatBytes(ephPublic, recipientPublic), INFO, 32);
}

/**
 * Seal `plaintext` so only the holder of `recipientPublic`'s secret can open it: ephemeral X25519 → HKDF-SHA256 →
 * XChaCha20-Poly1305. `aad` binds the envelope to its context (chain, contract, program, scout) so it cannot be
 * replayed elsewhere.
 */
export function seal(recipientPublic: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  if (recipientPublic.length !== 32) throw new SealError("Recipient key must be 32 bytes");
  const ephSecret = x25519.utils.randomSecretKey();
  const ephPublic = x25519.getPublicKey(ephSecret);
  const key = deriveKey(x25519.getSharedSecret(ephSecret, recipientPublic), ephPublic, recipientPublic);
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
  return concatBytes(new Uint8Array([VERSION]), ephPublic, nonce, ciphertext);
}

export function open(recipientSecret: Uint8Array, envelope: Uint8Array, aad: Uint8Array): Uint8Array {
  if (envelope.length <= HEADER + 16 || envelope[0] !== VERSION) throw new SealError("Not a Tipoff envelope");
  const ephPublic = envelope.subarray(1, 33);
  const nonce = envelope.subarray(33, HEADER);
  const recipientPublic = x25519.getPublicKey(recipientSecret);
  const key = deriveKey(x25519.getSharedSecret(recipientSecret, ephPublic), ephPublic, recipientPublic);
  try {
    return xchacha20poly1305(key, nonce, aad).decrypt(envelope.subarray(HEADER));
  } catch {
    throw new SealError("Envelope could not be opened with this key");
  }
}
