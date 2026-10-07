import "server-only";
import { headers } from "next/headers";
import { originFrom } from "../origin";

/** This request's public origin, e.g. https://tipoff-phi.vercel.app (see `originFrom`). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return originFrom((name) => h.get(name), {
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  });
}
