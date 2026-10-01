// Read-only checks before deploying Tipoff to Monad mainnet. Moves no funds and sends no transactions.
//
//   node scripts/preflight-mainnet.ts
//
// Checks the chain, the Circle USDC and Chainlink CRE forwarder contracts, the deployer and relayer balances, and that
// the CRE workflow identity is known. The resolver must be configured in the deploy itself: once the first program
// exists, every resolver change waits RESOLVER_DELAY (2 days) — so deploy only after the CRE workflow is deployed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CRE_FORWARDER, USDC } from "@tipoff/core";
import { createPublicClient, erc20Abi, formatEther, type Hex, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad } from "viem/chains";

const root = join(import.meta.dirname, "..");
const RPC = process.env.RPC_URL ?? "https://rpc.monad.xyz";
const client = createPublicClient({ chain: monad, transport: http(RPC) });

// Deploy ~5.7M gas on testnet; mainnet gas is charged on the limit, so budget with headroom.
const DEPLOY_GAS = 7_000_000n;
const RELAYER_MIN = parseEther("2");

type Check = { name: string; ok: boolean; detail: string; blocking?: boolean };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail: string, blocking = true) =>
  checks.push({ name, ok, detail, blocking });

function envFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [
          l.slice(0, l.indexOf("=")),
          l
            .slice(l.indexOf("=") + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ]),
    );
  } catch {
    return {};
  }
}

function accountFrom(raw: string | undefined) {
  const hex = raw?.replace(/^0x/, "");
  return hex && /^[0-9a-fA-F]{64}$/.test(hex) ? privateKeyToAccount(`0x${hex}` as Hex) : null;
}

async function main() {
  const chainId = await client.getChainId();
  check("Chain", chainId === 143, `RPC reports chain ${chainId}`);

  const usdc = USDC[143];
  const [name, decimals, version] = await Promise.all([
    client.readContract({ address: usdc, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: usdc, abi: erc20Abi, functionName: "decimals" }),
    client
      .readContract({
        address: usdc,
        abi: [
          { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
        ],
        functionName: "version",
      })
      .catch(() => "?"),
  ]);
  check(
    "Circle USDC",
    name === "USDC" && decimals === 6 && version === "2",
    `${usdc} · ${name} v${version} · ${decimals} decimals (permit domain the app signs)`,
  );

  const forwarder = CRE_FORWARDER[143].production;
  const code = await client.getCode({ address: forwarder });
  check("CRE forwarder", Boolean(code && code.length > 2), `${forwarder} (production KeystoneForwarder)`);

  const contracts = envFile(join(root, "contracts", ".env"));
  const deployer = accountFrom(contracts.PRIVATE_KEY);
  if (!deployer) check("Deployer key", false, "contracts/.env needs PRIVATE_KEY");
  else {
    const [balance, gasPrice] = await Promise.all([
      client.getBalance({ address: deployer.address }),
      client.getGasPrice(),
    ]);
    const need = DEPLOY_GAS * gasPrice;
    check(
      "Deployer MON",
      balance >= need,
      `${deployer.address} holds ${formatEther(balance)} MON; deploy needs ~${formatEther(need)} at ${formatEther(gasPrice * 1_000_000_000n)} gwei`,
    );
  }

  const web = envFile(join(root, "apps", "web", ".env.mainnet"));
  const relayer = accountFrom(web.RELAYER_PRIVATE_KEY);
  if (!relayer)
    check("Relayer key", false, "apps/web/.env.mainnet needs RELAYER_PRIVATE_KEY (a fresh key, not the deployer)");
  else {
    const balance = await client.getBalance({ address: relayer.address });
    check(
      "Relayer MON",
      balance >= RELAYER_MIN,
      `${relayer.address} holds ${formatEther(balance)} MON; keep ≥ ${formatEther(RELAYER_MIN)}`,
    );
    check("Relayer ≠ deployer", relayer.address !== deployer?.address, "the relayer must not be the contract owner");
  }
  check(
    "CRON_SECRET",
    Boolean(web.CRON_SECRET && web.CRON_SECRET.length >= 32),
    "apps/web/.env.mainnet: ≥ 32 random chars for /api/keeper",
    false,
  );

  const workflowId = process.env.WORKFLOW_ID ?? contracts.WORKFLOW_ID;
  const workflowOwner = process.env.WORKFLOW_OWNER ?? contracts.WORKFLOW_OWNER;
  check(
    "CRE workflow identity",
    Boolean(workflowId && /^0x[0-9a-fA-F]{64}$/.test(workflowId) && !/^0x(11)+$/.test(workflowId)) &&
      Boolean(workflowOwner && isAddress(workflowOwner) && !/^0x(aa)+$/i.test(workflowOwner)),
    workflowId && workflowOwner
      ? `workflow ${workflowId} owned by ${workflowOwner}`
      : "WORKFLOW_ID / WORKFLOW_OWNER unset: deploy the CRE workflow first (needs deploy access), then rerun",
  );

  for (const c of checks) {
    const mark = c.ok ? "\x1b[32m✓\x1b[0m" : c.blocking ? "\x1b[31m✗\x1b[0m" : "\x1b[33m!\x1b[0m";
    console.log(`${mark} ${c.name.padEnd(22)} ${c.detail}`);
  }
  const blocked = checks.filter((c) => !c.ok && c.blocking);
  if (blocked.length) {
    console.log(`\n${blocked.length} blocking check(s). Nothing was sent.`);
    process.exit(1);
  }
  console.log(`\nReady. Deploy from contracts/ with the resolver set in the same run:

  USDC=${usdc} FORWARDER=${forwarder} \\
  WORKFLOW_ID=${workflowId} WORKFLOW_OWNER=${workflowOwner} \\
  forge script script/Deploy.s.sol --rpc-url monad --broadcast --private-key <deployer key>

Then verify on Sourcify, and create the first program only after the resolver is confirmed:
  cast call <tipoff> "forwarder()(address)" --rpc-url monad`);
}

main().catch((err) => {
  console.error(`\x1b[31m✗\x1b[0m ${(err as Error).message}`);
  process.exit(1);
});
