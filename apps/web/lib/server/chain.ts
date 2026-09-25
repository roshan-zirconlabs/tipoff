import "server-only";
import { createPublicClient, createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, config } from "../config";

export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

let relayer: ReturnType<typeof makeRelayer> | undefined;

function makeRelayer() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY is not set");
  return createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(config.rpcUrl) });
}

/** The server wallet that pays gas for signed intents. It never holds user funds. */
export function relayerClient() {
  relayer ??= makeRelayer();
  return relayer;
}
