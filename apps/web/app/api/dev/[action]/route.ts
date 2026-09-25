import { mockUsdcAbi } from "@tipoff/core";
import { NextResponse } from "next/server";
import { createTestClient, createWalletClient, http, isAddress, parseEther, parseUnits } from "viem";
import { z } from "zod";
import { chain, config } from "@/lib/config";
import { publicClient, relayerClient } from "@/lib/server/chain";

// Local-only helpers for testing the full lifecycle in minutes instead of months. They 404 anywhere but a dev chain.

const enabled = config.devTools && config.chainId === 31337;
const address = z.string().refine((v) => isAddress(v));

const bodies = {
  faucet: z.object({ address }),
  warp: z.object({
    seconds: z
      .number()
      .int()
      .min(1)
      .max(400 * 86_400),
  }),
  pay: z.object({ from: address, to: address, amount: z.string().regex(/^\d+(\.\d{1,6})?$/) }),
};

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!enabled || !(action in bodies)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodies[action as keyof typeof bodies].safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const test = createTestClient({ chain, mode: "anvil", transport: http(config.rpcUrl) });
  try {
    switch (action) {
      case "faucet": {
        const { address: to } = parsed.data as z.infer<typeof bodies.faucet>;
        const hash = await relayerClient().writeContract({
          address: config.usdc,
          abi: mockUsdcAbi,
          functionName: "mint",
          args: [to as `0x${string}`, parseUnits("10000", 6)],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") return NextResponse.json({ error: "Mint reverted" }, { status: 500 });
        return NextResponse.json({ ok: true, hash });
      }
      case "warp": {
        const { seconds } = parsed.data as z.infer<typeof bodies.warp>;
        await test.increaseTime({ seconds });
        await test.mine({ blocks: 1 });
        const block = await publicClient.getBlock();
        return NextResponse.json({ ok: true, now: Number(block.timestamp) });
      }
      case "pay": {
        // Simulates the sponsor paying a founder straight from its treasury — outside Tipoff.
        const { from, to, amount } = parsed.data as z.infer<typeof bodies.pay>;
        const sender = from as `0x${string}`;
        await test.impersonateAccount({ address: sender });
        await test.setBalance({ address: sender, value: parseEther("1") });
        const wallet = createWalletClient({ account: sender, chain, transport: http(config.rpcUrl) });
        const hash = await wallet.writeContract({
          address: config.usdc,
          abi: mockUsdcAbi,
          functionName: "transfer",
          args: [to as `0x${string}`, parseUnits(amount, 6)],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        await test.stopImpersonatingAccount({ address: sender });
        if (receipt.status !== "success") {
          return NextResponse.json(
            { error: "Transfer reverted — does the treasury hold enough USDC?" },
            { status: 422 },
          );
        }
        return NextResponse.json({ ok: true, hash });
      }
    }
  } catch (error) {
    console.error("[dev]", action, error);
    return NextResponse.json({ error: "Dev action failed" }, { status: 500 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
