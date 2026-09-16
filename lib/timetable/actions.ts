"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncClashesForStudent, matchTimetableEntryToExistingCancellations } from "@/lib/deterministic/sync";
import type { TimetableEntryRow } from "@/lib/deterministic/types";

/**
 * Timetable CRUD Server Actions. No UI calls these yet — the real
 * timetable UI is being designed separately (see CLAUDE.md) — but clash
 * detection needs a real trigger point for "a student adds/edits a
 * timetable entry," and none existed until now. A future timetable form
 * should call these directly (rather than inserting into
 * `timetable_entries` on its own) so the clash-resync below always fires.
 *
 * Unlike lib/ingestion/ingest.ts, these write `timetable_entries` through
 * the request-scoped, RLS-respecting client (lib/supabase/server.ts) —
 * students own that table directly per supabase/schema.sql's "student
 * manages own timetable" policy, so there's no reason to bypass RLS here.
 * The clash-sync step still needs the service-role client, though —
 * `clashes` has no INSERT/UPDATE/DELETE policy for `authenticated` (see
 * docs/data-model.md §4) — so each action calls createAdminClient() just
 * for that one step.
 */

export interface TimetableEntryInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_name: string;
  section?: string | null;
  teacher_name?: string | null;
}

async function requireStudentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export async function addTimetableEntry(
  input: TimetableEntryInput,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const studentId = await requireStudentId(supabase);

  const { data, error } = await supabase
    .from("timetable_entries")
    .insert({ ...input, student_id: studentId })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to add timetable entry: ${error?.message}`);
  }

  const admin = createAdminClient();
  await syncClashesForStudent(admin, studentId);
  // Rule 5, third direction (lib/deterministic/sync.ts's own doc comment) —
  // this new entry might match a cancellation that already exists.
  const newEntry: TimetableEntryRow = {
    id: data.id as string,
    student_id: studentId,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time,
    course_name: input.course_name,
  };
  await matchTimetableEntryToExistingCancellations(admin, newEntry);

  return { id: data.id as string };
}

export async function updateTimetableEntry(
  id: string,
  input: Partial<TimetableEntryInput>,
): Promise<void> {
  const supabase = await createClient();
  const studentId = await requireStudentId(supabase);

  const { data, error } = await supabase
    .from("timetable_entries")
    .update(input)
    .eq("id", id)
    .eq("student_id", studentId) // RLS already enforces this; explicit for defense-in-depth
    .select("id, student_id, day_of_week, start_time, end_time, course_name")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update timetable entry: ${error?.message}`);
  }

  const admin = createAdminClient();
  await syncClashesForStudent(admin, studentId);
  // Same reasoning as addTimetableEntry above — an edit can change the
  // day/time/course name to newly match a cancellation it didn't before
  // (or stop matching one it did; matchTimetableEntryToExistingCancellations
  // only ever adds rows, it doesn't need to remove a now-stale one since
  // the original match was still correct at the time it was created).
  await matchTimetableEntryToExistingCancellations(admin, data as TimetableEntryRow);
}

export async function deleteTimetableEntry(id: string): Promise<void> {
  const supabase = await createClient();
  const studentId = await requireStudentId(supabase);

  const { error } = await supabase
    .from("timetable_entries")
    .delete()
    .eq("id", id)
    .eq("student_id", studentId);

  if (error) throw new Error(`Failed to delete timetable entry: ${error.message}`);

  // free_slots/clashes referencing this entry cascade-delete at the DB
  // level (on delete cascade in supabase/schema.sql) — this resync just
  // recomputes what's left, it's not cleaning up the deleted entry itself.
  await syncClashesForStudent(createAdminClient(), studentId);
}
