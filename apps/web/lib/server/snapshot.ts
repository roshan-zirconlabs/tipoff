import "server-only";
import { decodeEvidenceSpec, decodeMetadata, tipoffAbi } from "@tipoff/core";
import type { Address, Hex, Log } from "viem";
import { createPublicClient, http, parseEventLogs } from "viem";
import { chain, config } from "../config";
import { ENVIO_QUERY, type EnvioData, snapshotFromEnvio } from "../envio-map";
import type { HitView, ProgramView, Snapshot, TipView } from "../types";
import { publicClient } from "./chain";

// Everything is derived from Tipoff's own events — the same model the Envio indexer uses — so there is no database and
// nothing here can disagree with the chain. Logs are fetched incrementally and cached for the life of the process.

type TipoffLog = ReturnType<typeof parseEventLogs<typeof tipoffAbi>>[number];

// Monad's public RPCs cap eth_getLogs at 100 blocks (~40 s of chain). Envio HyperRPC has no such cap: set
// LOGS_RPC_URL to it (with an API token) and raise LOG_CHUNK_BLOCKS. Local anvil has no cap either.
const LOGS_RPC_URL = process.env.LOGS_RPC_URL;
const logsClient = LOGS_RPC_URL ? createPublicClient({ chain, transport: http(LOGS_RPC_URL) }) : publicClient;
const CHUNK = BigInt(process.env.LOG_CHUNK_BLOCKS ?? (config.chainId === 31337 || LOGS_RPC_URL ? 10_000 : 100));
const CONCURRENCY = Number(process.env.LOG_CONCURRENCY ?? 6);

const cache: { toBlock: bigint; genesisHash: Hex | null; logs: TipoffLog[]; timestamps: Map<bigint, number> } = {
  toBlock: config.startBlock - 1n,
  genesisHash: null,
  logs: [],
  timestamps: new Map(),
};

async function sync(): Promise<{ block: bigint; now: number }> {
  const latest = await publicClient.getBlock({ blockTag: "latest" });
  // A restarted local chain rewinds; start over rather than serve stale state.
  if (latest.number < cache.toBlock) {
    cache.toBlock = config.startBlock - 1n;
    cache.logs = [];
    cache.timestamps.clear();
  }
  const ranges: [bigint, bigint][] = [];
  for (let from = cache.toBlock + 1n; from <= latest.number; from += CHUNK) {
    ranges.push([from, from + CHUNK - 1n < latest.number ? from + CHUNK - 1n : latest.number]);
  }
  // Fetch in parallel batches, append strictly in block order.
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results: Log[][] = await Promise.all(
      batch.map(([fromBlock, toBlock]) => logsClient.getLogs({ address: config.tipoff, fromBlock, toBlock })),
    );
    for (const raw of results) cache.logs.push(...parseEventLogs({ abi: tipoffAbi, logs: raw }));
    cache.toBlock = batch[batch.length - 1]?.[1] ?? cache.toBlock;
  }
  await fillTimestamps();
  return { block: latest.number, now: Number(latest.timestamp) };
}

async function fillTimestamps() {
  const missing = new Set<bigint>();
  for (const log of cache.logs) {
    if (log.eventName !== "TipCommitted") continue;
    const withTs = log as TipoffLog & { blockTimestamp?: bigint | Hex };
    if (withTs.blockTimestamp !== undefined) {
      cache.timestamps.set(log.blockNumber, Number(withTs.blockTimestamp));
    } else if (!cache.timestamps.has(log.blockNumber)) {
      missing.add(log.blockNumber);
    }
  }
  await Promise.all(
    [...missing].map(async (blockNumber) => {
      const block = await publicClient.getBlock({ blockNumber });
      cache.timestamps.set(blockNumber, Number(block.timestamp));
    }),
  );
}

let inflight: Promise<Snapshot> | null = null;

/** Current protocol state. Concurrent callers share one sync. */
export function loadSnapshot(): Promise<Snapshot> {
  inflight ??= (process.env.ENVIO_GRAPHQL_URL ? buildFromEnvio(process.env.ENVIO_GRAPHQL_URL) : build()).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The indexed path: one GraphQL round trip to Envio instead of scanning logs. Chain head still comes from the RPC. */
async function buildFromEnvio(url: string): Promise<Snapshot> {
  const [head, res] = await Promise.all([
    publicClient.getBlock({ blockTag: "latest" }),
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: ENVIO_QUERY, variables: { limit: 1000 } }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }),
  ]);
  const json = (await res.json()) as { data?: EnvioData; errors?: { message: string }[] };
  if (!res.ok || !json.data) throw new Error(`Envio query failed: ${json.errors?.[0]?.message ?? res.status}`);
  return snapshotFromEnvio(json.data, { now: Number(head.timestamp), block: Number(head.number) });
}

