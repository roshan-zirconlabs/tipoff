import { describe, expect, it } from "vitest";
import { duration, pad, relative, shortAddress, usdc } from "../lib/format";

describe("format", () => {
  it("formats USDC base units", () => {
    expect(usdc("1500000000")).toBe("1,500");
    expect(usdc("1492500000")).toBe("1,492.50");
    expect(usdc(7_500_000n)).toBe("7.50");
    expect(usdc("25000000000", { compact: true })).toBe("25K");
    expect(usdc("")).toBe("0");
  });

  it("formats countdowns", () => {
    expect(duration(13 * 86_400 + 23 * 3600 + 59)).toBe("13d 23h");
    expect(duration(3 * 3600 + 12 * 60)).toBe("3h 12m");
    expect(duration(42)).toBe("42s");
    expect(duration(-5)).toBe("0s");
  });

  it("formats relative time against chain time", () => {
    expect(relative(1_000 + 2 * 86_400, 1_000)).toBe("in 2 days");
    expect(relative(1_000 - 3600, 1_000)).toBe("1 hour ago");
  });

  it("shortens addresses and pads tip numbers", () => {
    expect(shortAddress("0x16773a3fB17A2Ac4E1c9216cD43Da829f33ACe4b")).toBe("0x1677…Ce4b");
    expect(pad(42)).toBe("0042");
  });
});
