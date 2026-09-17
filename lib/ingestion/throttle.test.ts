import { describe, expect, it } from "vitest";
import {
  computeBatchDelays,
  delayBeforeRequest,
  MIN_REQUEST_SPACING_MS,
  SAFE_REQUESTS_PER_MINUTE,
} from "./throttle";

describe("delayBeforeRequest", () => {
  it("never delays a single one-off submission (batch size 1)", () => {
    expect(delayBeforeRequest(0, 1)).toBe(0);
  });

  it("never delays the first request in a real batch", () => {
    expect(delayBeforeRequest(0, 5)).toBe(0);
  });

  it("delays every request after the first in a real batch", () => {
    expect(delayBeforeRequest(1, 5)).toBe(MIN_REQUEST_SPACING_MS);
    expect(delayBeforeRequest(4, 5)).toBe(MIN_REQUEST_SPACING_MS);
  });

  it("MIN_REQUEST_SPACING_MS keeps at most SAFE_REQUESTS_PER_MINUTE requests in any rolling 60s window", () => {
    expect(MIN_REQUEST_SPACING_MS * SAFE_REQUESTS_PER_MINUTE).toBeLessThanOrEqual(60_000);
    // and it shouldn't be needlessly conservative either — one fewer request
    // shouldn't also still fit inside 60s at this spacing.
    expect(MIN_REQUEST_SPACING_MS * (SAFE_REQUESTS_PER_MINUTE + 1)).toBeGreaterThan(60_000);
  });
});

describe("computeBatchDelays", () => {
  it("returns [0] for a batch of 1 — never throttled", () => {
    expect(computeBatchDelays(1)).toEqual([0]);
  });

  it("returns 0 for the first request and the fixed spacing for every one after, for a real batch size", () => {
    expect(computeBatchDelays(4)).toEqual([0, MIN_REQUEST_SPACING_MS, MIN_REQUEST_SPACING_MS, MIN_REQUEST_SPACING_MS]);
  });

  it("scales to a larger batch (a real WhatsApp export) the same way", () => {
    const delays = computeBatchDelays(10);
    expect(delays).toHaveLength(10);
    expect(delays[0]).toBe(0);
    expect(delays.slice(1).every((d) => d === MIN_REQUEST_SPACING_MS)).toBe(true);
  });

  it("returns an empty array for a batch of 0", () => {
    expect(computeBatchDelays(0)).toEqual([]);
  });
});
