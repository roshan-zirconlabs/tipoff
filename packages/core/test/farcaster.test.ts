import { describe, expect, it } from "vitest";
import { looksLikeHandle, normalizeHandle } from "../src/farcaster.ts";

describe("Farcaster handles", () => {
  it("normalises what people type", () => {
    expect(normalizeHandle("@Nala")).toBe("nala");
    expect(normalizeHandle(" nala-bloom ")).toBe("nala-bloom");
    expect(normalizeHandle("https://farcaster.xyz/nala")).toBe("nala");
    expect(normalizeHandle("https://warpcast.com/nala/0xabc")).toBe("nala");
    expect(normalizeHandle("vitalik.eth")).toBe("vitalik.eth");
    expect(normalizeHandle("-bad")).toBeNull();
    expect(normalizeHandle("waytoolonghandle123")).toBeNull();
    expect(normalizeHandle("has space")).toBeNull();
  });

  it("tells handles from wallets", () => {
    expect(looksLikeHandle("@nala")).toBe(true);
    expect(looksLikeHandle("nala")).toBe(true);
    expect(looksLikeHandle("0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e")).toBe(false);
    expect(looksLikeHandle("https://testnet.monadvision.com/address/0x7f3a51c2aa0c7f4b54e2a7c9ae0e5d1b6f02c21e")).toBe(
      false,
    );
    expect(looksLikeHandle("12345")).toBe(false);
  });
});
