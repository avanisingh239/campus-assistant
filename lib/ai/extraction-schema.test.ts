import { describe, expect, it } from "vitest";
import { ExtractionBatchSchema } from "./extraction-schema";

const validItem = {
  category: "deadline" as const,
  title: "Database Systems assignment 2 due",
  why_it_matters: "Late submissions lose 10% per day.",
  what_to_do_next: "Submit assignment on LMS",
  confidence: "clear" as const,
  confidence_note: null,
  event_date: "2026-09-20",
  start_time: null,
  end_time: null,
  deadline_at: "2026-09-20T23:59:00Z",
  linked_class_name: "Database Systems",
  match_confidence: 0.9,
  seat_count: null,
  seats_unclear: false,
  link_url: null,
};

describe("ExtractionBatchSchema", () => {
  it("accepts a well-formed extraction batch", () => {
    const result = ExtractionBatchSchema.safeParse({
      announcements: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty batch (no announcements found in the text)", () => {
    const result = ExtractionBatchSchema.safeParse({ announcements: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a category outside the real announcement_category enum", () => {
    // 'cancellation_reschedule' was the old (pre-schema) category name —
    // guards against ever regressing to it (docs/ai-contracts.md §3).
    const result = ExtractionBatchSchema.safeParse({
      announcements: [{ ...validItem, category: "cancellation_reschedule" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects legacy confidence_state values", () => {
    const result = ExtractionBatchSchema.safeParse({
      announcements: [{ ...validItem, confidence: "partially_clear" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed event_date", () => {
    const result = ExtractionBatchSchema.safeParse({
      announcements: [{ ...validItem, event_date: "09/20/2026" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range match_confidence", () => {
    const result = ExtractionBatchSchema.safeParse({
      announcements: [{ ...validItem, match_confidence: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults seats_unclear to false when omitted", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { seats_unclear, ...withoutSeatsUnclear } = validItem;
    const result = ExtractionBatchSchema.safeParse({
      announcements: [withoutSeatsUnclear],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.announcements[0].seats_unclear).toBe(false);
    }
  });
});
