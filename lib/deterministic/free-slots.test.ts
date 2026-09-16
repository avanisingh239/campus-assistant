import { describe, expect, it } from "vitest";
import {
  classNameTextConfidence,
  findFreeSlotCandidate,
  announcementFitsInFreedSlot,
  findMatchingOpportunityAnnouncement,
} from "./free-slots";
import type { AnnouncementForDeterministicEngine, TimetableEntryRow } from "./types";

function timetableEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: "entry-1",
    student_id: "student-1",
    day_of_week: 1, // Monday, matches 2026-09-14 - see overlap.test.ts
    start_time: "09:00",
    end_time: "10:00",
    course_name: "Database Systems",
    ...overrides,
  };
}

function cancellation(
  overrides: Partial<AnnouncementForDeterministicEngine> = {},
): AnnouncementForDeterministicEngine {
  return {
    id: "cancel-1",
    category: "cancellation",
    event_date: "2026-09-14",
    start_time: null,
    end_time: null,
    linked_class_name: "Database Systems",
    match_confidence: 0.95,
    ...overrides,
  };
}

describe("classNameTextConfidence", () => {
  it("1.0 for an exact match (case/whitespace-insensitive)", () => {
    expect(classNameTextConfidence("Database Systems", "  database   systems ")).toBe(1);
  });

  it("0.5 when one contains the other", () => {
    expect(classNameTextConfidence("DBMS", "DBMS Lab")).toBe(0.5);
  });

  it("0 for unrelated names", () => {
    expect(classNameTextConfidence("Operating Systems", "Database Systems")).toBe(0);
  });

  it("0 for an empty string", () => {
    expect(classNameTextConfidence("", "Database Systems")).toBe(0);
  });
});

describe("findFreeSlotCandidate (rule 5, first half)", () => {
  it("creates a confirmed candidate for an exact class-name match + high match_confidence", () => {
    const c = cancellation({ linked_class_name: "Database Systems", match_confidence: 0.95 });
    const entry = timetableEntry({ course_name: "Database Systems" });

    const candidates = findFreeSlotCandidate(c, [entry]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      student_id: "student-1",
      timetable_entry_id: "entry-1",
      cancellation_announcement_id: "cancel-1",
      status: "confirmed",
    });
  });

  it("downgrades to possible when match_confidence is low, even with an exact text match", () => {
    const c = cancellation({ linked_class_name: "Database Systems", match_confidence: 0.4 });
    const entry = timetableEntry({ course_name: "Database Systems" });
    expect(findFreeSlotCandidate(c, [entry])[0].status).toBe("possible");
  });

  it("downgrades to possible when the text match is only partial, even with high match_confidence", () => {
    const c = cancellation({ linked_class_name: "DBMS", match_confidence: 0.95 });
    const entry = timetableEntry({ course_name: "DBMS Lab" });
    expect(findFreeSlotCandidate(c, [entry])[0].status).toBe("possible");
  });

  it("creates no candidate at all when the class name doesn't match", () => {
    const c = cancellation({ linked_class_name: "Operating Systems" });
    const entry = timetableEntry({ course_name: "Database Systems" });
    expect(findFreeSlotCandidate(c, [entry])).toHaveLength(0);
  });

  it("creates no candidate when match_confidence is 0 or null, even with an exact text match", () => {
    const entry = timetableEntry({ course_name: "Database Systems" });
    expect(findFreeSlotCandidate(cancellation({ match_confidence: 0 }), [entry])).toHaveLength(0);
    expect(findFreeSlotCandidate(cancellation({ match_confidence: null }), [entry])).toHaveLength(0);
  });

  it("creates no candidate for a non-cancellation announcement", () => {
    const c = cancellation({ category: "event" });
    const entry = timetableEntry();
    expect(findFreeSlotCandidate(c, [entry])).toHaveLength(0);
  });

  it("only matches entries on the same day of week as the cancellation's event_date", () => {
    const c = cancellation({ event_date: "2026-09-14" }); // Monday
    const wrongDay = timetableEntry({ day_of_week: 2 }); // Tuesday
    expect(findFreeSlotCandidate(c, [wrongDay])).toHaveLength(0);
  });

  it("fans out across multiple students whose timetables match", () => {
    const c = cancellation();
    const entryA = timetableEntry({ id: "a", student_id: "student-a" });
    const entryB = timetableEntry({ id: "b", student_id: "student-b" });
    const candidates = findFreeSlotCandidate(c, [entryA, entryB]);
    expect(candidates.map((cand) => cand.student_id).sort()).toEqual(["student-a", "student-b"]);
  });

  it("still matches when called in the reverse-trigger shape — a single new/edited timetable entry checked against an already-existing cancellation, not a new cancellation checked against existing entries", () => {
    // Real reported bug: a cancellation for "BEE, Monday 2-3pm" was
    // ingested before the student had "BEE" on their timetable at all.
    // lib/deterministic/sync.ts's matchTimetableEntryToExistingCancellations
    // fixes this by calling this exact function with a one-entry list —
    // this test locks in that this function's own matching rule doesn't
    // care which side triggered the check, only that day/course/confidence
    // line up, so reusing it from the other direction is safe.
    const beeCancelledMonday = cancellation({
      id: "cancel-bee",
      linked_class_name: "BEE",
      event_date: "2026-09-14", // Monday
      match_confidence: 0.9,
    });
    const newlyAddedEntry = timetableEntry({
      id: "new-entry",
      student_id: "student-late-adder",
      day_of_week: 1, // Monday
      course_name: "BEE",
    });

    const candidates = findFreeSlotCandidate(beeCancelledMonday, [newlyAddedEntry]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      student_id: "student-late-adder",
      timetable_entry_id: "new-entry",
      cancellation_announcement_id: "cancel-bee",
      status: "confirmed",
    });
  });
});

