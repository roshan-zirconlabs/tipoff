import { type EvmOnEventContext, indexer } from "envio";

// Builds the same model as apps/web/lib/server/snapshot.ts, persisted and queryable over GraphQL.

const key = (programId: bigint, candidateId: string) => `${programId}:${candidateId}`;

async function scout(context: EvmOnEventContext, address: string) {
  return (await context.Scout.get(address)) ?? { id: address, tips: 0, wins: 0, earned: 0n };
}

async function sponsor(context: EvmOnEventContext, address: string) {
  return (
    (await context.Sponsor.get(address)) ?? {
      id: address,
      programs: 0,
      committed: 0n,
      bySponsor: 0,
      byEvidence: 0,
      paidToScouts: 0n,
    }
  );
}

indexer.onEvent({ contract: "Tipoff", event: "ProgramCreated" }, async ({ event, context }) => {
  const p = event.params;
  const sponsorAddress = p.sponsor.toLowerCase();
  context.Program.set({
    id: `${p.programId}`,
    sponsor: sponsorAddress,
    token: p.token.toLowerCase(),
    bounty: p.bounty,
    available: p.bounty,
    rewardPerHit: p.rewardPerHit,
    tipDeadline: p.tipDeadline,
    tailEnd: p.tailEnd,
    claimWindow: p.claimWindow,
    topK: Number(p.topK),
    maxTipsPerScout: Number(p.maxTipsPerScout),
    sealKey: p.sealKey,
    evidenceSpec: p.evidenceSpec,
    metadata: p.metadata,
    createdAt: BigInt(event.block.timestamp),
    createdTx: event.transaction.hash,
    tipCount: 0,
    openHits: 0,
    withdrawn: undefined,
  });
  const s = await sponsor(context, sponsorAddress);
  context.Sponsor.set({ ...s, programs: s.programs + 1, committed: s.committed + p.bounty });
});

indexer.onEvent({ contract: "Tipoff", event: "TipCommitted" }, async ({ event, context }) => {
  const p = event.params;
  const scoutAddress = p.scout.toLowerCase();
  context.Tip.set({
    id: `${p.tipId}`,
    programId: `${p.programId}`,
    scout: scoutAddress,
    commitment: p.commitment,
    committedAt: BigInt(event.block.timestamp),
    sponsorEnvelope: p.sponsorEnvelope,
    scoutEnvelope: p.scoutEnvelope,
    proven: false,
    provenFor: undefined,
    txHash: event.transaction.hash,
  });
  const program = await context.Program.get(`${p.programId}`);
  if (program) context.Program.set({ ...program, tipCount: program.tipCount + 1 });
  const s = await scout(context, scoutAddress);
  context.Scout.set({ ...s, tips: s.tips + 1 });
});

indexer.onEvent({ contract: "Tipoff", event: "CandidateActed" }, async ({ event, context }) => {
  const p = event.params;
  const source = Number(p.source) === 2 ? "evidence" : "sponsor";
  context.Hit.set({
    id: key(p.programId, p.candidateId),
    programId: `${p.programId}`,
    candidateId: p.candidateId,
    source,
    actedAt: p.actedAt,
    claimDeadline: p.claimDeadline,
    reward: p.reward,
    settled: p.reward === 0n,
    evidenceRef: p.evidenceRef,
    actedTx: event.transaction.hash,
    fee: 0n,
    returned: 0n,
  });
  const program = await context.Program.get(`${p.programId}`);
  if (!program) return;
  context.Program.set({
    ...program,
    available: program.available - p.reward,
    openHits: program.openHits + (p.reward > 0n ? 1 : 0),
  });
  const s = await sponsor(context, program.sponsor);
  context.Sponsor.set(
    source === "evidence" ? { ...s, byEvidence: s.byEvidence + 1 } : { ...s, bySponsor: s.bySponsor + 1 },
  );
});

indexer.onEvent({ contract: "Tipoff", event: "TipProven" }, async ({ event, context }) => {
  const p = event.params;
  const tip = await context.Tip.get(`${p.tipId}`);
  if (tip) context.Tip.set({ ...tip, proven: true, provenFor: key(p.programId, p.candidateId) });
});

indexer.onEvent({ contract: "Tipoff", event: "HitSettled" }, async ({ event, context }) => {
  const p = event.params;
  const hitId = key(p.programId, p.candidateId);
  const hit = await context.Hit.get(hitId);
  if (hit) context.Hit.set({ ...hit, settled: true, fee: p.fee, returned: p.returned });

  let paid = 0n;
  for (const [i, tipId] of p.tipIds.entries()) {
    const scoutAddress = (p.scouts[i] ?? "").toLowerCase();
    const amount = p.amounts[i] ?? 0n;
    paid += amount;
    context.Payout.set({
      id: `${hitId}:${tipId}`,
      hitId,
      programId: `${p.programId}`,
      tipId,
      scout: scoutAddress,
      amount,
    });
    const s = await scout(context, scoutAddress);
    context.Scout.set({ ...s, wins: s.wins + 1, earned: s.earned + amount });
  }

  const program = await context.Program.get(`${p.programId}`);
  if (!program) return;
  context.Program.set({ ...program, openHits: program.openHits - 1, available: program.available + p.returned });
  const s = await sponsor(context, program.sponsor);
  context.Sponsor.set({ ...s, paidToScouts: s.paidToScouts + paid });
});

indexer.onEvent({ contract: "Tipoff", event: "RemainderWithdrawn" }, async ({ event, context }) => {
  const program = await context.Program.get(`${event.params.programId}`);
  if (program) context.Program.set({ ...program, withdrawn: event.params.amount, available: 0n });
});
