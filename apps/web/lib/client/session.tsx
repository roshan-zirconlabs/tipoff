"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import {
  createPasskeyAccount,
  type Keys,
  type Profile,
  passkeyErrorMessage,
  unlockDevKey,
  unlockPasskey,
} from "./passkey";

// The profile (address, public seal key, credential id) is public and persists in localStorage. Secret keys live only
// in memory for the tab's life and are zeroed on lock.

const PROFILE_KEY = "tipoff.profile.v1";
const DEV_SEED_KEY = "tipoff.devseed.v1";
const DEV_IDS_KEY = "tipoff.devids.v1";

export type DevIdentity = { name: string; seed: string; address: string };

/** Local development only: every throwaway identity used on this device, so testers can switch roles. */
export function listDevIdentities(): DevIdentity[] {
  try {
    return JSON.parse(localStorage.getItem(DEV_IDS_KEY) ?? "[]") as DevIdentity[];
  } catch {
    return [];
  }
}

function rememberDevIdentity(id: DevIdentity) {
  const all = listDevIdentities().filter((x) => x.seed !== id.seed);
  localStorage.setItem(DEV_IDS_KEY, JSON.stringify([id, ...all].slice(0, 8)));
}

type Status = "loading" | "anonymous" | "locked" | "unlocked";

type SessionValue = {
  status: Status;
  profile: Profile | null;
  keys: Keys | null;
  busy: boolean;
  error: string | null;
  createAccount: (name: string) => Promise<boolean>;
  unlock: () => Promise<boolean>;
  enterDevMode: (name: string, seed?: string) => void;
  lock: () => void;
  forget: () => void;
  clearError: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

function readProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const p = raw ? (JSON.parse(raw) as Profile) : null;
    return p?.v === 1 ? p : null;
  } catch {
    return null;
  }
}

function writeProfile(profile: Profile | null) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {}
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [keys, setKeys] = useState<Keys | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keysRef = useRef<Keys | null>(null);

  const adopt = useCallback((p: Profile, k: Keys) => {
    keysRef.current?.end();
    keysRef.current = k;
    writeProfile(p);
    setProfile(p);
    setKeys(k);
    setStatus("unlocked");
  }, []);

  useEffect(() => {
    const stored = readProfile();
    if (stored?.mode === "dev" && config.devTools) {
      try {
        const seed = localStorage.getItem(DEV_SEED_KEY);
        if (seed) {
          const { profile: p, keys: k } = unlockDevKey(seed, stored.name);
          adopt(p, k);
          return;
        }
      } catch {}
    }
    setProfile(stored);
    setStatus(stored ? "locked" : "anonymous");
    return () => keysRef.current?.end();
  }, [adopt]);

  const run = useCallback(
    async (fn: () => Promise<{ profile: Profile; keys: Keys }>) => {
      setBusy(true);
      setError(null);
      try {
        const { profile: p, keys: k } = await fn();
        adopt(p, k);
        return true;
      } catch (e) {
        setError(passkeyErrorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      profile,
      keys,
      busy,
      error,
      createAccount: (name) => run(() => createPasskeyAccount(name.trim() || "Scout")),
      unlock: () => run(() => unlockPasskey(profile)),
      enterDevMode: (name, seed) => {
        if (!config.devTools) return;
        const existing = seed ?? (profile?.mode === "dev" ? localStorage.getItem(DEV_SEED_KEY) : null);
        const { profile: p, keys: k, seed: usedSeed } = unlockDevKey(existing, name.trim() || "Dev scout");
        localStorage.setItem(DEV_SEED_KEY, usedSeed);
        rememberDevIdentity({ name: p.name, seed: usedSeed, address: p.address });
        adopt(p, k);
      },
      lock: () => {
        keysRef.current?.end();
        keysRef.current = null;
        setKeys(null);
        setStatus(profile ? "locked" : "anonymous");
      },
      forget: () => {
        keysRef.current?.end();
        keysRef.current = null;
        writeProfile(null);
        localStorage.removeItem(DEV_SEED_KEY);
        setKeys(null);
        setProfile(null);
        setStatus("anonymous");
      },
      clearError: () => setError(null),
    }),
    [status, profile, keys, busy, error, run, adopt],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
