import { describe, expect, it } from "vitest";
import { buildContradictionSummary } from "./contradiction-summary";

describe("buildContradictionSummary", () => {
  it("matches the prototype's exact wording for a 2-vs-1 date split", () => {
    const summary = buildContradictionSummary("deadline_at", [
      { value: "2026-05-05", source_message_id: "m1" },
      { value: "2026-05-05", source_message_id: "m2" },
      { value: "2026-05-06", source_message_id: "m3" },
    ]);
    expect(summary).toBe(
      "2 sources say the deadline is May 5, 1 source says May 6 — not resolved automatically.",
    );
  });

  it("humanizes event_date as 'date'", () => {
    const summary = buildContradictionSummary("event_date", [
      { value: "2026-05-05" },
      { value: "2026-05-06" },
    ]);
    expect(summary).toContain("the date is May 5");
  });

  it("falls back to a generic underscore-stripped field name", () => {
    const summary = buildContradictionSummary("some_other_field", [{ value: "X" }, { value: "Y" }]);
    expect(summary).toContain("the some other field is X");
  });

  it("passes non-date values through unchanged", () => {
    const summary = buildContradictionSummary("linked_class_name", [
      { value: "Room 201" },
      { value: "Room 304" },
    ]);
    expect(summary).toContain("Room 201");
    expect(summary).toContain("Room 304");
  });
});
