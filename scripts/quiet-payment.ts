// The demo's key moment: Low Tide's treasury pays a creator directly, without ever declaring the hit in Tipoff.
// Chainlink CRE then sees the payment and records the hit on-chain anyway.
//
//   node scripts/quiet-payment.ts --to 0xCreatorWallet [--amount 100]
//
// Then run the printed `cre workflow simulate … --broadcast` from workflows/, and the tipped fan can claim.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { testUsdcAbi } from "@tipoff/core";
import { createWalletClient, erc20Abi, getAddress, http, isAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { client, dep, RPC, root, step } from "./lib/tipoff-client.ts";

const arg = (f: string) => {
  const i = process.argv.indexOf(`--${f}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const rawTo = arg("to");
if (!rawTo || !isAddress(rawTo))
  throw new Error("Usage: node scripts/quiet-payment.ts --to 0xCreatorWallet [--amount 100]");
const to = getAddress(rawTo);
const amount = parseUnits(arg("amount") ?? "100", 6);

const key = readFileSync(join(root, "contracts", ".env"), "utf8").match(
  /^PRIVATE_KEY=\s*["']?(?:0x)?([0-9a-fA-F]{64})["']?\s*$/m,
)?.[1];
if (!key) throw new Error("contracts/.env needs PRIVATE_KEY");
const treasury = createWalletClient({
  account: privateKeyToAccount(`0x${key}`),
  chain: monadTestnet,
  transport: http(RPC),
});

async function main() {
  const balance = await client.readContract({
    address: dep.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [treasury.account.address],
  });
  if (balance < amount) {
    await client.waitForTransactionReceipt({
      hash: await treasury.writeContract({
        address: dep.token,
        abi: testUsdcAbi,
        functionName: "drip",
        args: [treasury.account.address],
      }),
    });
  }
  const hash = await treasury.writeContract({
    address: dep.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
  await client.waitForTransactionReceipt({ hash });
  step("✓", `Low Tide's treasury paid ${to} directly: https://testnet.monadvision.com/tx/${hash}`);
  console.log(`\nNow let Chainlink CRE see it (from workflows/):

  PATH="$PWD/resolver/node_modules/.bin:$PATH" ~/.cre/bin/cre workflow simulate resolver --target staging-settings \\
    --non-interactive --trigger-index 0 --evm-tx-hash ${hash} --evm-event-index 0 --broadcast
`);
}

main().catch((err) => {
  console.error(`\x1b[31m✗\x1b[0m ${(err as Error).message}`);
  process.exit(1);
});