describe("announcementFitsInFreedSlot / findMatchingOpportunityAnnouncement (rule 5, second half)", () => {
  const c = cancellation({ event_date: "2026-09-14" });
  const freedWindow = { start_time: "09:00", end_time: "10:00" };

  it("fits when the candidate's time range is inside the freed window on the same day", () => {
    const candidate: AnnouncementForDeterministicEngine = {
      id: "opp-1",
      category: "opportunity",
      event_date: "2026-09-14",
      start_time: "09:15",
      end_time: "09:45",
    };
    expect(announcementFitsInFreedSlot(c, freedWindow, candidate)).toBe(true);
  });

  it("does not fit when the candidate's time range extends outside the freed window", () => {
    const candidate: AnnouncementForDeterministicEngine = {
      id: "opp-2",
      category: "opportunity",
      event_date: "2026-09-14",
      start_time: "09:45",
      end_time: "10:30",
    };
    expect(announcementFitsInFreedSlot(c, freedWindow, candidate)).toBe(false);
  });

  it("does not fit on a different calendar day even with matching times", () => {
    const candidate: AnnouncementForDeterministicEngine = {
      id: "opp-3",
      category: "opportunity",
      event_date: "2026-09-15",
      start_time: "09:15",
      end_time: "09:45",
    };
    expect(announcementFitsInFreedSlot(c, freedWindow, candidate)).toBe(false);
  });

  it("only considers event/opportunity categories, not e.g. registered_update", () => {
    const candidate: AnnouncementForDeterministicEngine = {
      id: "opp-4",
      category: "registered_update",
      event_date: "2026-09-14",
      start_time: "09:15",
      end_time: "09:45",
    };
    expect(announcementFitsInFreedSlot(c, freedWindow, candidate)).toBe(false);
  });

  it("findMatchingOpportunityAnnouncement returns the first fitting candidate's id", () => {
    const nonFitting: AnnouncementForDeterministicEngine = {
      id: "opp-a",
      category: "opportunity",
      event_date: "2026-09-14",
      start_time: "08:00",
      end_time: "08:30",
    };
    const fitting: AnnouncementForDeterministicEngine = {
      id: "opp-b",
      category: "event",
      event_date: "2026-09-14",
      start_time: "09:15",
      end_time: "09:45",
    };
    expect(findMatchingOpportunityAnnouncement(c, freedWindow, [nonFitting, fitting])).toBe("opp-b");
  });

  it("returns null when nothing fits", () => {
    expect(findMatchingOpportunityAnnouncement(c, freedWindow, [])).toBeNull();
  });
});
