import type { Address } from "viem";
import { type Chain, defineChain } from "viem";
import { monad, monadTestnet } from "viem/chains";

/** Public, client-safe configuration. Written by `pnpm dev` locally, set in the host env elsewhere. */
export const config = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
  tipoff: (process.env.NEXT_PUBLIC_TIPOFF_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  startBlock: BigInt(process.env.NEXT_PUBLIC_START_BLOCK ?? 0),
  feeBps: Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 50),
  devTools: process.env.NEXT_PUBLIC_DEV_TOOLS === "1",
  demoSponsorSeed: process.env.NEXT_PUBLIC_DEMO_SPONSOR_SEED ?? null,
} as const;

export const localMonad = defineChain({
  id: 31337,
  name: "Local Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export function chainFor(chainId: number): Chain {
  if (chainId === monad.id) return monad;
  if (chainId === monadTestnet.id) return monadTestnet;
  return localMonad;
}

export const chain = chainFor(config.chainId);

/** MonadVision is where Tipoff's source is verified (Sourcify), so link there rather than viem's default. */
const EXPLORERS: Record<number, string> = {
  143: "https://monadvision.com",
  10143: "https://testnet.monadvision.com",
};

const explorer = EXPLORERS[config.chainId] ?? chain.blockExplorers?.default.url ?? null;

export function explorerTx(hash: string): string | null {
  return explorer ? `${explorer}/tx/${hash}` : null;
}

export function explorerAddress(address: string): string | null {
  return explorer ? `${explorer}/address/${address}` : null;
}
