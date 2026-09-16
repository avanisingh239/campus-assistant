/**
 * Field-level conflict detection for a merge decided by match.ts. Separate
 * concern from matching: matching decides "is this the same real-world
 * thing" (with a tolerance — see match.ts's `datesAreClose`); this decides
 * "do the two sources actually agree on the details," with NO tolerance —
 * any disagreement at all, however small, produces a contradiction. Never
 * silently overwriting the stored value and never silently picking a side
 * (the task's own explicit rule) means even a within-merge-tolerance
 * difference has to surface, not just a wildly different one.
 */

export interface FieldValues {
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  deadline_at: string | null;
  seat_count: number | null;
}

export interface FieldContradiction {
  field_name: keyof FieldValues;
  existingValue: string;
  newValue: string;
}

/**
 * Local shape matching `contradictions.conflicting_values`'s stored
 * structure (`[{ value, source_message_id }, ...]`, supabase/schema.sql) —
 * deliberately not imported from lib/dashboard/contradiction-summary.ts's
 * identical-shaped `ConflictingValueEntry`, same "own narrow type" pattern
 * lib/deterministic/types.ts already uses rather than reaching into a
 * display-layer module for a shape this simple.
 */
export interface ConflictingValueEntry {
  value: string;
  source_message_id?: string;
}

/**
 * Every field checked for a conflict, regardless of category — an
 * irrelevant field for a given category (e.g. `seat_count` on a `deadline`)
 * is simply always null on both sides for that category already, so it
 * never contributes a spurious comparison; there's no need to hand-list
 * which fields matter per category on top of that.
 */
const COMPARABLE_FIELDS: (keyof FieldValues)[] = [
  "event_date",
  "start_time",
  "end_time",
  "deadline_at",
  "seat_count",
];

/**
 * `deadline_at` is compared by parsed instant, not raw string — two
 * genuinely-equal timestamps serialized slightly differently (e.g. a
 * trailing `.000Z` vs. `Z`) must not read as a contradiction. Every other
 * field here is already in a single canonical string/number shape
 * (`event_date`/`start_time`/`end_time` are fixed-format, `seat_count` is a
 * plain integer), so a direct comparison is exact and sufficient.
 */
function valuesAgree(field: keyof FieldValues, a: string | number, b: string | number): boolean {
  if (field === "deadline_at") {
    return new Date(a as string).getTime() === new Date(b as string).getTime();
  }
  return a === b;
}

/**
 * Compares the announcement's existing stored fields against a newly
 * merged-in message's extracted fields, returning one entry per field
 * where BOTH sides have a stated (non-null) value and those values
 * disagree. A missing value on either side is never treated as a conflict
 * — there's nothing to disagree with, and this deliberately never fills in
 * a previously-null field from a later source either (that would itself be
 * silently picking a side, just of the only side that has one) — the field
 * stays whatever the first source said, forever, once set; a later
 * source's differing value only ever surfaces via a contradiction, never
 * by changing the stored column.
 */
export function detectFieldContradictions(
  existing: FieldValues,
  incoming: FieldValues,
): FieldContradiction[] {
  const contradictions: FieldContradiction[] = [];

  for (const field of COMPARABLE_FIELDS) {
    const existingValue = existing[field];
    const incomingValue = incoming[field];
    if (existingValue === null || incomingValue === null) continue;
    if (valuesAgree(field, existingValue, incomingValue)) continue;

    contradictions.push({
      field_name: field,
      existingValue: String(existingValue),
      newValue: String(incomingValue),
    });
  }

  return contradictions;
}
