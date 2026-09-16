import { describe, expect, it } from "vitest";
import { ALWAYS_SHARED_CATEGORIES, findDuplicateMatch, titleSimilarity } from "./match";
import type { DedupCandidate, DedupFields } from "./types";

function fields(overrides: Partial<DedupFields> = {}): DedupFields {
  return {
    category: "deadline",
    title: "Database Systems fee payment deadline",
    event_date: null,
    start_time: null,
    end_time: null,
    deadline_at: "2026-05-05T18:00:00.000Z",
    linked_class_name: null,
    seat_count: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    ...fields(),
    id: "existing-1",
    submittedByClassName: "CSE-2028-A",
    ...overrides,
  };
}

describe("titleSimilarity", () => {
  it("scores 1 for identical (stopword-stripped) word sets", () => {
    expect(titleSimilarity("Fee payment deadline", "The fee payment deadline")).toBe(1);
  });

  it("scores high when one title is a more verbose version of the other", () => {
    const score = titleSimilarity(
      "DBMS Assignment 3 Deadline",
      "DBMS Assignment 3 Deadline Extended to Friday",
    );
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it("scores low for topically-similar but actually-different titles", () => {
    const score = titleSimilarity("Library fee deadline", "Hostel fee deadline");
    expect(score).toBeLessThan(0.6);
  });

  it("scores 0 when either title has no meaningful words at all", () => {
    expect(titleSimilarity("the a of", "Fee deadline")).toBe(0);
  });
});

describe("findDuplicateMatch — same-class deadline merges", () => {
  it("merges two matching deadline messages from the SAME class (same date, same title)", () => {
    const newItem = fields({ title: "Database Systems fee deadline" });
    const existing = candidate({ title: "Database Systems fee payment deadline" });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("merges two messages from different WhatsApp GROUPS as long as the submitting STUDENT's class is the same — group name is only a display label, not the privacy scope", () => {
    // The task's own example: "two different class groups both mentioning
    // the same fee deadline" should merge. submitted_by_class_name (the
    // RLS-matching key) has nothing to do with which group chat a message
    // came from — a student's own class is the same regardless of which
    // of their class's several WhatsApp groups happened to forward it.
    const newItem = fields({ title: "Database Systems fee deadline" });
    const existing = candidate({
      title: "Database Systems fee payment deadline",
      submittedByClassName: "CSE-2028-A", // same class, implicitly a different group in practice
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("merges via linked_class_name (exact after normalization) even when titles differ a lot", () => {
    const newItem = fields({
      title: "Reminder: pay your fees soon or face a late charge",
      linked_class_name: "  Database   Systems ",
    });
    const existing = candidate({ title: "Fee deadline", linked_class_name: "database systems" });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("does NOT merge on a merely-partial linked_class_name match (stricter than the free-slot engine's own 0.5 threshold)", () => {
    const newItem = fields({
      title: "Reminder: pay your fees soon or face a late charge",
      linked_class_name: "DBMS",
    });
    const existing = candidate({ title: "Fee deadline", linked_class_name: "DBMS Lab" });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });
});

describe("findDuplicateMatch — the privacy fix: class-scoped categories must not merge across classes", () => {
  it("does NOT merge two matching-but-different-class deadline messages", () => {
    // The exact case this pass exists to prevent: two classes' deadlines
    // that would otherwise look identical (same category, same date, same
    // title) must stay as two separate announcements, each visible only to
    // its own class — merging them would give the announcements RLS
    // policy's "readable if ANY linked source's class matches" logic a row
    // with sources from both classes attached.
    const newItem = fields({ title: "Database Systems fee deadline" });
    const existingFromOtherClass = candidate({
      title: "Database Systems fee payment deadline",
      submittedByClassName: "ECE-2027-B",
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existingFromOtherClass])).toBeNull();
  });

  it("does not merge when the new message's class is unknown (null)", () => {
    const newItem = fields();
    const existing = candidate({ submittedByClassName: "CSE-2028-A" });

    expect(findDuplicateMatch(newItem, null, [existing])).toBeNull();
  });

  it("does not merge when the existing candidate's class is unknown (null)", () => {
    const newItem = fields();
    const existing = candidate({ submittedByClassName: null });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("class comparison is case/whitespace-insensitive, matching the RLS policy's own comparison", () => {
    const newItem = fields();
    const existing = candidate({ submittedByClassName: "  cse-2028-a  " });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });
});

describe("findDuplicateMatch — always-shared categories merge across classes freely", () => {
  it("merges a matching event across two different classes", () => {
    const newItem = fields({
      category: "event",
      title: "Synergy Orientation",
      event_date: "2026-09-20",
      start_time: "09:00",
      end_time: "10:00",
      deadline_at: null,
    });
    const existing = candidate({
      category: "event",
      title: "Synergy Orientation session",
      event_date: "2026-09-20",
      start_time: "09:00",
      end_time: "10:00",
      deadline_at: null,
      submittedByClassName: "ECE-2027-B",
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("ALWAYS_SHARED_CATEGORIES matches the RLS policy's cross-class category list exactly", () => {
    expect([...ALWAYS_SHARED_CATEGORIES].sort()).toEqual(
      ["event", "opportunity", "registered_update", "society_link"].sort(),
    );
  });
});

describe("findDuplicateMatch — genuinely different things must NOT merge", () => {
  it("does not merge same-category, same-date, different-event announcements", () => {
    const newItem = fields({
      category: "event",
      title: "Robotics Club Workshop",
      event_date: "2026-09-20",
      start_time: "09:00",
      end_time: "10:00",
      deadline_at: null,
    });
    const existing = candidate({
      category: "event",
      title: "Chess Club Tournament",
      event_date: "2026-09-20",
      start_time: "09:00",
      end_time: "10:00",
      deadline_at: null,
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("does not merge across different categories even with an identical title/date", () => {
    const newItem = fields({ category: "deadline" });
    const existing = candidate({ category: "cancellation" });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("does not merge deadlines more than the tolerance apart", () => {
    const newItem = fields({ deadline_at: "2026-05-05T18:00:00.000Z" });
    const existing = candidate({ deadline_at: "2026-05-10T18:00:00.000Z" });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("merges deadlines within the 24h tolerance", () => {
    const newItem = fields({ deadline_at: "2026-05-05T23:59:00.000Z" });
    const existing = candidate({ deadline_at: "2026-05-06T10:00:00.000Z" });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("does not merge on date-closeness alone when neither side has a usable date field for the other's category shape", () => {
    const newItem = fields({ deadline_at: null, event_date: null });
    const existing = candidate({ deadline_at: null, event_date: null });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(findDuplicateMatch(fields(), "CSE-2028-A", [])).toBeNull();
  });
});
