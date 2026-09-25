import "server-only";
import { tipoffAbi } from "@tipoff/core";
import { BaseError, ContractFunctionRevertedError, type Hex, parseEventLogs } from "viem";
import { config } from "../config";
import { friendlyContractError } from "../errors";
import type { RelayRequest, RelayResponse } from "../relay-schema";
import { publicClient, relayerClient } from "./chain";

type Call = { functionName: string; args: readonly unknown[] };

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
          BigInt(req.programId),
          req.commitment,
          req.sponsorEnvelope,
          req.scoutEnvelope,
          BigInt(req.deadline),
          req.signature,
        ],
      };
    case "resolve":
      return {
        functionName: "resolveFor",
        args: [BigInt(req.programId), req.candidateId, BigInt(req.deadline), req.signature],
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
export async function relay(req: RelayRequest): Promise<RelayResponse> {
  const wallet = relayerClient();
  const call = toCall(req);
  const base = { address: config.tipoff, abi: tipoffAbi, account: wallet.account, ...call } as const;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: the call is chosen at runtime from a validated union
    const { request } = await publicClient.simulateContract(base as any);
    // biome-ignore lint/suspicious/noExplicitAny: same as above
    const gas = await publicClient.estimateContractGas(base as any);
    const hash = await wallet.writeContract({ ...request, gas: (gas * 11n) / 10n });
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
