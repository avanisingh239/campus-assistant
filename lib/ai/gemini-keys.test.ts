import { describe, expect, it } from "vitest";
import { nextKeyIndex, parseGeminiApiKeys } from "./gemini-keys";

describe("parseGeminiApiKeys", () => {
  it("splits a comma-separated GEMINI_API_KEYS into a list", () => {
    expect(parseGeminiApiKeys({ GEMINI_API_KEYS: "key-a,key-b,key-c" })).toEqual([
      "key-a",
      "key-b",
      "key-c",
    ]);
  });

  it("trims whitespace around each key", () => {
    expect(parseGeminiApiKeys({ GEMINI_API_KEYS: " key-a , key-b ,key-c " })).toEqual([
      "key-a",
      "key-b",
      "key-c",
    ]);
  });

  it("drops blank entries from a trailing or double comma", () => {
    expect(parseGeminiApiKeys({ GEMINI_API_KEYS: "key-a,,key-b," })).toEqual(["key-a", "key-b"]);
  });

  it("falls back to the old single-key GEMINI_API_KEY when GEMINI_API_KEYS is unset (backward compatibility)", () => {
    expect(parseGeminiApiKeys({ GEMINI_API_KEY: "solo-key" })).toEqual(["solo-key"]);
  });

  it("prefers GEMINI_API_KEYS over GEMINI_API_KEY when both are set, rather than combining them", () => {
    expect(parseGeminiApiKeys({ GEMINI_API_KEYS: "key-a,key-b", GEMINI_API_KEY: "old-solo-key" })).toEqual([
      "key-a",
      "key-b",
    ]);
  });

  it("returns an empty list when neither variable is set", () => {
    expect(parseGeminiApiKeys({})).toEqual([]);
  });

  it("returns an empty list for a GEMINI_API_KEYS that's set but empty/whitespace-only", () => {
    expect(parseGeminiApiKeys({ GEMINI_API_KEYS: "   " })).toEqual([]);
  });

  it("handles a single key in GEMINI_API_KEYS the same as GEMINI_API_KEY (no comma required)", () => {
    expect(parseGeminiApiKeys({ GEMINI_API_KEYS: "only-one-key" })).toEqual(["only-one-key"]);
  });
});

describe("nextKeyIndex", () => {
  it("advances to the next index", () => {
    expect(nextKeyIndex(0, 3)).toBe(1);
    expect(nextKeyIndex(1, 3)).toBe(2);
  });

  it("cycles back to 0 after the last key", () => {
    expect(nextKeyIndex(2, 3)).toBe(0);
  });

  it("cycles a single-key list back to itself (index 0)", () => {
    expect(nextKeyIndex(0, 1)).toBe(0);
  });

  it("throws for a non-positive key count — there's nothing to rotate through", () => {
    expect(() => nextKeyIndex(0, 0)).toThrow();
  });
});
