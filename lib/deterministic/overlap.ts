/**
 * Low-level time-range math shared by clashes.ts and free-slots.ts. No DB
 * access, no framework dependencies — pure functions over plain strings.
 */

/** Parses a Postgres `time` string ("HH:MM" or "HH:MM:SS") into minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Interval-overlap check: `start1 < end2 AND start2 < end1` (schema.sql's
 * own comment gives this exact formula — see its "NOTES FOR NEXT STEPS").
 * Touching-but-not-overlapping ranges (one ends exactly when the other
 * starts) do NOT count as overlapping.
 */
export function timeRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

/** True if [innerStart, innerEnd] is fully contained within [outerStart, outerEnd]. */
export function timeRangeFitsWithin(
  innerStart: string,
  innerEnd: string,
  outerStart: string,
  outerEnd: string,
): boolean {
  return (
    timeToMinutes(innerStart) >= timeToMinutes(outerStart) &&
    timeToMinutes(innerEnd) <= timeToMinutes(outerEnd)
  );
}

/**
 * Day-of-week convention: 0 = Sunday ... 6 = Saturday — i.e. exactly
 * `Date.getUTCDay()`'s own numbering.
 *
 * `timetable_entries.day_of_week` is documented in supabase/schema.sql only
 * as "0-6, configurable start day, not hardcoded Mon-Sun" — nothing in the
 * schema or app actually implements that configurability (no per-student
 * or per-institution week-start setting exists anywhere), so there's no
 * real convention to match against yet. `Date.getUTCDay()`'s numbering is
 * the one unambiguous default available without inventing new schema. If a
 * configurable week start is ever added, this is the one function that
 * needs to change.
 */
export function dayOfWeekFromDate(dateStr: string): number {
  // "YYYY-MM-DD" is parsed as UTC midnight per the date-only form in the
  // ECMA-262 Date Time String Format spec — the "T00:00:00Z" is redundant
  // but kept for clarity, so this doesn't quietly depend on that subtlety.
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}
