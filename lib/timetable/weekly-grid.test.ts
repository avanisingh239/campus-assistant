import { describe, expect, it } from "vitest";
import { buildWeeklyGrid } from "./weekly-grid";
import type { TimetableEntryRow } from "@/lib/deterministic/types";

function entry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: "e1",
    student_id: "s1",
    day_of_week: 1,
    start_time: "09:00",
    end_time: "10:00",
    course_name: "Test Course",
    ...overrides,
  };
}

describe("buildWeeklyGrid", () => {
  it("always includes Monday-Saturday even with no entries", () => {
    const columns = buildWeeklyGrid([]);
    expect(columns.map((c) => c.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("groups entries into their matching day column", () => {
    const monday = entry({ id: "mon", day_of_week: 1 });
    const wednesday = entry({ id: "wed", day_of_week: 3 });
    const columns = buildWeeklyGrid([monday, wednesday]);
    expect(columns.find((c) => c.dayOfWeek === 1)?.entries.map((e) => e.id)).toEqual(["mon"]);
    expect(columns.find((c) => c.dayOfWeek === 3)?.entries.map((e) => e.id)).toEqual(["wed"]);
    expect(columns.find((c) => c.dayOfWeek === 2)?.entries).toEqual([]);
  });

  it("sorts entries within a day by start time", () => {
    const later = entry({ id: "later", start_time: "14:00", end_time: "15:00" });
    const earlier = entry({ id: "earlier", start_time: "09:00", end_time: "10:00" });
    const columns = buildWeeklyGrid([later, earlier]);
    expect(columns.find((c) => c.dayOfWeek === 1)?.entries.map((e) => e.id)).toEqual(["earlier", "later"]);
  });

  it("adds a day outside Monday-Saturday (e.g. Sunday) rather than dropping it", () => {
    const sunday = entry({ id: "sun", day_of_week: 0 });
    const columns = buildWeeklyGrid([sunday]);
    expect(columns.map((c) => c.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(columns.find((c) => c.dayOfWeek === 0)?.entries.map((e) => e.id)).toEqual(["sun"]);
  });

  it("does not mutate the input array", () => {
    const input = [entry({ id: "a", start_time: "14:00" }), entry({ id: "b", start_time: "09:00" })];
    const inputCopy = [...input];
    buildWeeklyGrid(input);
    expect(input).toEqual(inputCopy);
  });
});