async function build(): Promise<Snapshot> {
  const { block, now } = await sync();
  const programs = new Map<number, ProgramView>();
  const tips = new Map<number, TipView>();
  const hits = new Map<string, HitView & { provenIds: number[] }>();
  const key = (programId: number, candidateId: Hex) => `${programId}:${candidateId}`;

  for (const log of cache.logs) {
    switch (log.eventName) {
      case "ProgramCreated": {
        const a = log.args;
        programs.set(Number(a.programId), {
          id: Number(a.programId),
          sponsor: a.sponsor,
          token: a.token,
          bounty: `${a.bounty}`,
          available: `${a.bounty}`,
          rewardPerHit: `${a.rewardPerHit}`,
          tipDeadline: Number(a.tipDeadline),
          tailEnd: Number(a.tailEnd),
          claimWindow: Number(a.claimWindow),
          createdAt: 0,
          topK: Number(a.topK),
          maxTipsPerScout: Number(a.maxTipsPerScout),
          sealKey: a.sealKey,
          tipCount: 0,
          openHits: 0,
          withdrawn: null,
          metadata: decodeMetadata(a.metadata),
          evidence: decodeEvidenceSpec(a.evidenceSpec),
          evidenceSpecRaw: a.evidenceSpec,
          createdTx: log.transactionHash,
          hits: [],
        });
        break;
      }
      case "TipCommitted": {
        const a = log.args;
        const program = programs.get(Number(a.programId));
        if (program) program.tipCount += 1;
        tips.set(Number(a.tipId), {
          tipId: Number(a.tipId),
          programId: Number(a.programId),
          scout: a.scout,
          commitment: a.commitment,
          committedAt: cache.timestamps.get(log.blockNumber) ?? 0,
          sponsorEnvelope: a.sponsorEnvelope,
          scoutEnvelope: a.scoutEnvelope,
          proven: false,
          txHash: log.transactionHash,
        });
        break;
      }
      case "CandidateActed": {
        const a = log.args;
        const programId = Number(a.programId);
        const program = programs.get(programId);
        if (program) {
          program.available = `${BigInt(program.available) - a.reward}`;
          if (a.reward > 0n) program.openHits += 1;
        }
        hits.set(key(programId, a.candidateId), {
          programId,
          candidateId: a.candidateId,
          source: a.source === 2 ? "evidence" : "sponsor",
          actedAt: Number(a.actedAt),
          claimDeadline: Number(a.claimDeadline),
          reward: `${a.reward}`,
          proven: 0,
          settled: a.reward === 0n,
          topTipIds: [],
          evidenceRef: a.evidenceRef,
          actedTx: log.transactionHash,
          payouts: [],
          fee: "0",
          returned: "0",
          provenIds: [],
        });
        break;
      }
      case "TipProven": {
        const a = log.args;
        const tip = tips.get(Number(a.tipId));
        if (tip) tip.proven = true;
        hits.get(key(Number(a.programId), a.candidateId))?.provenIds.push(Number(a.tipId));
        break;
      }
      case "HitSettled": {
        const a = log.args;
        const programId = Number(a.programId);
        const hit = hits.get(key(programId, a.candidateId));
        const program = programs.get(programId);
        if (hit) {
          hit.settled = true;
          hit.fee = `${a.fee}`;
          hit.returned = `${a.returned}`;
          hit.payouts = a.tipIds.map((id, i) => ({
            tipId: Number(id),
            scout: a.scouts[i] as Address,
            amount: `${a.amounts[i]}`,
          }));
        }
        if (program) {
          program.openHits -= 1;
          program.available = `${BigInt(program.available) + a.returned}`;
        }
        break;
      }
      case "RemainderWithdrawn": {
        const program = programs.get(Number(log.args.programId));
        if (program) {
          program.withdrawn = `${log.args.amount}`;
          program.available = "0";
        }
        break;
      }
    }
  }

  // createdAt is the creation block's timestamp (the contract's lower bound for a valid action).
  await Promise.all(
    [...programs.values()].map(async (p) => {
      const log = cache.logs.find((l) => l.eventName === "ProgramCreated" && Number(l.args.programId) === p.id);
      if (!log) return;
      let ts = cache.timestamps.get(log.blockNumber);
      if (ts === undefined) {
        ts = Number((await publicClient.getBlock({ blockNumber: log.blockNumber })).timestamp);
        cache.timestamps.set(log.blockNumber, ts);
      }
      p.createdAt = ts;
    }),
  );

  for (const hit of hits.values()) {
    const program = programs.get(hit.programId);
    const k = program?.topK ?? 0;
    // The contract keeps the k earliest proven tips; replaying proofs in any order yields the same set.
    const top = [...hit.provenIds].sort((x, y) => x - y).slice(0, k);
    const { provenIds: _, ...view } = hit;
    const final: HitView = { ...view, topTipIds: top, proven: top.length };
    program?.hits.push(final);
  }

  return {
    now,
    block: Number(block),
    programs: [...programs.values()].sort((a, b) => b.id - a.id),
    tips: [...tips.values()].sort((a, b) => b.tipId - a.tipId),
  };
}
