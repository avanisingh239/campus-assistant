import { timeToMinutes } from "@/lib/deterministic/overlap";

/** Monday-Saturday — the default range the task calls out as fine for a hackathon; day_of_week 0=Sunday..6=Saturday, see overlap.ts's dayOfWeekFromDate doc comment. */
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

interface TimedEntry {
  day_of_week: number;
  start_time: string;
}

export interface DayColumn<T> {
  dayOfWeek: number;
  entries: T[];
}

/**
 * Groups a student's timetable entries into day columns for the weekly
 * grid (app/student/timetable), each sorted chronologically. Always shows
 * the default Monday-Saturday range, plus any day that actually has an
 * entry outside it (including Sunday) — a manually-added Sunday class is
 * never silently dropped just because it falls outside the default view.
 * This is the "don't hardcode assumptions that would break if entries
 * exist outside that range" the task asked for, without building a full
 * configurable-start-day settings UI the hackathon doesn't need.
 *
 * Generic over the entry type (rather than hardcoded to
 * lib/deterministic/types.ts's intentionally-narrow `TimetableEntryRow`)
 * so the caller's richer row shape — lib/timetable/types.ts's
 * `TimetableEntry`, with `section`/`teacher_name`/etc. the UI needs —
 * comes back out the other side instead of being narrowed away.
 */
export function buildWeeklyGrid<T extends TimedEntry>(entries: T[]): DayColumn<T>[] {
  const days = [...new Set([...DEFAULT_DAYS, ...entries.map((e) => e.day_of_week)])].sort((a, b) => a - b);

  return days.map((dayOfWeek) => ({
    dayOfWeek,
    entries: entries
      .filter((e) => e.day_of_week === dayOfWeek)
      .slice()
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)),
  }));
}
