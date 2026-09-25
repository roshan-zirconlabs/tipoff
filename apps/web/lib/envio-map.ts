import { decodeEvidenceSpec, decodeMetadata } from "@tipoff/core";
import type { Address, Hex } from "viem";
import type { HitView, ProgramView, Snapshot, TipView } from "./types";

// Envio's GraphQL returns BigInt columns as strings. These rows mirror indexer/schema.graphql.

export type EnvioProgram = {
  id: string;
  sponsor: string;
  token: string;
  bounty: string;
  available: string;
  rewardPerHit: string;
  tipDeadline: string;
  tailEnd: string;
  claimWindow: string;
  topK: number;
  maxTipsPerScout: number;
  sealKey: string;
  evidenceSpec: string;
  metadata: string;
  createdAt: string;
  createdTx: string;
  tipCount: number;
  openHits: number;
  withdrawn: string | null;
};

export type EnvioTip = {
  id: string;
  programId: string;
  scout: string;
  commitment: string;
  committedAt: string;
  sponsorEnvelope: string;
  scoutEnvelope: string;
  proven: boolean;
  provenFor: string | null;
  txHash: string;
};

export type EnvioHit = {
  id: string;
  programId: string;
  candidateId: string;
  source: string;
  actedAt: string;
  claimDeadline: string;
  reward: string;
  settled: boolean;
  evidenceRef: string;
  actedTx: string;
  fee: string;
  returned: string;
};

export type EnvioPayout = { id: string; hitId: string; tipId: string; scout: string; amount: string };

export type EnvioData = { Program: EnvioProgram[]; Tip: EnvioTip[]; Hit: EnvioHit[]; Payout: EnvioPayout[] };

export const ENVIO_QUERY = `query Tipoff($limit: Int!) {
  Program(limit: $limit, order_by: { createdAt: desc }) {
    id sponsor token bounty available rewardPerHit tipDeadline tailEnd claimWindow topK maxTipsPerScout
    sealKey evidenceSpec metadata createdAt createdTx tipCount openHits withdrawn
  }
  Tip(limit: $limit, order_by: { committedAt: desc }) {
    id programId scout commitment committedAt sponsorEnvelope scoutEnvelope proven provenFor txHash
  }
  Hit(limit: $limit) {
    id programId candidateId source actedAt claimDeadline reward settled evidenceRef actedTx fee returned
  }
  Payout(limit: $limit) { id hitId tipId scout amount }
}`;

/** Map indexed rows to the same Snapshot the log reader produces, so every page works unchanged. */
export function snapshotFromEnvio(data: EnvioData, head: { now: number; block: number }): Snapshot {
  const payoutsByHit = new Map<string, EnvioPayout[]>();
  for (const p of data.Payout) payoutsByHit.set(p.hitId, [...(payoutsByHit.get(p.hitId) ?? []), p]);
  const provenByHit = new Map<string, number[]>();
  for (const t of data.Tip) {
    if (t.proven && t.provenFor) provenByHit.set(t.provenFor, [...(provenByHit.get(t.provenFor) ?? []), Number(t.id)]);
  }
  const topKByProgram = new Map(data.Program.map((p) => [p.id, p.topK]));

  const hitsByProgram = new Map<string, HitView[]>();
  for (const h of data.Hit) {
    const top = (provenByHit.get(h.id) ?? []).sort((a, b) => a - b).slice(0, topKByProgram.get(h.programId) ?? 0);
    const view: HitView = {
      programId: Number(h.programId),
      candidateId: h.candidateId as Hex,
      source: h.source === "evidence" ? "evidence" : "sponsor",
      actedAt: Number(h.actedAt),
      claimDeadline: Number(h.claimDeadline),
      reward: h.reward,
      proven: top.length,
      settled: h.settled,
      topTipIds: top,
      evidenceRef: h.evidenceRef as Hex,
      actedTx: h.actedTx as Hex,
      payouts: (payoutsByHit.get(h.id) ?? [])
        .map((p) => ({ tipId: Number(p.tipId), scout: p.scout as Address, amount: p.amount }))
        .sort((a, b) => a.tipId - b.tipId),
      fee: h.fee,
      returned: h.returned,
    };
    hitsByProgram.set(h.programId, [...(hitsByProgram.get(h.programId) ?? []), view]);
  }

  const programs: ProgramView[] = data.Program.map((p) => ({
    id: Number(p.id),
    sponsor: p.sponsor as Address,
    token: p.token as Address,
    bounty: p.bounty,
    available: p.available,
    rewardPerHit: p.rewardPerHit,
    tipDeadline: Number(p.tipDeadline),
    tailEnd: Number(p.tailEnd),
    claimWindow: Number(p.claimWindow),
    createdAt: Number(p.createdAt),
    topK: p.topK,
    maxTipsPerScout: p.maxTipsPerScout,
    sealKey: p.sealKey as Hex,
    tipCount: p.tipCount,
    openHits: p.openHits,
    withdrawn: p.withdrawn,
    metadata: decodeMetadata(p.metadata),
    evidence: decodeEvidenceSpec(p.evidenceSpec as Hex),
    evidenceSpecRaw: p.evidenceSpec as Hex,
    createdTx: p.createdTx as Hex,
    hits: hitsByProgram.get(p.id) ?? [],
  })).sort((a, b) => b.id - a.id);

  const tips: TipView[] = data.Tip.map((t) => ({
    tipId: Number(t.id),
    programId: Number(t.programId),
    scout: t.scout as Address,
    commitment: t.commitment as Hex,
    committedAt: Number(t.committedAt),
    sponsorEnvelope: t.sponsorEnvelope as Hex,
    scoutEnvelope: t.scoutEnvelope as Hex,
    proven: t.proven,
    txHash: t.txHash as Hex,
  })).sort((a, b) => b.tipId - a.tipId);

  return { ...head, programs, tips };
}
