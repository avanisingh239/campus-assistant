import { formatAbsoluteDate } from "./format";

export interface ConflictingValueEntry {
  value: string;
  source_message_id?: string;
}

/**
 * `contradictions.field_name` is a raw column name (e.g. "deadline_at",
 * "event_date", "linked_class_name") — humanize it for the banner text.
 */
function humanizeFieldName(fieldName: string): string {
  const known: Record<string, string> = {
    deadline_at: "deadline",
    event_date: "date",
    start_time: "start time",
    end_time: "end time",
    linked_class_name: "class",
  };
  return known[fieldName] ?? fieldName.replace(/_/g, " ");
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function humanizeValue(value: string): string {
  return DATE_ONLY.test(value) ? formatAbsoluteDate(value) : value;
}

/**
 * Builds the contradiction banner text, e.g. "2 sources say the deadline
 * is May 5, 1 source says May 6 — not resolved automatically." — matches
 * the prototype's own wording exactly (dashboard.html's card 6).
 *
 * `contradictions.conflicting_values` is stored as
 * `[{ "value": "...", "source_message_id": "..." }, ...]` (one entry per
 * disagreeing source) — this groups by distinct value and counts sources
 * per value, since the same value may be repeated by more than one source.
 */
export function buildContradictionSummary(
  fieldName: string,
  conflictingValues: ConflictingValueEntry[],
): string {
  const field = humanizeFieldName(fieldName);

  const countByValue = new Map<string, number>();
  for (const entry of conflictingValues) {
    countByValue.set(entry.value, (countByValue.get(entry.value) ?? 0) + 1);
  }

  const parts = [...countByValue.entries()].map(([value, count], index) => {
    const label = humanizeValue(value);
    const verb = count === 1 ? "says" : "say";
    const subject = index === 0 ? `${count} source${count === 1 ? "" : "s"}` : `${count} source${count === 1 ? "" : "s"}`;
    return index === 0
      ? `${subject} ${verb} the ${field} is ${label}`
      : `${subject} ${verb} ${label}`;
  });

  return `${parts.join(", ")} — not resolved automatically.`;
}
