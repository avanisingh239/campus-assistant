import type { ClassUpdateFormInput, SocietyUpdateFormInput } from "./validation";
import { CLASS_UPDATE_STATUS_LABELS } from "./validation";

/**
 * Pure transforms from a validated admin-form input into the fields
 * lib/admin/actions.ts needs to write `messages`/`announcements` rows.
 * Same shape as lib/ingestion/map-to-announcement.ts's `toAnnouncementRow`
 * — no DB access, cheap to unit test — except there's no AI step to
 * validate against here: this *is* the structured input (see CLAUDE.md's
 * §Admin Dashboard "Submission logic" section for why the Gemini pipeline
 * is skipped entirely for admin_form submissions).
 *
 * `raw_text` exists only so trace-to-source has something to show for an
 * admin_form message the same way it does for a pasted one (CLAUDE.md's
 * own instruction) — it's a serialization of the structured fields below,
 * not free text the admin actually typed.
 */

export interface ClassAnnouncementDraft {
  title: string;
  raw_text: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  linked_class_name: string;
}

function formatTimeLine(startTime: string | undefined, endTime: string | undefined): string {
  if (!startTime || !endTime) return "Time: not specified";
  return `Time: ${startTime}–${endTime}`;
}

export function buildClassUpdateDraft(
  input: ClassUpdateFormInput,
  className: string,
): ClassAnnouncementDraft {
  const statusLabel = CLASS_UPDATE_STATUS_LABELS[input.status];
  const title = `${input.course_name} (Section ${input.section}) — ${statusLabel}`;

  const raw_text = [
    "Class update — submitted via Admin Dashboard",
    `Class: ${className}`,
    `Section: ${input.section}`,
    `Course: ${input.course_name}`,
    `Status: ${statusLabel}`,
    `Date: ${input.event_date}`,
    formatTimeLine(input.start_time, input.end_time),
  ].join("\n");

  return {
    title,
    raw_text,
    event_date: input.event_date,
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    linked_class_name: input.course_name,
  };
}

export interface SocietyAnnouncementDraft {
  title: string;
  raw_text: string;
  event_date: string;
  start_time: string;
  end_time: string;
  seat_count: number | null;
  /**
   * Full ISO timestamp, or null. `input.deadline_at` is a `datetime-local`
   * value ("YYYY-MM-DDTHH:mm") with no timezone of its own — appending
   * ":00Z" treats it as UTC directly rather than parsing it against the
   * server's local timezone, matching this codebase's existing convention
   * of anchoring date/time fields to UTC (see overlap.ts's
   * `dayOfWeekFromDate` doc comment for the same reasoning applied to
   * `event_date`).
   */
  deadline_at: string | null;
  link_url: string | null;
}

export function buildSocietyUpdateDraft(
  input: SocietyUpdateFormInput,
  societyName: string,
): SocietyAnnouncementDraft {
  const seatsLine = input.unlimited_seats ? "Seats: Unlimited" : `Seats: ${input.seat_count}`;
  const deadlineLine = input.deadline_at
    ? `Registration deadline: ${input.deadline_at.replace("T", " ")}`
    : "Registration deadline: none given";
  const linkLine = input.link_url ? `Registration link: ${input.link_url}` : "Registration link: none given";

  const raw_text = [
    "Society update — submitted via Admin Dashboard",
    `Society: ${societyName}`,
    `Event: ${input.title}`,
    `Date: ${input.event_date}`,
    formatTimeLine(input.start_time, input.end_time),
    seatsLine,
    deadlineLine,
    linkLine,
  ].join("\n");

  return {
    title: `${input.title} — ${societyName}`,
    raw_text,
    event_date: input.event_date,
    start_time: input.start_time,
    end_time: input.end_time,
    seat_count: input.unlimited_seats ? null : Number(input.seat_count),
    deadline_at: input.deadline_at ? `${input.deadline_at}:00Z` : null,
    link_url: input.link_url || null,
  };
}
