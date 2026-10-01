import { CandidateKind, candidateId } from "@tipoff/core";
import type { Address, Hex } from "viem";
import type { Snapshot } from "./types";

/** A winning tip, made public: someone named a creator before the patron paid them, and it's provable. */
export type Call = {
  tipId: number;
  programId: number;
  programTitle: string;
  patronName: string;
  patron: Address;
  scout: Address;
  candidateId: Hex;
  committedAt: number;
  actedAt: number;
  /** How long before the patron acted the tip was sealed. */
  daysEarly: number;
  source: "sponsor" | "evidence";
  /** 1-based position among the paid tips on this creator (commit order). */
  rank: number;
  /** Paid out, or claimed and waiting for the claim window to close. */
  status: "paid" | "claimed";
  amount: string | null;
};

const DAY = 86_400;

export function calls(snapshot: Snapshot): Call[] {
  const tips = new Map(snapshot.tips.map((t) => [t.tipId, t]));
  const out: Call[] = [];
  for (const p of snapshot.programs) {
    for (const h of p.hits) {
      h.topTipIds.forEach((tipId, i) => {
        const tip = tips.get(tipId);
        if (!tip) return;
        const payout = h.payouts.find((x) => x.tipId === tipId);
        out.push({
          tipId,
          programId: p.id,
          programTitle: p.metadata.title,
          patronName: p.metadata.sponsorName,
          patron: p.sponsor,
          scout: tip.scout,
          candidateId: h.candidateId,
          committedAt: tip.committedAt,
          actedAt: h.actedAt,
          daysEarly: Math.max(0, (h.actedAt - tip.committedAt) / DAY),
          source: h.source,
          rank: i + 1,
          status: h.settled ? "paid" : "claimed",
          amount: payout ? payout.amount : null,
        });
      });
    }
  }
  return out.sort((a, b) => b.actedAt - a.actedAt || a.rank - b.rank);
}

export type ScoutStanding = {
  scout: Address;
  tips: number;
  calls: number;
  earned: bigint;
  /** Calls / tips. Every tip's existence is on-chain, so this can't be padded by hiding misses. */
  hitRate: number;
  /** Median days between sealing a winning tip and the patron acting. */
  medianDaysEarly: number | null;
};

export function standings(snapshot: Snapshot): ScoutStanding[] {
  const byScout = new Map<string, { scout: Address; tips: number; calls: Call[] }>();
  const entry = (a: Address) => {
    const k = a.toLowerCase();
    if (!byScout.has(k)) byScout.set(k, { scout: a, tips: 0, calls: [] });
    return byScout.get(k) as { scout: Address; tips: number; calls: Call[] };
  };
  for (const t of snapshot.tips) entry(t.scout).tips += 1;
  for (const c of calls(snapshot)) entry(c.scout).calls.push(c);
  return [...byScout.values()]
    .map(({ scout, tips, calls: cs }) => {
      const days = cs.map((c) => c.daysEarly).sort((a, b) => a - b);
      const mid = days.length
        ? (days[Math.floor((days.length - 1) / 2)]! + days[Math.ceil((days.length - 1) / 2)]!) / 2
        : null;
      return {
        scout,
        tips,
        calls: cs.length,
        earned: cs.reduce((sum, c) => sum + BigInt(c.amount ?? 0), 0n),
        hitRate: tips ? cs.length / tips : 0,
        medianDaysEarly: mid,
      };
    })
    .sort((a, b) => (b.earned > a.earned ? 1 : b.earned < a.earned ? -1 : b.calls - a.calls || b.hitRate - a.hitRate));
}

/** A scout's track record in a sentence a patron can weigh, or null for a first-timer. */
export function reputationOf(standing: ScoutStanding | undefined): string | null {
  if (!standing || standing.tips === 0) return null;
  if (standing.calls === 0) return `${standing.tips} tip${standing.tips === 1 ? "" : "s"}, no calls yet`;
  return `${standing.calls}/${standing.tips} calls · ${Math.round(standing.hitRate * 100)}%`;
}

/** The creator's wallet, only if it really is the one this call named (the candidate id is its hash). */
export function verifiedCreator(call: Pick<Call, "candidateId">, wallet: string | null | undefined): Address | null {
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;
  const id = candidateId({ kind: CandidateKind.Wallet, value: wallet as Address });
  return id.toLowerCase() === call.candidateId.toLowerCase() ? (wallet as Address) : null;
}

/** A scout's own words about the creator: shown only next to a verified wallet, short, plain text. */
export function cleanLabel(raw: string | null | undefined): string | null {
  const plain = [...(raw ?? "")].filter((ch) => {
    const code = ch.charCodeAt(0);
    return code > 31 && code !== 127 && ch !== "<" && ch !== ">";
  });
  const s = plain.join("").trim().slice(0, 48);
  return s || null;
}
