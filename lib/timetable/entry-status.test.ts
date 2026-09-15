import { describe, expect, it } from "vitest";
import { buildEntryStatusMap } from "./entry-status";

function entry(overrides: Partial<{ id: string; day_of_week: number; start_time: string; end_time: string; course_name: string }> = {}) {
  return {
    id: "e1",
    day_of_week: 1,
    start_time: "09:00",
    end_time: "10:00",
    course_name: "Database Systems",
    ...overrides,
  };
}

describe("buildEntryStatusMap", () => {
  it("returns an empty map when there are no clashes or free slots", () => {
    const result = buildEntryStatusMap([entry()], [], [], new Map());
    expect(result.size).toBe(0);
  });

  it("reconstructs the overlapping partner for a class_vs_class clash", () => {
    const a = entry({ id: "a", start_time: "09:00", end_time: "10:00" });
    const b = entry({ id: "b", course_name: "Algorithms", start_time: "09:30", end_time: "10:30" });
    const clashes = [
      { timetable_entry_id: "a", announcement_id: null, severity: "confirmed" as const },
      { timetable_entry_id: "b", announcement_id: null, severity: "confirmed" as const },
    ];
    const result = buildEntryStatusMap([a, b], clashes, [], new Map());

    expect(result.get("a")?.clashes).toEqual([{ severity: "confirmed", label: "Algorithms" }]);
    expect(result.get("b")?.clashes).toEqual([{ severity: "confirmed", label: "Database Systems" }]);
    expect(result.get("a")?.worstSeverity).toBe("confirmed");
  });

  it("does not duplicate a class_vs_class partner when an entry overlaps only one other entry", () => {
    const a = entry({ id: "a" });
    const b = entry({ id: "b", course_name: "Algorithms" });
    // Two rows for "a" (mirroring detectClassVsClassClashes's real output
    // shape) must still produce exactly one ClashDetail, not two.
    const clashes = [
      { timetable_entry_id: "a", announcement_id: null, severity: "confirmed" as const },
      { timetable_entry_id: "b", announcement_id: null, severity: "confirmed" as const },
    ];
    const result = buildEntryStatusMap([a, b], clashes, [], new Map());
    expect(result.get("a")?.clashes).toHaveLength(1);
  });

  it("labels a class_vs_event clash with the announcement's title and severity", () => {
    const titles = new Map([["ann-1", "Guest Lecture"]]);
    const clashes = [{ timetable_entry_id: "e1", announcement_id: "ann-1", severity: "possible" as const }];
    const result = buildEntryStatusMap([entry()], clashes, [], titles);
    expect(result.get("e1")?.clashes).toEqual([{ severity: "possible", label: "Guest Lecture" }]);
    expect(result.get("e1")?.worstSeverity).toBe("possible");
  });

  it("worstSeverity is confirmed when the entry has both a possible and a confirmed clash", () => {
    const titles = new Map([
      ["ann-1", "Workshop"],
      ["ann-2", "Registered Talk"],
    ]);
    const clashes = [
      { timetable_entry_id: "e1", announcement_id: "ann-1", severity: "possible" as const },
      { timetable_entry_id: "e1", announcement_id: "ann-2", severity: "confirmed" as const },
    ];
    const result = buildEntryStatusMap([entry()], clashes, [], titles);
    expect(result.get("e1")?.worstSeverity).toBe("confirmed");
    expect(result.get("e1")?.clashes).toHaveLength(2);
  });

  it("falls back to a generic label when an announcement title is missing", () => {
    const clashes = [{ timetable_entry_id: "e1", announcement_id: "unknown", severity: "possible" as const }];
    const result = buildEntryStatusMap([entry()], clashes, [], new Map());
    expect(result.get("e1")?.clashes[0].label).toBe("another announcement");
  });

  it("ignores event_vs_event clashes (no timetable_entry_id to attach to)", () => {
    const clashes = [{ timetable_entry_id: null, announcement_id: "ann-1", severity: "confirmed" as const }];
    const result = buildEntryStatusMap([entry()], clashes, [], new Map());
    expect(result.size).toBe(0);
  });

  it("marks an entry cancelled with no matched opportunity", () => {
    const freeSlots = [{ timetable_entry_id: "e1", matched_announcement_id: null }];
    const result = buildEntryStatusMap([entry()], [], freeSlots, new Map());
    expect(result.get("e1")?.cancelled).toBe(true);
    expect(result.get("e1")?.matchedAnnouncementTitle).toBeNull();
  });

  it("names the matched opportunity when a free slot has one", () => {
    const titles = new Map([["ann-1", "Photography Workshop"]]);
    const freeSlots = [{ timetable_entry_id: "e1", matched_announcement_id: "ann-1" }];
    const result = buildEntryStatusMap([entry()], [], freeSlots, titles);
    expect(result.get("e1")?.cancelled).toBe(true);
    expect(result.get("e1")?.matchedAnnouncementTitle).toBe("Photography Workshop");
  });

  it("an entry can be both cancelled and clashing at the same time", () => {
    const titles = new Map([["ann-1", "Guest Lecture"]]);
    const clashes = [{ timetable_entry_id: "e1", announcement_id: "ann-1", severity: "possible" as const }];
    const freeSlots = [{ timetable_entry_id: "e1", matched_announcement_id: null }];
    const result = buildEntryStatusMap([entry()], clashes, freeSlots, titles);
    const status = result.get("e1")!;
    expect(status.cancelled).toBe(true);
    expect(status.clashes).toHaveLength(1);
  });
});
