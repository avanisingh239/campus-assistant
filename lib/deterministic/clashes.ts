import { timeRangesOverlap, dayOfWeekFromDate } from "./overlap";
import type {
  TimetableEntryRow,
  AnnouncementForDeterministicEngine,
  EngagementStatus,
} from "./types";

export type ClashType = "class_vs_class" | "class_vs_event" | "event_vs_event";
export type ClashSeverity = "possible" | "confirmed";

export interface ClashCandidate {
  clash_type: ClashType;
  timetable_entry_id: string | null;
  announcement_id: string | null;
  other_announcement_id: string | null;
  severity: ClashSeverity;
}

/**
 * Categories eligible to participate in class_vs_event and event_vs_event
 * clashes. Deliberately the same set for both — an announcement that can
 * clash with a class should equally be able to clash with another
 * announcement; the schema gives no reason to treat them differently.
 */
export const CLASH_ELIGIBLE_CATEGORIES = new Set([
  "event",
  "opportunity",
  "registered_update",
]);

function isEngaged(status: EngagementStatus | undefined): boolean {
  return status === "interested" || status === "registered";
}

/** Rule 4: `confirmed` if either side is `registered`, else `possible`. */
function severityFor(...statuses: (EngagementStatus | undefined)[]): ClashSeverity {
  return statuses.some((s) => s === "registered") ? "confirmed" : "possible";
}

/**
 * Rule 1 — class vs class: two of a student's own timetable entries
 * overlap on the same day. Purely timetable-vs-timetable — no announcement
 * or interest status involved — and always `confirmed` (no ambiguity in a
 * timetable-vs-timetable overlap).
 *
 * Emits TWO rows per overlapping pair (one keyed to each entry), not one.
 * `clashes.timetable_entry_id` is a single column with no counterpart
 * column for "the other entry" (unlike class_vs_event/event_vs_event,
 * which have both `announcement_id` and `other_announcement_id`) — the
 * schema simply doesn't have room to store both sides of a class_vs_class
 * pair in one row. Two rows means "does this specific timetable entry have
 * a clash" is answerable with a plain `where timetable_entry_id = X` query
 * regardless of which side of the pair X was — the shape a UI badge on a
 * timetable cell actually needs. The tradeoff: the two rows don't record
 * which entry they're paired against, only that each one clashes with
 * *something*.
 */
export function detectClassVsClassClashes(
  timetableEntries: TimetableEntryRow[],
): ClashCandidate[] {
  const clashes: ClashCandidate[] = [];

  for (let i = 0; i < timetableEntries.length; i++) {
    for (let j = i + 1; j < timetableEntries.length; j++) {
      const a = timetableEntries[i];
      const b = timetableEntries[j];
      if (a.day_of_week !== b.day_of_week) continue;
      if (!timeRangesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) continue;

      for (const entry of [a, b]) {
        clashes.push({
          clash_type: "class_vs_class",
          timetable_entry_id: entry.id,
          announcement_id: null,
          other_announcement_id: null,
          severity: "confirmed",
        });
      }
    }
  }

  return clashes;
}

/**
 * Rule 2 — class vs event: an eligible-category announcement overlaps one
 * of the student's timetable entries, gated on that student being
 * `interested`/`registered` in the announcement. `engagementByAnnouncementId`
 * should only contain entries for *this* student.
 */
export function detectClassVsEventClashes(
  timetableEntries: TimetableEntryRow[],
  announcements: AnnouncementForDeterministicEngine[],
  engagementByAnnouncementId: Map<string, EngagementStatus>,
): ClashCandidate[] {
  const clashes: ClashCandidate[] = [];

  for (const announcement of announcements) {
    if (!CLASH_ELIGIBLE_CATEGORIES.has(announcement.category)) continue;
    if (!announcement.event_date || !announcement.start_time || !announcement.end_time) continue;

    const status = engagementByAnnouncementId.get(announcement.id);
    if (!isEngaged(status)) continue; // rule 2: no clash if nobody's interested

    const announcementDay = dayOfWeekFromDate(announcement.event_date);

    for (const entry of timetableEntries) {
      if (entry.day_of_week !== announcementDay) continue;
      if (
        !timeRangesOverlap(
          entry.start_time,
          entry.end_time,
          announcement.start_time,
          announcement.end_time,
        )
      ) {
        continue;
      }

      clashes.push({
        clash_type: "class_vs_event",
        timetable_entry_id: entry.id,
        announcement_id: announcement.id,
        other_announcement_id: null,
        severity: severityFor(status),
      });
    }
  }

  return clashes;
}

/**
 * Rule 3 — event vs event: two eligible-category announcements overlap,
 * gated on the SAME student being `interested`/`registered` in BOTH (rule
 * 3 is explicitly scoped to one student's own engagements — it's never
 * about two different students).
 */
export function detectEventVsEventClashes(
  announcements: AnnouncementForDeterministicEngine[],
  engagementByAnnouncementId: Map<string, EngagementStatus>,
): ClashCandidate[] {
  const eligible = announcements.filter(
    (a) => CLASH_ELIGIBLE_CATEGORIES.has(a.category) && a.event_date && a.start_time && a.end_time,
  );
  const clashes: ClashCandidate[] = [];

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];

      const statusA = engagementByAnnouncementId.get(a.id);
      const statusB = engagementByAnnouncementId.get(b.id);
      if (!isEngaged(statusA) || !isEngaged(statusB)) continue; // rule 3: BOTH sides

      if (a.event_date !== b.event_date) continue; // different calendar days can't overlap
      if (!timeRangesOverlap(a.start_time!, a.end_time!, b.start_time!, b.end_time!)) continue;

      clashes.push({
        clash_type: "event_vs_event",
        timetable_entry_id: null,
        announcement_id: a.id,
        other_announcement_id: b.id,
        severity: severityFor(statusA, statusB),
      });
    }
  }

  return clashes;
}

/**
 * Every clash for one student, computed fresh from their current timetable,
 * the announcements they're engaged with, and those engagement statuses.
 * `announcements` and `engagementByAnnouncementId` should already be
 * scoped to this one student — see lib/deterministic/sync.ts for the
 * DB-fetching wrapper that does that scoping and calls this.
 */
export function detectAllClashesForStudent(
  timetableEntries: TimetableEntryRow[],
  announcements: AnnouncementForDeterministicEngine[],
  engagementByAnnouncementId: Map<string, EngagementStatus>,
): ClashCandidate[] {
  return [
    ...detectClassVsClassClashes(timetableEntries),
    ...detectClassVsEventClashes(timetableEntries, announcements, engagementByAnnouncementId),
    ...detectEventVsEventClashes(announcements, engagementByAnnouncementId),
  ];
}
