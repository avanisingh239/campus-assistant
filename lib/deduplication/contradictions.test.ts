import { describe, expect, it } from "vitest";
import { detectFieldContradictions } from "./contradictions";
import type { FieldValues } from "./contradictions";

function values(overrides: Partial<FieldValues> = {}): FieldValues {
  return {
    event_date: null,
    start_time: null,
    end_time: null,
    deadline_at: null,
    seat_count: null,
    ...overrides,
  };
}

describe("detectFieldContradictions", () => {
  it("returns nothing when every shared field agrees", () => {
    const existing = values({ deadline_at: "2026-05-05T18:00:00.000Z" });
    const incoming = values({ deadline_at: "2026-05-05T18:00:00.000Z" });
    expect(detectFieldContradictions(existing, incoming)).toEqual([]);
  });

  it("flags a disagreeing deadline_at", () => {
    const existing = values({ deadline_at: "2026-05-05T18:00:00.000Z" });
    const incoming = values({ deadline_at: "2026-05-06T09:00:00.000Z" });

    const result = detectFieldContradictions(existing, incoming);

    expect(result).toEqual([
      {
        field_name: "deadline_at",
        existingValue: "2026-05-05T18:00:00.000Z",
        newValue: "2026-05-06T09:00:00.000Z",
      },
    ]);
  });

  it("does NOT flag a deadline_at that's merely serialized differently but is the same instant", () => {
    const existing = values({ deadline_at: "2026-05-05T18:00:00.000Z" });
    const incoming = values({ deadline_at: "2026-05-05T18:00:00Z" });
    expect(detectFieldContradictions(existing, incoming)).toEqual([]);
  });

  it("flags a disagreeing seat_count", () => {
    const existing = values({ seat_count: 30 });
    const incoming = values({ seat_count: 25 });

    expect(detectFieldContradictions(existing, incoming)).toEqual([
      { field_name: "seat_count", existingValue: "30", newValue: "25" },
    ]);
  });

  it("flags multiple disagreeing fields independently", () => {
    const existing = values({ event_date: "2026-09-20", start_time: "09:00", end_time: "10:00" });
    const incoming = values({ event_date: "2026-09-20", start_time: "09:30", end_time: "10:30" });

    const result = detectFieldContradictions(existing, incoming);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.field_name).sort()).toEqual(["end_time", "start_time"]);
  });

  it("does not treat a field that's null on either side as a conflict (never fills in a missing value either)", () => {
    const existing = values({ seat_count: null });
    const incoming = values({ seat_count: 25 });
    expect(detectFieldContradictions(existing, incoming)).toEqual([]);
  });

  it("does not treat two announcements with no fields set at all as conflicting", () => {
    expect(detectFieldContradictions(values(), values())).toEqual([]);
  });
});
