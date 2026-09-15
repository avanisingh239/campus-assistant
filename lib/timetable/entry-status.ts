import { timeRangesOverlap } from "@/lib/deterministic/overlap";

/**
 * Joins a student's `timetable_entries` against their `clashes` and
 * `free_slots` rows into a per-entry display status for the weekly grid
 * (app/student/timetable) — the "surface clashes and cancellations
 * visually" pass. Pure and unit-tested, same shape as everything else
 * under lib/: no DB access, narrow input types, called from
 * timetable-screen.tsx with data the Server Component already fetched.
 */

interface TimedEntry {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_name: string;
}

interface ClashRow {
  timetable_entry_id: string | null;
  announcement_id: string | null;
  severity: "possible" | "confirmed";
}

interface FreeSlotRow {
  timetable_entry_id: string;
  matched_announcement_id: string | null;
}

export interface ClashDetail {
  severity: "possible" | "confirmed";
  /** The other class's course_name, or the clashing announcement's title. */
  label: string;
}

export interface EntryStatus {
  clashes: ClashDetail[];
  /** `confirmed` if any clash on this entry is confirmed, else `possible` if any exist, else null. */
  worstSeverity: "confirmed" | "possible" | null;
  cancelled: boolean;
  /** Title of the announcement that fits the slot this cancellation freed up, if any. */
  matchedAnnouncementTitle: string | null;
}

function emptyStatus(): EntryStatus {
  return { clashes: [], worstSeverity: null, cancelled: false, matchedAnnouncementTitle: null };
}

export function buildEntryStatusMap(
  entries: TimedEntry[],
  clashes: ClashRow[],
  freeSlots: FreeSlotRow[],
  announcementTitleById: Map<string, string>,
): Map<string, EntryStatus> {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const statusById = new Map<string, EntryStatus>();

  function ensure(id: string): EntryStatus {
    let status = statusById.get(id);
    if (!status) {
      status = emptyStatus();
      statusById.set(id, status);
    }
    return status;
  }

  function addClash(entryId: string, detail: ClashDetail) {
    const status = ensure(entryId);
    status.clashes.push(detail);
    if (detail.severity === "confirmed") {
      status.worstSeverity = "confirmed";
    } else if (status.worstSeverity !== "confirmed") {
      status.worstSeverity = "possible";
    }
  }

  // class_vs_class rows carry a single timetable_entry_id with no
  // counterpart column for "the other entry" (see
  // lib/deterministic/clashes.ts's own doc comment) — the row only proves
  // this entry has at least one such clash, not which partner it's with.
  // Recompute the actual overlapping partner(s) directly from the entries
  // list instead, once per entry — an entry overlapping two others gets
  // two rows here, so de-dupe by entry id first or each partner would be
  // found and added once per row instead of once total.
  const classVsClassEntryIds = new Set(
    clashes
      .filter((c) => c.timetable_entry_id && !c.announcement_id)
      .map((c) => c.timetable_entry_id as string),
  );
  for (const entryId of classVsClassEntryIds) {
    const entry = entryById.get(entryId);
    if (!entry) continue;
    for (const other of entries) {
      if (other.id === entry.id) continue;
      if (other.day_of_week !== entry.day_of_week) continue;
      if (!timeRangesOverlap(entry.start_time, entry.end_time, other.start_time, other.end_time)) continue;
      addClash(entry.id, { severity: "confirmed", label: other.course_name });
    }
  }

  // class_vs_event rows each directly name one clashing announcement with
  // its own severity — no reconstruction needed. event_vs_event rows have
  // no timetable_entry_id at all (not attached to a class, so nothing on
  // this grid to badge) and are skipped by the same filter.
  for (const clash of clashes) {
    if (!clash.timetable_entry_id || !clash.announcement_id) continue;
    const label = announcementTitleById.get(clash.announcement_id) ?? "another announcement";
    addClash(clash.timetable_entry_id, { severity: clash.severity, label });
  }

  for (const slot of freeSlots) {
    const status = ensure(slot.timetable_entry_id);
    status.cancelled = true;
    status.matchedAnnouncementTitle = slot.matched_announcement_id
      ? (announcementTitleById.get(slot.matched_announcement_id) ?? null)
      : null;
  }

  return statusById;
}
