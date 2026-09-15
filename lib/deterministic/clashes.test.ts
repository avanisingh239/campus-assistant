import { describe, expect, it } from "vitest";
import {
  detectClassVsClassClashes,
  detectClassVsEventClashes,
  detectEventVsEventClashes,
  detectAllClashesForStudent,
} from "./clashes";
import type {
  AnnouncementForDeterministicEngine,
  EngagementStatus,
  TimetableEntryRow,
} from "./types";

function timetableEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: "entry-1",
    student_id: "student-1",
    day_of_week: 1, // Monday-numbered per dayOfWeekFromDate's convention
    start_time: "09:00",
    end_time: "10:00",
    course_name: "Database Systems",
    ...overrides,
  };
}

function announcement(
  overrides: Partial<AnnouncementForDeterministicEngine> = {},
): AnnouncementForDeterministicEngine {
  return {
    id: "ann-1",
    category: "event",
    event_date: "2026-09-14", // a Monday (day_of_week 1) - see overlap.test.ts
    start_time: "09:30",
    end_time: "10:30",
    ...overrides,
  };
}

describe("detectClassVsClassClashes (rule 1)", () => {
  it("flags two overlapping same-day entries, one row per side, always confirmed", () => {
    const a = timetableEntry({ id: "a", start_time: "09:00", end_time: "10:00" });
    const b = timetableEntry({ id: "b", start_time: "09:30", end_time: "10:30" });

    const clashes = detectClassVsClassClashes([a, b]);

    expect(clashes).toHaveLength(2);
    expect(clashes.every((c) => c.clash_type === "class_vs_class")).toBe(true);
    expect(clashes.every((c) => c.severity === "confirmed")).toBe(true);
    expect(clashes.map((c) => c.timetable_entry_id).sort()).toEqual(["a", "b"]);
  });

  it("does not flag entries on different days", () => {
    const a = timetableEntry({ id: "a", day_of_week: 1 });
    const b = timetableEntry({ id: "b", day_of_week: 2 });
    expect(detectClassVsClassClashes([a, b])).toHaveLength(0);
  });

  it("does not flag same-day entries that don't overlap", () => {
    const a = timetableEntry({ id: "a", start_time: "09:00", end_time: "10:00" });
    const b = timetableEntry({ id: "b", start_time: "10:00", end_time: "11:00" });
    expect(detectClassVsClassClashes([a, b])).toHaveLength(0);
  });

  it("is independent of any announcement or interest status", () => {
    // No announcements passed in at all - this suite never touches them,
    // proving the check is purely timetable-vs-timetable.
    const a = timetableEntry({ id: "a" });
    const b = timetableEntry({ id: "b", start_time: "09:30", end_time: "10:30" });
    expect(detectClassVsClassClashes([a, b]).length).toBeGreaterThan(0);
  });
});

describe("detectClassVsEventClashes (rule 2)", () => {
  const entry = timetableEntry({ id: "entry-1", day_of_week: 1, start_time: "09:00", end_time: "10:00" });
  const overlappingEvent = announcement({
    id: "ann-1",
    category: "event",
    event_date: "2026-09-14", // Monday
    start_time: "09:30",
    end_time: "10:30",
  });

  it("does NOT clash when nobody has expressed interest", () => {
    const engagement = new Map<string, EngagementStatus>(); // no entry at all
    expect(detectClassVsEventClashes([entry], [overlappingEvent], engagement)).toHaveLength(0);
  });

  it("does NOT clash when explicitly not_interested", () => {
    const engagement = new Map<string, EngagementStatus>([["ann-1", "not_interested"]]);
    expect(detectClassVsEventClashes([entry], [overlappingEvent], engagement)).toHaveLength(0);
  });

  it("clashes (possible) when interested", () => {
    const engagement = new Map<string, EngagementStatus>([["ann-1", "interested"]]);
    const clashes = detectClassVsEventClashes([entry], [overlappingEvent], engagement);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({
      clash_type: "class_vs_event",
      timetable_entry_id: "entry-1",
      announcement_id: "ann-1",
      severity: "possible",
    });
  });

  it("clashes (confirmed) when registered", () => {
    const engagement = new Map<string, EngagementStatus>([["ann-1", "registered"]]);
    const clashes = detectClassVsEventClashes([entry], [overlappingEvent], engagement);
    expect(clashes[0].severity).toBe("confirmed");
  });

  it("ignores categories outside the eligible set", () => {
    const deadline = announcement({ id: "ann-2", category: "deadline" });
    const engagement = new Map<string, EngagementStatus>([["ann-2", "registered"]]);
    expect(detectClassVsEventClashes([entry], [deadline], engagement)).toHaveLength(0);
  });

  it("does not clash on a different day even if interested", () => {
    const otherDay = announcement({ id: "ann-3", event_date: "2026-09-15" }); // Tuesday
    const engagement = new Map<string, EngagementStatus>([["ann-3", "registered"]]);
    expect(detectClassVsEventClashes([entry], [otherDay], engagement)).toHaveLength(0);
  });

  it("does not clash on the same day if times don't overlap", () => {
    const laterSameDay = announcement({ id: "ann-4", start_time: "10:00", end_time: "11:00" });
    const engagement = new Map<string, EngagementStatus>([["ann-4", "registered"]]);
    expect(detectClassVsEventClashes([entry], [laterSameDay], engagement)).toHaveLength(0);
  });
});

