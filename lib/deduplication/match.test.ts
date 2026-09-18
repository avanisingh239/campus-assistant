import { describe, expect, it } from "vitest";
import { ALWAYS_SHARED_CATEGORIES, findDuplicateMatch } from "./match";
import type { DedupCandidate, DedupFields } from "./types";

// Unit vectors at known angles, so cosineSimilarity(CLOSE_EMBEDDING_A, x)
// is just x's first component — the same fixture shape
// embedding-similarity.test.ts uses, reused here so findDuplicateMatch's
// embedding path can be exercised without a real Gemini call (see
// lib/ai/embed.ts's own doc comment on why that can't happen in tests).
const EMBEDDING_A = [1, 0]; // "the new item"
const EMBEDDING_CLOSE = [0.9, Math.sqrt(1 - 0.9 ** 2)]; // cosine sim 0.9 vs. A — a real paraphrase
const EMBEDDING_FAR = [0.3, Math.sqrt(1 - 0.3 ** 2)]; // cosine sim 0.3 vs. A — a different notice

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
    title_embedding: null,
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

describe("findDuplicateMatch — same-class deadline merges", () => {
  it("merges two matching deadline messages from the SAME class (same date, close title embeddings, real ML paraphrase upgrade)", () => {
    const newItem = fields({ title: "Database Systems fee deadline", title_embedding: EMBEDDING_A });
    const existing = candidate({
      title: "Database Systems fee payment deadline",
      title_embedding: EMBEDDING_CLOSE,
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("merges two messages from different WhatsApp GROUPS as long as the submitting STUDENT's class is the same — group name is only a display label, not the privacy scope", () => {
    // The task's own example: "two different class groups both mentioning
    // the same fee deadline" should merge. submitted_by_class_name (the
    // RLS-matching key) has nothing to do with which group chat a message
    // came from — a student's own class is the same regardless of which
    // of their class's several WhatsApp groups happened to forward it.
    const newItem = fields({ title: "Database Systems fee deadline", title_embedding: EMBEDDING_A });
    const existing = candidate({
      title: "Database Systems fee payment deadline",
      title_embedding: EMBEDDING_CLOSE,
      submittedByClassName: "CSE-2028-A", // same class, implicitly a different group in practice
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("merges via linked_class_name (exact after normalization) even when embeddings are missing entirely", () => {
    const newItem = fields({
      title: "Reminder: pay your fees soon or face a late charge",
      linked_class_name: "  Database   Systems ",
    });
    const existing = candidate({ title: "Fee deadline", linked_class_name: "database systems" });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("does NOT merge on a merely-partial linked_class_name match (stricter than the free-slot engine's own 0.5 threshold), even with close embeddings", () => {
    const newItem = fields({
      title: "Reminder: pay your fees soon or face a late charge",
      linked_class_name: "DBMS",
      title_embedding: EMBEDDING_A,
    });
    const existing = candidate({
      title: "Fee deadline",
      linked_class_name: "DBMS Lab",
      title_embedding: EMBEDDING_CLOSE,
    });

    // linked_class_name is the ONLY signal used once both sides have one
    // (see match.ts's classOrEmbeddingMatches doc comment) — a close
    // embedding does not override a failed class-name match.
    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });
});

describe("findDuplicateMatch — embedding-based semantic matching (the real ML upgrade)", () => {
  it("merges two titles with ZERO shared words but a close embedding — exactly what plain word-overlap could never catch", () => {
    const newItem = fields({
      title: "DBMS Assignment 3 Deadline",
      title_embedding: EMBEDDING_A,
    });
    const existing = candidate({
      title: "The database systems homework 3 due date",
      title_embedding: EMBEDDING_CLOSE,
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBe(existing);
  });

  it("does not merge two titles with a merely topically-similar (below-threshold) embedding", () => {
    const newItem = fields({ title: "Library fee deadline", title_embedding: EMBEDDING_A });
    const existing = candidate({ title: "Hostel fee deadline", title_embedding: EMBEDDING_FAR });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("does not merge when the new item's embedding is null (the documented graceful fallback — embedText failed/rate-limited for this item)", () => {
    const newItem = fields({ title: "Database Systems fee deadline", title_embedding: null });
    const existing = candidate({
      title: "Database Systems fee payment deadline",
      title_embedding: EMBEDDING_CLOSE,
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("does not merge when the existing candidate's embedding is null (an older announcement ingested before this feature existed)", () => {
    const newItem = fields({ title: "Database Systems fee deadline", title_embedding: EMBEDDING_A });
    const existing = candidate({ title: "Database Systems fee payment deadline", title_embedding: null });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });
});

describe("findDuplicateMatch — the privacy fix: class-scoped categories must not merge across classes", () => {
  // All four tests below use close title embeddings on purpose — otherwise
  // classOrEmbeddingMatches would fail on missing data BEFORE the
  // privacy/class-scope check even runs, and these tests wouldn't actually
  // be exercising the guard they're named for.
  it("does NOT merge two matching-but-different-class deadline messages", () => {
    // The exact case this pass exists to prevent: two classes' deadlines
    // that would otherwise look identical (same category, same date, same
    // title) must stay as two separate announcements, each visible only to
    // its own class — merging them would give the announcements RLS
    // policy's "readable if ANY linked source's class matches" logic a row
    // with sources from both classes attached.
    const newItem = fields({ title: "Database Systems fee deadline", title_embedding: EMBEDDING_A });
    const existingFromOtherClass = candidate({
      title: "Database Systems fee payment deadline",
      title_embedding: EMBEDDING_CLOSE,
      submittedByClassName: "ECE-2027-B",
    });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existingFromOtherClass])).toBeNull();
  });

  it("does not merge when the new message's class is unknown (null)", () => {
    const newItem = fields({ title_embedding: EMBEDDING_A });
    const existing = candidate({ title_embedding: EMBEDDING_CLOSE, submittedByClassName: "CSE-2028-A" });

    expect(findDuplicateMatch(newItem, null, [existing])).toBeNull();
  });

  it("does not merge when the existing candidate's class is unknown (null)", () => {
    const newItem = fields({ title_embedding: EMBEDDING_A });
    const existing = candidate({ title_embedding: EMBEDDING_CLOSE, submittedByClassName: null });

    expect(findDuplicateMatch(newItem, "CSE-2028-A", [existing])).toBeNull();
  });

  it("class comparison is case/whitespace-insensitive, matching the RLS policy's own comparison", () => {
    const newItem = fields({ title_embedding: EMBEDDING_A });
    const existing = candidate({ title_embedding: EMBEDDING_CLOSE, submittedByClassName: "  cse-2028-a  " });

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
      title_embedding: EMBEDDING_A,
    });
    const existing = candidate({
      category: "event",
      title: "Synergy Orientation session",
      event_date: "2026-09-20",
      start_time: "09:00",
      end_time: "10:00",
      deadline_at: null,
      title_embedding: EMBEDDING_CLOSE,
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
      title_embedding: EMBEDDING_A,
    });
    const existing = candidate({
      category: "event",
      title: "Chess Club Tournament",
      event_date: "2026-09-20",
      start_time: "09:00",
      end_time: "10:00",
      deadline_at: null,
      title_embedding: EMBEDDING_FAR,
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
    const newItem = fields({ deadline_at: "2026-05-05T23:59:00.000Z", title_embedding: EMBEDDING_A });
    const existing = candidate({ deadline_at: "2026-05-06T10:00:00.000Z", title_embedding: EMBEDDING_CLOSE });

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
