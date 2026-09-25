import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { deriveKeys, PRF_SALT } from "@tipoff/core";
import { bytesToHex, type Hex, type LocalAccount } from "viem";

export type Profile = {
  v: 1;
  name: string;
  address: `0x${string}`;
  sealPublic: Hex;
  mode: "passkey" | "dev";
  credential: PasskeyCredentialMetadata | null;
};

export type Keys = {
  account: LocalAccount;
  sealSecret: Uint8Array;
  end: () => void;
};

/** Turn a PRF output into live keys. The PRF bytes and derived secrets are zeroed as soon as they are copied in. */
function unlockFromPrf(prf: Uint8Array): { keys: Keys; sealPublic: Hex } {
  const derived = deriveKeys(prf);
  prf.fill(0);
  const session = createSecp256k1SigningSession({ privateKey: derived.evmSecret });
  derived.evmSecret.fill(0);
  const sealSecret = derived.sealSecret;
  return {
    sealPublic: bytesToHex(derived.sealPublic),
    keys: {
      account: toViemAccount(session),
      sealSecret,
      end: () => {
        session.end();
        sealSecret.fill(0);
      },
    },
  };
}

function rpId(): string {
  return window.location.hostname;
}

export async function createPasskeyAccount(name: string): Promise<{ profile: Profile; keys: Keys }> {
  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Tipoff" },
    user: { name, displayName: name },
    prfSalt: PRF_SALT,
  });
  const { keys, sealPublic } = unlockFromPrf(new Uint8Array(result.prfOutput));
  result.prfOutput.fill(0);
  const credential: PasskeyCredentialMetadata = {
    credentialId: result.credentialId,
    ...(result.transports ? { transports: result.transports } : {}),
  };
  return {
    keys,
    profile: { v: 1, name, address: keys.account.address, sealPublic, mode: "passkey", credential },
  };
}

export async function unlockPasskey(profile: Profile | null): Promise<{ profile: Profile; keys: Keys }> {
  const result = await getPasskeyPrfOutput({
    rpId: rpId(),
    prfSalt: PRF_SALT,
    ...(profile?.credential ? { credential: profile.credential } : {}),
  });
  const { keys, sealPublic } = unlockFromPrf(new Uint8Array(result.prfOutput));
  result.prfOutput.fill(0);
  const credential: PasskeyCredentialMetadata = { credentialId: result.credentialId };
  return {
    keys,
    profile: {
      v: 1,
      name: profile?.name ?? "Scout",
      address: keys.account.address,
      sealPublic,
      mode: "passkey",
      credential: profile?.credential ?? credential,
    },
  };
}

/** Local development only: a random 32-byte seed stands in for the passkey PRF, so flows can be tested anywhere. */
export function unlockDevKey(seedHex: string | null, name: string): { profile: Profile; keys: Keys; seed: string } {
  const seed = seedHex ?? bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const bytes = Uint8Array.from(seed.slice(2).match(/.{2}/g) ?? [], (b) => Number.parseInt(b, 16));
  const { keys, sealPublic } = unlockFromPrf(bytes);
  return {
    seed,
    keys,
    profile: { v: 1, name, address: keys.account.address, sealPublic, mode: "dev", credential: null },
  };
}

export function passkeyErrorMessage(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey provider can't derive keys (WebAuthn PRF). Use iCloud Keychain, Google Password Manager or 1Password on an up-to-date browser.";
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey prompt was closed or isn't available here.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser is missing secure crypto. Try a current Chrome, Safari or Firefox.";
      default:
        return "Your passkey couldn't be used. Please try again.";
    }
  }
  return "Something went wrong with your passkey. Please try again.";
}
