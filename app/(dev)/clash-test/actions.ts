"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { syncClashesForStudent } from "@/lib/deterministic/sync";
import type { EngagementStatus } from "@/lib/deterministic/types";

/**
 * TEMPORARY dev-only actions for exercising the clash/free-slot engine
 * against a real Supabase project by pasting in an arbitrary student UUID
 * rather than using a real signed-in session — useful for testing a
 * student who doesn't want to go through actual signup/login, e.g. to
 * check clashes against announcements seeded by some other means. Same
 * warning as the (now-deleted) app/(dev)/ingest-test applied: delete or
 * gate this route before the app is reachable by anyone but developers —
 * it writes to real `timetable_entries`/`student_announcement_status` rows
 * for whatever student ID it's given, no ownership check at all.
 *
 * Deliberately NOT reusing lib/timetable/actions.ts or
 * lib/engagement/actions.ts — those are the real, RLS-respecting,
 * session-based versions a future UI should call; duplicating their
 * insert/upsert logic here (admin client, explicit studentId) rather than
 * adding a "test mode" branch to the real actions keeps the production
 * code path simple and honest about what it requires.
 */

export interface DevTimetableEntryInput {
  studentId: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_name: string;
}

export async function devAddTimetableEntry(
  input: DevTimetableEntryInput,
): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { studentId, ...entry } = input;

  const { data, error } = await supabase
    .from("timetable_entries")
    .insert({ ...entry, student_id: studentId })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to add timetable entry: ${error?.message}`);

  await syncClashesForStudent(supabase, studentId);

  return { id: data.id as string };
}

export async function devSetEngagementStatus(
  studentId: string,
  announcementId: string,
  status: EngagementStatus,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("student_announcement_status").upsert(
    { student_id: studentId, announcement_id: announcementId, status },
    { onConflict: "student_id,announcement_id" },
  );
  if (error) throw new Error(`Failed to set engagement status: ${error.message}`);

  await syncClashesForStudent(supabase, studentId);
}

export interface AnnouncementSummary {
  id: string;
  category: string;
  title: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  linked_class_name: string | null;
  match_confidence: number | null;
}

export async function devListRecentAnnouncements(): Promise<AnnouncementSummary[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, category, title, event_date, start_time, end_time, linked_class_name, match_confidence")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Failed to list announcements: ${error.message}`);
  return (data ?? []) as AnnouncementSummary[];
}

export interface ClashSummary {
  id: string;
  clash_type: string;
  timetable_entry_id: string | null;
  announcement_id: string | null;
  other_announcement_id: string | null;
  severity: string;
}

export interface FreeSlotSummary {
  id: string;
  timetable_entry_id: string;
  cancellation_announcement_id: string;
  matched_announcement_id: string | null;
  status: string;
}

export async function devGetClashesAndFreeSlots(
  studentId: string,
): Promise<{ clashes: ClashSummary[]; freeSlots: FreeSlotSummary[] }> {
  const supabase = createAdminClient();

  const [{ data: clashes, error: clashError }, { data: freeSlots, error: slotError }] =
    await Promise.all([
      supabase
        .from("clashes")
        .select("id, clash_type, timetable_entry_id, announcement_id, other_announcement_id, severity")
        .eq("student_id", studentId),
      supabase
        .from("free_slots")
        .select("id, timetable_entry_id, cancellation_announcement_id, matched_announcement_id, status")
        .eq("student_id", studentId),
    ]);

  if (clashError) throw new Error(`Failed to load clashes: ${clashError.message}`);
  if (slotError) throw new Error(`Failed to load free slots: ${slotError.message}`);

  return {
    clashes: (clashes ?? []) as ClashSummary[],
    freeSlots: (freeSlots ?? []) as FreeSlotSummary[],
  };
}
