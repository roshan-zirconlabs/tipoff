// Tipoff evidence resolver — a Chainlink CRE workflow.
//
// Trigger: a USDC Transfer out of a watched sponsor treasury.
// For each program that declared that treasury (spec bytes fetched from the Tipoff API, then checked against the
// evidenceHash the contract stores), the same pure `matchPayments` used everywhere else decides whether the transfer
// is evidence that the sponsor acted. New hits are delivered to Tipoff.onReport through the Keystone forwarder.

import {
  bigintToProtoBigInt,
  bytesToHex,
  consensusIdenticalAggregation,
  EVMClient,
  type EVMLog,
  encodeCallMsg,
  getNetwork,
  HTTPClient,
  type HTTPSendRequester,
  handler,
  LAST_FINALIZED_BLOCK_NUMBER,
  logTriggerConfig,
  ok,
  prepareReportRequest,
  protoBigIntToBigint,
  Runner,
  type Runtime,
  TxStatus,
  text,
} from "@chainlink/cre-sdk";
import { tipoffAbi } from "@tipoff/core/abi";
import { matchPayments, type ResolvableProgram, type TransferEvidence } from "@tipoff/core/evidence";
import { decodeEvidenceSpec } from "@tipoff/core/program";
import {
  type Address,
  decodeEventLog,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  keccak256,
  pad,
  zeroAddress,
} from "viem";
import { z } from "zod";

export const configSchema = z.object({
  /** CRE chain selector name, e.g. "monad-testnet" or "monad-mainnet". */
  chainSelectorName: z.string(),
  tipoff: z.string(),
  usdc: z.string(),
  /** Sponsor treasuries whose outgoing USDC transfers trigger the workflow. */
  treasuries: z.array(z.string()).min(1),
  /** Tipoff API endpoint listing live programs' evidence specs (GET /api/evidence). */
  evidenceApi: z.string(),
  gasLimit: z.string(),
});

export type Config = z.infer<typeof configSchema>;

export const TRANSFER_TOPIC: Hex = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type EvidenceEntry = { programId: string; evidenceSpec: Hex };

const fetchEvidenceSpecs = (requester: HTTPSendRequester, config: Config): string => {
  const response = requester.sendRequest({ url: config.evidenceApi, method: "GET" }).result();
  if (!ok(response)) throw new Error(`evidence API returned ${response.statusCode}`);
  return text(response);
};

function evmClientFor(config: Config): EVMClient {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: config.chainSelectorName.includes("testnet"),
  });
  if (!network) throw new Error(`Unknown chain selector name ${config.chainSelectorName}`);
  return new EVMClient(network.chainSelector.selector);
}

function call(runtime: Runtime<Config>, evm: EVMClient, data: Hex): Hex {
  const reply = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: runtime.config.tipoff as Address, data }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return bytesToHex(reply.data);
}

function readProgram(runtime: Runtime<Config>, evm: EVMClient, programId: bigint) {
  const data = call(
    runtime,
    evm,
    encodeFunctionData({ abi: tipoffAbi, functionName: "getProgram", args: [programId] }),
  );
  return decodeFunctionResult({ abi: tipoffAbi, functionName: "getProgram", data });
}

function readHit(runtime: Runtime<Config>, evm: EVMClient, programId: bigint, candidateId: Hex) {
  const data = call(
    runtime,
    evm,
    encodeFunctionData({ abi: tipoffAbi, functionName: "getHit", args: [programId, candidateId] }),
  );
  return decodeFunctionResult({ abi: tipoffAbi, functionName: "getHit", data });
}

export const onTreasuryTransfer = (runtime: Runtime<Config>, log: EVMLog): string => {
  const config = runtime.config;
  const evm = evmClientFor(config);

  const { args } = decodeEventLog({
    abi: erc20Abi,
    eventName: "Transfer",
    topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    data: bytesToHex(log.data),
  });
  if (!log.blockNumber) throw new Error("log has no block number");
  const header = evm
    .headerByNumber(runtime, { blockNumber: bigintToProtoBigInt(protoBigIntToBigint(log.blockNumber)) })
    .result();
  const transfer: TransferEvidence = {
    token: bytesToHex(log.address),
    from: args.from,
    to: args.to,
    value: args.value,
    timestamp: header.header?.timestamp ?? 0n,
    txHash: bytesToHex(log.txHash),
  };
  runtime.log(`transfer ${transfer.value} from ${transfer.from} to ${transfer.to}`);

  const body = new HTTPClient()
    .sendRequest(
      runtime,
      fetchEvidenceSpecs,
      consensusIdenticalAggregation<string>(),
    )(config)
    .result();
  const entries = JSON.parse(body) as EvidenceEntry[];

  // Trust nothing from the API that the chain can't confirm.
  const programs: ResolvableProgram[] = [];
  for (const entry of entries) {
    const programId = BigInt(entry.programId);
    const program = readProgram(runtime, evm, programId);
    if (program.evidenceHash !== keccak256(entry.evidenceSpec)) {
      runtime.log(`program ${programId}: spec does not match the on-chain hash — skipped`);
      continue;
    }
    programs.push({
      programId,
      createdAt: program.createdAt,
      tailEnd: program.tailEnd,
      spec: decodeEvidenceSpec(entry.evidenceSpec),
    });
  }

  let reported = 0;
  for (const r of matchPayments(programs, [transfer], config.tipoff as Address)) {
    const hit = readHit(runtime, evm, r.programId, r.candidateId);
    if (hit.actedAt !== 0n) continue; // already on record: the sponsor declared it, or an earlier report landed

    const payload = encodeAbiParameters(
      [{ type: "uint256" }, { type: "bytes32" }, { type: "uint64" }, { type: "bytes32" }],
      [r.programId, r.candidateId, r.actedAt, r.evidenceRef],
    );
    const report = runtime.report(prepareReportRequest(payload)).result();
    const reply = evm
      .writeReport(runtime, { receiver: config.tipoff, report, gasConfig: { gasLimit: config.gasLimit } })
      .result();
    if (reply.txStatus !== TxStatus.SUCCESS) {
      throw new Error(`writeReport failed for program ${r.programId}: ${reply.errorMessage ?? reply.txStatus}`);
    }
    runtime.log(`program ${r.programId}: hit on ${r.paidTo} reported`);
    reported += 1;
  }
  return `reported ${reported} hit${reported === 1 ? "" : "s"}`;
};

export const initWorkflow = (config: Config) => {
  const evm = evmClientFor(config);
  return [
    handler(
      evm.logTrigger(
        logTriggerConfig({
          addresses: [config.usdc as Hex],
          topics: [[TRANSFER_TOPIC], config.treasuries.map((t) => pad(t as Hex, { size: 32 }))],
        }),
      ),
      onTreasuryTransfer,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
