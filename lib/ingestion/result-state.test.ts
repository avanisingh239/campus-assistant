import { describe, expect, it } from "vitest";
import { classifyIngestOutcome } from "./result-state";

describe("classifyIngestOutcome", () => {
  it("is 'failed' when nothing succeeded, even for a batch", () => {
    expect(
      classifyIngestOutcome({ successCount: 0, failureCount: 3, extracted: [] }),
    ).toBe("failed");
  });

  it("is 'failed' for a single paste that threw", () => {
    expect(
      classifyIngestOutcome({ successCount: 0, failureCount: 1, extracted: [] }),
    ).toBe("failed");
  });

  it("is 'partially_parsed' whenever some but not all messages succeeded", () => {
    expect(
      classifyIngestOutcome({
        successCount: 2,
        failureCount: 1,
        extracted: [{ confidence: "clear" }, { confidence: "clear" }],
      }),
    ).toBe("partially_parsed");
  });

  it("is 'needs_clarification' when everything succeeded but every extracted item is unclear", () => {
    expect(
      classifyIngestOutcome({
        successCount: 1,
        failureCount: 0,
        extracted: [{ confidence: "unclear" }, { confidence: "unclear" }],
      }),
    ).toBe("needs_clarification");
  });

  it("is 'successfully_parsed' for a mix of clear/partial/unclear items (not hidden, just not the dominant state)", () => {
    expect(
      classifyIngestOutcome({
        successCount: 1,
        failureCount: 0,
        extracted: [{ confidence: "clear" }, { confidence: "unclear" }],
      }),
    ).toBe("successfully_parsed");
  });

  it("is 'successfully_parsed' for an all-clear batch", () => {
    expect(
      classifyIngestOutcome({
        successCount: 3,
        failureCount: 0,
        extracted: [{ confidence: "clear" }, { confidence: "clear" }, { confidence: "clear" }],
      }),
    ).toBe("successfully_parsed");
  });

  it("is 'successfully_parsed', not 'needs_clarification', when a run succeeds but extracts zero announcements", () => {
    // e.g. pasted text with no campus-relevant content at all — the pipeline
    // itself succeeded, there's just nothing to show; not a signal to flag
    // as ambiguous.
    expect(
      classifyIngestOutcome({ successCount: 1, failureCount: 0, extracted: [] }),
    ).toBe("successfully_parsed");
  });
});
