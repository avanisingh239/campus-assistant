/**
 * Shared shapes for the deterministic clash/free-slot engine
 * (docs/data-model.md §5). Deliberately minimal — just the columns the
 * pure functions in this directory actually read — not full row types for
 * `timetable_entries`/`announcements`, and not tied to any generated
 * Supabase DB types (this project doesn't generate any; see lib/supabase/*).
 */

export interface TimetableEntryRow {
  id: string;
  student_id: string;
  /** 0-6. See overlap.ts's `dayOfWeekFromDate` doc comment for the exact convention. */
  day_of_week: number;
  /** "HH:MM" or "HH:MM:SS" — however Postgres `time` comes back over the wire. */
  start_time: string;
  end_time: string;
  course_name: string;
}

/**
 * The `announcements` columns the clash/free-slot engine reads. A real row
 * has many more columns (see supabase/schema.sql) — this is intentionally
 * narrow so the pure functions below can't accidentally depend on anything
 * outside their actual contract.
 */
export interface AnnouncementForDeterministicEngine {
  id: string;
  category: string;
  /** "YYYY-MM-DD" or null. */
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  linked_class_name?: string | null;
  /** 0-1 or null — the AI's own confidence in `linked_class_name`, see docs/ai-contracts.md. */
  match_confidence?: number | null;
}

export type EngagementStatus = "none" | "interested" | "not_interested" | "registered";