describe("detectEventVsEventClashes (rule 3)", () => {
  const eventA = announcement({ id: "a", event_date: "2026-09-14", start_time: "14:00", end_time: "15:00" });
  const eventB = announcement({ id: "b", event_date: "2026-09-14", start_time: "14:30", end_time: "15:30" });

  it("does NOT clash when only one side is interested", () => {
    const engagement = new Map<string, EngagementStatus>([["a", "interested"]]);
    expect(detectEventVsEventClashes([eventA, eventB], engagement)).toHaveLength(0);
  });

  it("does NOT clash when one side is not_interested even if the other is registered", () => {
    const engagement = new Map<string, EngagementStatus>([
      ["a", "registered"],
      ["b", "not_interested"],
    ]);
    expect(detectEventVsEventClashes([eventA, eventB], engagement)).toHaveLength(0);
  });

  it("clashes (possible) when both are only interested", () => {
    const engagement = new Map<string, EngagementStatus>([
      ["a", "interested"],
      ["b", "interested"],
    ]);
    const clashes = detectEventVsEventClashes([eventA, eventB], engagement);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({
      clash_type: "event_vs_event",
      announcement_id: "a",
      other_announcement_id: "b",
      severity: "possible",
    });
  });

  it("clashes (confirmed) when at least one side is registered", () => {
    const engagement = new Map<string, EngagementStatus>([
      ["a", "interested"],
      ["b", "registered"],
    ]);
    expect(detectEventVsEventClashes([eventA, eventB], engagement)[0].severity).toBe("confirmed");
  });

  it("does not clash across different calendar days", () => {
    const eventC = announcement({ id: "c", event_date: "2026-09-15", start_time: "14:00", end_time: "15:00" });
    const engagement = new Map<string, EngagementStatus>([
      ["a", "registered"],
      ["c", "registered"],
    ]);
    expect(detectEventVsEventClashes([eventA, eventC], engagement)).toHaveLength(0);
  });
});

describe("severity rule (rule 4) across both event-based clash types", () => {
  it("both interested -> possible; either registered -> confirmed", () => {
    const entry = timetableEntry();
    const ev = announcement();

    const possible = detectClassVsEventClashes(
      [entry],
      [ev],
      new Map([[ev.id, "interested" as EngagementStatus]]),
    );
    expect(possible[0].severity).toBe("possible");

    const confirmed = detectClassVsEventClashes(
      [entry],
      [ev],
      new Map([[ev.id, "registered" as EngagementStatus]]),
    );
    expect(confirmed[0].severity).toBe("confirmed");
  });
});

describe("detectAllClashesForStudent", () => {
  it("combines all three clash types", () => {
    const a = timetableEntry({ id: "a", start_time: "09:00", end_time: "10:00" });
    const b = timetableEntry({ id: "b", start_time: "09:30", end_time: "10:30" }); // class_vs_class with a
    const ev = announcement({ id: "ev", event_date: "2026-09-14", start_time: "09:15", end_time: "09:45" }); // class_vs_event with a/b

    const clashes = detectAllClashesForStudent(
      [a, b],
      [ev],
      new Map([["ev", "registered" as EngagementStatus]]),
    );

    const types = new Set(clashes.map((c) => c.clash_type));
    expect(types.has("class_vs_class")).toBe(true);
    expect(types.has("class_vs_event")).toBe(true);
  });
});
