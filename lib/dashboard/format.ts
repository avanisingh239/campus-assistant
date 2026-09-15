import type { DashboardAnnouncement } from "./types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "WEDNESDAY, 14 SEPTEMBER" — the header's date badge, always today's real date. */
export function formatHeaderDate(now: Date): string {
  return `${WEEKDAYS[now.getUTCDay()].toUpperCase()}, ${now.getUTCDate()} ${MONTHS_FULL[now.getUTCMonth()].toUpperCase()}`;
}

function parseUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function daysBetweenUtc(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;
  const fromMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toMidnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toMidnight - fromMidnight) / MS_PER_DAY);
}

/**
 * "Today" / "Tomorrow" / "This Friday" / "Yesterday" / a formatted date,
 * relative to `now`. Mirrors the prototype's cap-meta labels ("Today,
 * 2–3pm", "This Friday", "Due tomorrow, 6pm").
 */
export function relativeDay(dateStr: string, now: Date): string {
  const target = parseUtcDate(dateStr);
  const diff = daysBetweenUtc(now, target);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 6) return `This ${WEEKDAYS[target.getUTCDay()]}`;
  if (diff > 6 && diff <= 13) return `Next ${WEEKDAYS[target.getUTCDay()]}`;

  const sameYear = target.getUTCFullYear() === now.getUTCFullYear();
  const monthDay = `${MONTHS[target.getUTCMonth()]} ${target.getUTCDate()}`;
  return sameYear ? monthDay : `${monthDay}, ${target.getUTCFullYear()}`;
}

/** "14:00" or "14:00:00" -> "2pm"; "14:15" -> "2:15pm". */
export function formatTime12h(time: string): string {
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const period = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour12}${period}` : `${hour12}:${String(minutes).padStart(2, "0")}${period}`;
}

/** "14:00"/"15:00" -> "2–3pm"; drops the repeated am/pm when both sides match. */
export function formatTimeRange(start: string, end: string): string {
  const startLabel = formatTime12h(start);
  const endLabel = formatTime12h(end);
  const startPeriod = startLabel.endsWith("am") ? "am" : "pm";
  const endPeriod = endLabel.endsWith("am") ? "am" : "pm";
  if (startPeriod === endPeriod) {
    return `${startLabel.slice(0, -2)}–${endLabel}`;
  }
  return `${startLabel}–${endLabel}`;
}

/**
 * The card cap's small meta line. `society_link` is a special case per
 * product-spec.md's dedup feature — it shows a source count ("Posted in 3
 * groups"), not a date, since a society/group link doesn't really have a
 * "when."
 */
export function formatCapMeta(announcement: DashboardAnnouncement, now: Date): string {
  if (announcement.category === "society_link") {
    const n = announcement.sourceCount;
    return `Posted in ${n} group${n === 1 ? "" : "s"}`;
  }

  if (announcement.deadline_at) {
    const deadline = new Date(announcement.deadline_at);
    const day = relativeDay(deadline.toISOString().slice(0, 10), now);
    const time = formatTime12h(
      `${String(deadline.getUTCHours()).padStart(2, "0")}:${String(deadline.getUTCMinutes()).padStart(2, "0")}`,
    );
    const dayLabel = day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day;
    return `Due ${dayLabel}, ${time}`;
  }

  if (announcement.event_date && announcement.start_time && announcement.end_time) {
    return `${relativeDay(announcement.event_date, now)}, ${formatTimeRange(announcement.start_time, announcement.end_time)}`;
  }

  if (announcement.event_date) {
    return relativeDay(announcement.event_date, now);
  }

  // product-spec.md's own wording for a card with no resolvable date.
  return "Time unspecified";
}

/**
 * Splits `what_to_do_next` into its leading verb (bolded in the prototype,
 * e.g. "→ **Pay** before 6pm tomorrow") and the rest. Safe because
 * docs/ai-contracts.md requires `what_to_do_next` to always be verb-led
 * ("a single verb-led 'what_to_do_next'"), so the first word is reliably
 * the verb to emphasize, not an arbitrary split.
 */
export function splitVerb(text: string): { verb: string; rest: string } {
  const trimmed = text.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { verb: trimmed, rest: "" };
  return { verb: trimmed.slice(0, spaceIndex), rest: trimmed.slice(spaceIndex + 1) };
}

/** "2026-05-05" -> "May 5" (always absolute, unlike relativeDay — used where "Today"/"Tomorrow" would be confusing, e.g. summarizing a contradiction between two dates). */
export function formatAbsoluteDate(dateStr: string): string {
  const d = parseUtcDate(dateStr);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "2 DAYS AGO" / "40 MIN AGO" / "YESTERDAY" style labels for the trace-to-source drawer. */
export function formatRelativeTimeCaps(isoTimestamp: string, now: Date): string {
  const then = new Date(isoTimestamp);
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));

  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return `${minutes} MIN AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} HOUR${hours === 1 ? "" : "S"} AGO`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "YESTERDAY";
  return `${days} DAYS AGO`;
}
