import "server-only";
import { testUsdcAbi, tipoffAbi } from "@tipoff/core";
import { BaseError, ContractFunctionRevertedError, type Hex, parseEther, parseEventLogs } from "viem";
import { config } from "../config";
import { friendlyContractError } from "../errors";
import { GasBudget, serial } from "../gas-budget";
import type { RelayRequest, RelayResponse } from "../relay-schema";
import { publicClient, relayerClient } from "./chain";

type Call = { functionName: string; args: readonly unknown[]; address?: `0x${string}`; abi?: readonly unknown[] };

function toCall(req: RelayRequest): Call {
  switch (req.type) {
    case "createProgram": {
      const p = req.params;
      return {
        functionName: "createProgramFor",
        args: [
          {
            token: p.token,
            bounty: BigInt(p.bounty),
            rewardPerHit: BigInt(p.rewardPerHit),
            tipDeadline: BigInt(p.tipDeadline),
            tailEnd: BigInt(p.tailEnd),
            claimWindow: p.claimWindow,
            topK: p.topK,
            maxTipsPerScout: p.maxTipsPerScout,
            baseWeight: BigInt(p.baseWeight),
            minStake: BigInt(p.minStake),
            curveDepth: BigInt(p.curveDepth),
            sealKey: p.sealKey,
            evidenceSpec: p.evidenceSpec,
            metadata: p.metadata,
          },
          req.sponsor,
          BigInt(req.deadline),
          req.signature,
          { deadline: BigInt(req.permit.deadline), v: req.permit.v, r: req.permit.r, s: req.permit.s },
        ],
      };
    }
    case "commitTip":
      return {
        functionName: "commitTipFor",
        args: [
          req.scout,
          {
            programId: BigInt(req.programId),
            commitment: req.commitment,
            stake: BigInt(req.stake),
            sponsorEnvelope: req.sponsorEnvelope,
            scoutEnvelope: req.scoutEnvelope,
          },
          BigInt(req.deadline),
          req.signature,
          req.permit
            ? { deadline: BigInt(req.permit.deadline), v: req.permit.v, r: req.permit.r, s: req.permit.s }
            : { deadline: 0n, v: 0, r: `0x${"00".repeat(32)}`, s: `0x${"00".repeat(32)}` },
        ],
      };
    case "resolve":
      return {
        functionName: "resolveFor",
        args: [
          BigInt(req.programId),
          req.candidateId,
          BigInt(req.deadline),
          req.signature,
          { deadline: BigInt(req.permit.deadline), v: req.permit.v, r: req.permit.r, s: req.permit.s },
        ],
      };
    case "withdraw":
      return {
        functionName: "withdrawRemainderFor",
        args: [BigInt(req.programId), BigInt(req.deadline), req.signature],
      };
    case "proveTip":
      return { functionName: "proveTip", args: [BigInt(req.tipId), req.candidateId, req.salt] };
    case "settle":
      return { functionName: "settle", args: [BigInt(req.programId), req.candidateId] };
    case "returnStake":
      return { functionName: "returnStake", args: [BigInt(req.tipId)] };
    case "drip":
      return { address: config.usdc, abi: testUsdcAbi, functionName: "drip", args: [req.to] };
    case "withdrawOwed":
      return {
        functionName: "withdrawOwedFor",
        args: [req.token, req.account, BigInt(req.deadline), req.signature],
      };
  }
}

// Daily relayer spend caps (MON). Defaults suit a hackathon-scale launch; raise them in the host env.
const budget = new GasBudget({
  perActorWei: parseEther(process.env.RELAYER_ACTOR_DAILY_MON ?? "0.5"),
  globalWei: parseEther(process.env.RELAYER_DAILY_MON ?? "5"),
});
const MIN_BALANCE = parseEther(process.env.RELAYER_MIN_BALANCE_MON ?? "0.05");
const sendSerially = serial();

/** Who a relay is charged to: the signer of an intent, or the one-shot object a permissionless call acts on. */
export function actorOf(req: RelayRequest): string {
  switch (req.type) {
    case "createProgram":
      return req.sponsor.toLowerCase();
    case "commitTip":
      return req.scout.toLowerCase();
    case "resolve":
    case "withdraw":
      return `program:${req.programId}`;
    case "proveTip":
    case "returnStake":
      return `tip:${req.tipId}`;
    case "settle":
      return `hit:${req.programId}:${req.candidateId}`;
    case "withdrawOwed":
      return req.account.toLowerCase();
    case "drip":
      return req.to.toLowerCase();
  }
}

function revertName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
}

/**
 * Submit a signed intent. Simulate first (so reverts cost nothing), then send with an explicit gas limit: Monad charges
 * the gas *limit*, so we never use a padded default.
 */
export async function relay(req: RelayRequest, actor = actorOf(req)): Promise<RelayResponse> {
  const wallet = relayerClient();
  const call = toCall(req);
  if (req.type === "drip" && !config.faucet) return { ok: false, error: "There's no test faucet on this network." };
  const base = { address: config.tipoff, abi: tipoffAbi, account: wallet.account, ...call } as const;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: the call is chosen at runtime from a validated union
    const { request } = await publicClient.simulateContract(base as any);
    // biome-ignore lint/suspicious/noExplicitAny: same as above
    const gas = ((await publicClient.estimateContractGas(base as any)) * 11n) / 10n;
    const [{ maxFeePerGas }, balance] = await Promise.all([
      publicClient.estimateFeesPerGas(),
      publicClient.getBalance({ address: wallet.account.address }),
    ]);
    const cost = gas * maxFeePerGas;
    if (balance - cost < MIN_BALANCE) {
      console.error("[relay] relayer balance low", balance);
      return {
        ok: false,
        error: "Gasless sending is paused while we top up. You can still send this from a wallet with MON.",
        code: "RelayerLow",
      };
    }
    const over = budget.check(actor, cost);
    if (over) {
      return {
        ok: false,
        error:
          over === "actor"
            ? "You've reached today's limit for gasless transactions. Try again tomorrow, or send from a wallet with MON."
            : "Gasless sending has reached today's limit. Try again later, or send from a wallet with MON.",
        code: over === "actor" ? "ActorBudget" : "GlobalBudget",
      };
    }
    // One send at a time: the relayer's nonce can only advance serially.
    const hash = await sendSerially(async () => {
      const sent = await wallet.writeContract({ ...request, gas });
      budget.charge(actor, cost); // Monad charges the gas limit whether or not the call succeeds
      return sent;
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    if (receipt.status !== "success") return { ok: false, error: "The transaction reverted on-chain." };

    const events = parseEventLogs({ abi: tipoffAbi, logs: receipt.logs });
    const created = events.find((e) => e.eventName === "ProgramCreated");
    const tipped = events.find((e) => e.eventName === "TipCommitted");
    return {
      ok: true,
      hash,
      programId: created ? Number(created.args.programId) : undefined,
      tipId: tipped ? Number(tipped.args.tipId) : undefined,
    };
  } catch (error) {
    const code = revertName(error);
    if (code) return { ok: false, error: friendlyContractError(code), code };
    console.error("[relay]", req.type, error);
    return { ok: false, error: "Couldn't reach the network. Please try again." };
  }
}

export function isHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}
