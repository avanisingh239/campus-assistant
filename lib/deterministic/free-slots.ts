import { dayOfWeekFromDate, timeRangeFitsWithin } from "./overlap";
import type { TimetableEntryRow, AnnouncementForDeterministicEngine } from "./types";

export type FreeSlotStatus = "possible" | "confirmed";

export interface FreeSlotCandidate {
  student_id: string;
  timetable_entry_id: string;
  cancellation_announcement_id: string;
  status: FreeSlotStatus;
}

/** Categories eligible to fill a freed slot. Rule 5 names these two explicitly — not `registered_update`. */
const FREE_SLOT_FILLER_CATEGORIES = new Set(["event", "opportunity"]);

/** Below this, a class-name text match + AI match_confidence combo can only ever produce `possible`, never `confirmed`. */
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/** Lowercase, strip punctuation, collapse whitespace — no fuzzy-matching
 * library; see `classNameTextConfidence`'s doc comment for why. */
function normalizeClassName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * How well `linkedClassName` (free text the AI extracted, e.g. "DBMS") textually
 * matches `courseName` (a student's own `timetable_entries.course_name`, e.g.
 * "Database Systems"). Returns 1 (exact, after normalizing), 0.5 (one
 * contains the other), or 0 (no match).
 *
 * Deliberately simple substring matching rather than a real fuzzy-matching
 * library (no new dependency for one narrow use) — this is one of two
 * independent signals `findFreeSlotCandidate` combines with the AI's own
 * `match_confidence`, not the sole gate on creating a free_slots row.
 */
export function classNameTextConfidence(linkedClassName: string, courseName: string): number {
  const a = normalizeClassName(linkedClassName);
  const b = normalizeClassName(courseName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.5;
  return 0;
}

/**
 * Rule 5, first half: given one `cancellation` announcement, find every
 * timetable entry (across all students — a cancellation names a course, not
 * a specific student) that plausibly is the class it's about, and produce a
 * free_slots candidate for each.
 *
 * "Respecting match_confidence — don't treat a low-confidence match as a
 * sure thing" is implemented as two independent signals that both have to
 * be non-zero to create a row at all, combined conservatively (the weaker
 * of the two): `classNameTextConfidence` (this function's own string
 * comparison) and the announcement's AI-reported `match_confidence`. Only
 * an exact text match AND a high `match_confidence` (>= 0.8) produces
 * `confirmed`; any weaker-but-nonzero combination produces `possible`; a
 * zero on either axis produces no row at all.
 */
export function findFreeSlotCandidate(
  cancellation: AnnouncementForDeterministicEngine,
  timetableEntries: TimetableEntryRow[],
): FreeSlotCandidate[] {
  if (cancellation.category !== "cancellation") return [];
  if (!cancellation.linked_class_name || !cancellation.event_date) return [];

  const cancelDay = dayOfWeekFromDate(cancellation.event_date);
  const matchConfidence = cancellation.match_confidence ?? 0;
  const candidates: FreeSlotCandidate[] = [];

  for (const entry of timetableEntries) {
    if (entry.day_of_week !== cancelDay) continue;

    const textConfidence = classNameTextConfidence(cancellation.linked_class_name, entry.course_name);
    if (textConfidence === 0) continue;
    if (matchConfidence <= 0) continue; // AI itself wasn't confident this class name means anything

    candidates.push({
      student_id: entry.student_id,
      timetable_entry_id: entry.id,
      cancellation_announcement_id: cancellation.id,
      status:
        textConfidence === 1 && matchConfidence >= HIGH_CONFIDENCE_THRESHOLD ? "confirmed" : "possible",
    });
  }

  return candidates;
}

/**
 * Rule 5, second half: does `candidate`'s time range fit inside the slot
 * freed by `cancellation` being cancelled during `timetableEntry`'s usual
 * slot? Both must be on the same calendar day — `cancellation.event_date`
 * IS that day (the specific date the class was cancelled on); the freed
 * slot's time window comes from the timetable entry's own scheduled
 * start/end, not the cancellation announcement's (which may not have one).
 */
export function announcementFitsInFreedSlot(
  cancellation: AnnouncementForDeterministicEngine,
  timetableEntry: Pick<TimetableEntryRow, "start_time" | "end_time">,
  candidate: AnnouncementForDeterministicEngine,
): boolean {
  if (!FREE_SLOT_FILLER_CATEGORIES.has(candidate.category)) return false;
  if (!cancellation.event_date) return false;
  if (!candidate.event_date || !candidate.start_time || !candidate.end_time) return false;
  if (candidate.event_date !== cancellation.event_date) return false;

  return timeRangeFitsWithin(
    candidate.start_time,
    candidate.end_time,
    timetableEntry.start_time,
    timetableEntry.end_time,
  );
}

/**
 * Picks the first `event`/`opportunity` announcement (if any) whose time
 * fits inside the slot freed by `cancellation`/`timetableEntry`. First
 * match wins — `free_slots.matched_announcement_id` is a single nullable
 * FK, not a list, so "the opportunity" (rule 5's own wording, singular) is
 * exactly one.
 */
export function findMatchingOpportunityAnnouncement(
  cancellation: AnnouncementForDeterministicEngine,
  timetableEntry: Pick<TimetableEntryRow, "start_time" | "end_time">,
  candidateAnnouncements: AnnouncementForDeterministicEngine[],
): string | null {
  for (const candidate of candidateAnnouncements) {
    if (candidate.id === cancellation.id) continue;
    if (announcementFitsInFreedSlot(cancellation, timetableEntry, candidate)) {
      return candidate.id;
    }
  }
  return null;
}
