import { describe, expect } from "bun:test";
import { getNetwork } from "@chainlink/cre-sdk";
import {
  addContractMock,
  EvmMock,
  HttpActionsMock,
  newTestRuntime,
  REPORT_METADATA_HEADER_LENGTH,
  test,
} from "@chainlink/cre-sdk/test";
import { tipoffAbi } from "@tipoff/core/abi";
import { CandidateKind, candidateId } from "@tipoff/core/candidate";
import { encodeEvidenceSpec } from "@tipoff/core/program";
import { type Address, decodeAbiParameters, type Hex, hexToBytes, keccak256, pad, toHex } from "viem";
import { type Config, initWorkflow, onTreasuryTransfer, TRANSFER_TOPIC } from "./main";

const TIPOFF: Address = "0x196d4119944CD005AD917466B8e2e2Ec018FA547";
const USDC: Address = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const TREASURY: Address = "0x02847D22C33f5F060Bd27e69F1a413AD44cab213";
const FOUNDER: Address = "0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e";
const TX = `0x${"ab".repeat(32)}` as Hex;
const PAID_AT = 2_000n;

const config: Config = {
  chainSelectorName: "monad-testnet",
  tipoff: TIPOFF,
  usdc: USDC,
  treasuries: [TREASURY],
  evidenceApi: "http://localhost:3000/api/evidence",
  gasLimit: "600000",
};

const spec = encodeEvidenceSpec({
  v: 1,
  kind: "evm-payment",
  token: USDC,
  treasuries: [TREASURY],
  minAmount: "100000000",
});

function selector(): bigint {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true });
  if (!network) throw new Error("monad-testnet selector missing from the SDK");
  return network.chainSelector.selector;
}

/** A USDC Transfer log as the log trigger delivers it. */
function transferLog(to: Address, value: bigint) {
  return {
    address: hexToBytes(USDC),
    topics: [TRANSFER_TOPIC, pad(TREASURY, { size: 32 }), pad(to, { size: 32 })].map((t) => hexToBytes(t)),
    data: hexToBytes(toHex(value, { size: 32 })),
    txHash: hexToBytes(TX),
    blockNumber: { absVal: new Uint8Array([123]), sign: 1n }, // protobuf BigInt, as the trigger delivers it
    // biome-ignore lint/suspicious/noExplicitAny: a plain object stands in for the protobuf EVMLog message
  } as any;
}

type Setup = { onChainSpecHash?: Hex; alreadyActed?: boolean };

function setup({ onChainSpecHash = keccak256(spec), alreadyActed = false }: Setup = {}) {
  const writes: Hex[] = [];
  const http = HttpActionsMock.testInstance();
  http.sendRequest = () => ({
    statusCode: 200,
    body: Buffer.from(JSON.stringify([{ programId: "1", evidenceSpec: spec }])).toString("base64"),
  });

  const evm = EvmMock.testInstance(selector());
  evm.headerByNumber = () => ({ header: { timestamp: `${PAID_AT}` } });
  const tipoff = addContractMock(evm, { address: TIPOFF, abi: tipoffAbi });
  tipoff.getProgram = () => ({
    sponsor: TREASURY,
    tipDeadline: 1_500n,
    tipCount: 3,
    token: USDC,
    tailEnd: 10_000n,
    claimWindow: 604_800,
    rewardPerHit: 1_000_000_000n,
    available: 3_000_000_000n,
    sealKey: `0x${"11".repeat(32)}`,
    evidenceHash: onChainSpecHash,
    createdAt: 1_000n,
    topK: 3,
    maxTipsPerScout: 3,
    openHits: 0,
  });
  tipoff.getHit = () => ({
    actedAt: alreadyActed ? 1_900n : 0n,
    claimDeadline: 0n,
    source: 0,
    proven: 0,
    settled: false,
    reward: 0n,
    topTipIds: [0, 0, 0, 0, 0],
  });
  tipoff.writeReport = (input) => {
    writes.push(toHex(input.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH)));
    return { txStatus: "TX_STATUS_SUCCESS", txHash: hexToBytes(TX) };
  };

  const runtime = newTestRuntime();
  runtime.config = config;
  return { runtime, writes };
}

describe("onTreasuryTransfer", () => {
  test("reports a hit when a declared treasury pays a candidate", () => {
    const { runtime, writes } = setup();
    expect(onTreasuryTransfer(runtime, transferLog(FOUNDER, 500_000_000n))).toBe("reported 1 hit");
    expect(writes).toHaveLength(1);
    const [programId, candidate, actedAt, evidenceRef] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "bytes32" }, { type: "uint64" }, { type: "bytes32" }],
      writes[0] as Hex,
    );
    expect(programId).toBe(1n);
    expect(candidate).toBe(candidateId({ kind: CandidateKind.Wallet, value: FOUNDER }));
    expect(actedAt).toBe(PAID_AT);
    expect(evidenceRef).toBe(TX);
  });

  test("ignores a spec the chain doesn't vouch for (the API can't invent treasuries)", () => {
    const { runtime, writes } = setup({ onChainSpecHash: keccak256("0x1234") });
    expect(onTreasuryTransfer(runtime, transferLog(FOUNDER, 500_000_000n))).toBe("reported 0 hits");
    expect(writes).toHaveLength(0);
  });

  test("skips candidates already on record", () => {
    const { runtime, writes } = setup({ alreadyActed: true });
    expect(onTreasuryTransfer(runtime, transferLog(FOUNDER, 500_000_000n))).toBe("reported 0 hits");
    expect(writes).toHaveLength(0);
  });

  test("ignores payments that aren't evidence of acting", () => {
    const small = setup();
    expect(onTreasuryTransfer(small.runtime, transferLog(FOUNDER, 99_000_000n))).toBe("reported 0 hits");
    const deposit = setup();
    expect(onTreasuryTransfer(deposit.runtime, transferLog(TIPOFF, 500_000_000n))).toBe("reported 0 hits");
    expect([...small.writes, ...deposit.writes]).toHaveLength(0);
  });
});

describe("initWorkflow", () => {
  test("listens on Monad testnet for USDC transfers out of the watched treasuries only", () => {
    const [h] = initWorkflow(config);
    // biome-ignore lint/suspicious/noExplicitAny: inspecting the generated trigger request
    const trigger = h?.trigger as any;
    const hex = (b: Uint8Array) => toHex(b);
    expect(trigger.ChainSelector).toBe(selector());
    expect(trigger.config.addresses.map(hex)).toEqual([USDC.toLowerCase()]);
    expect(trigger.config.topics[0].values.map(hex)).toEqual([TRANSFER_TOPIC]);
    expect(trigger.config.topics[1].values.map(hex)).toEqual([pad(TREASURY.toLowerCase() as Hex, { size: 32 })]);
  });
});
