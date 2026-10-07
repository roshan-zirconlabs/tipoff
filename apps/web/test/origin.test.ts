import { describe, expect, it } from "vitest";
import { originFrom } from "../lib/origin";

const from = (h: Record<string, string>, env = {}) => originFrom((n) => h[n] ?? null, env);

describe("originFrom", () => {
  it("uses the host the visitor came in on, so any domain works", () => {
    expect(from({ "x-forwarded-host": "tipoff-phi.vercel.app", "x-forwarded-proto": "https" })).toBe(
      "https://tipoff-phi.vercel.app",
    );
    expect(from({ "x-forwarded-host": "tipoff.xyz", host: "internal:3000" })).toBe("https://tipoff.xyz");
    expect(from({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(from({ "x-forwarded-host": "a.example, b.example", "x-forwarded-proto": "https, http" })).toBe(
      "https://a.example",
    );
  });

  it("ignores junk hosts and falls back to Vercel's domain, then localhost", () => {
    const env = { VERCEL_PROJECT_PRODUCTION_URL: "tipoff-phi.vercel.app", VERCEL_URL: "tipoff-abc123.vercel.app" };
    expect(from({ host: 'evil.com"><script>' }, env)).toBe("https://tipoff-phi.vercel.app");
    expect(from({}, { VERCEL_URL: "tipoff-abc123.vercel.app" })).toBe("https://tipoff-abc123.vercel.app");
    expect(from({})).toBe("http://localhost:3000");
  });
});
