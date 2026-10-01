import type { Snapshot } from "./types";

export type KeeperJob =
  | { type: "settle"; programId: string; candidateId: `0x${string}` }
  | { type: "returnStake"; tipId: string };

/**
 * Everything anyone may do now that nobody has: pay out hits whose claim window closed, and return stakes once tipping
 * has closed. Both are permissionless and always pay the right party, so the keeper needs no trust. Oldest first, capped
 * so one run stays inside a serverless time limit.
 */
export function dueWork(snapshot: Snapshot, limit = 20): KeeperJob[] {
  const settles: (KeeperJob & { at: number })[] = [];
  for (const p of snapshot.programs) {
    for (const h of p.hits) {
      if (h.settled || BigInt(h.reward) === 0n || snapshot.now <= h.claimDeadline) continue;
      settles.push({ type: "settle", programId: `${p.id}`, candidateId: h.candidateId, at: h.claimDeadline });
    }
  }
  const deadlines = new Map(snapshot.programs.map((p) => [p.id, p.tipDeadline]));
  const refunds: (KeeperJob & { at: number })[] = [];
  for (const t of snapshot.tips) {
    const tipDeadline = deadlines.get(t.programId);
    if (tipDeadline === undefined || t.stakeReturned || BigInt(t.stake) === 0n || snapshot.now <= tipDeadline) continue;
    refunds.push({ type: "returnStake", tipId: `${t.tipId}`, at: tipDeadline });
  }
  // Payouts before refunds: a scout waiting on a win matters more than a stake that is merely unlocked.
  const byAge = (a: { at: number }, b: { at: number }) => a.at - b.at;
  return [...settles.sort(byAge), ...refunds.sort(byAge)].slice(0, limit).map(({ at: _, ...job }) => job);
}
