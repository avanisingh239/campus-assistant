import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectAllClashesForStudent } from "./clashes";
import {
  findFreeSlotCandidate,
  findMatchingOpportunityAnnouncement,
} from "./free-slots";
import { timeRangeFitsWithin } from "./overlap";
import type {
  AnnouncementForDeterministicEngine,
  EngagementStatus,
  TimetableEntryRow,
} from "./types";

const FREE_SLOT_FILLER_CATEGORIES = ["event", "opportunity"] as const;

/**
 * DB-fetching/writing wrappers around the pure functions in clashes.ts and
 * free-slots.ts. Everything here takes a Supabase client rather than
 * constructing its own — every call site in this codebase passes
 * `createAdminClient()` (lib/supabase/admin.ts), because `clashes` and
 * `free_slots` have RLS enabled with only SELECT policies (see
 * docs/data-model.md §4) — there is no INSERT/UPDATE/DELETE policy for
 * `authenticated` on either table, so the anon/RLS client can never write
 * to them.
 */

/**
 * Recomputes every `clashes` row for one student from scratch and replaces
 * whatever was there before (delete, then reinsert — inside this one
 * call). Recompute-and-replace rather than incremental diffing:
 *   - one student's timetable + engaged announcements is always a small N
 *     (this is not a hot/high-volume path)
 *   - it's trivially correct and idempotent no matter which of the three
 *     trigger points called it, which incremental patching across three
 *     independent call sites is not
 *
 * Call after: a timetable_entries mutation for this student
 * (lib/timetable/actions.ts), or a student_announcement_status change for
 * this student (lib/engagement/actions.ts). Not called from the ingestion
 * pipeline directly — see syncFreeSlotsForCancellation's doc comment for why.
 */
export async function syncClashesForStudent(
  supabase: SupabaseClient,
  studentId: string,
): Promise<{ clashCount: number }> {
  const [timetableResult, engagementResult] = await Promise.all([
    supabase
      .from("timetable_entries")
      .select("id, student_id, day_of_week, start_time, end_time, course_name")
      .eq("student_id", studentId),
    supabase
      .from("student_announcement_status")
      .select("announcement_id, status")
      .eq("student_id", studentId)
      .in("status", ["interested", "registered"]),
  ]);

  if (timetableResult.error) {
    throw new Error(`Failed to load timetable: ${timetableResult.error.message}`);
  }
  if (engagementResult.error) {
    throw new Error(`Failed to load engagement statuses: ${engagementResult.error.message}`);
  }

  const engagements = engagementResult.data ?? [];
  const engagedAnnouncementIds = engagements.map((e) => e.announcement_id as string);
  const engagementByAnnouncementId = new Map<string, EngagementStatus>(
    engagements.map((e) => [e.announcement_id as string, e.status as EngagementStatus]),
  );

  // class_vs_event and event_vs_event are both gated on interested/registered
  // (rules 2 & 3) — an announcement the student has no engagement with can
  // never produce a clash, so there's no reason to fetch it at all.
  let announcements: AnnouncementForDeterministicEngine[] = [];
  if (engagedAnnouncementIds.length > 0) {
    const { data, error } = await supabase
      .from("announcements")
      .select("id, category, event_date, start_time, end_time")
      .in("id", engagedAnnouncementIds);
    if (error) throw new Error(`Failed to load engaged announcements: ${error.message}`);
    announcements = (data ?? []) as AnnouncementForDeterministicEngine[];
  }

  const candidates = detectAllClashesForStudent(
    (timetableResult.data ?? []) as TimetableEntryRow[],
    announcements,
    engagementByAnnouncementId,
  );

  const { error: deleteError } = await supabase.from("clashes").delete().eq("student_id", studentId);
  if (deleteError) throw new Error(`Failed to clear old clashes: ${deleteError.message}`);

  if (candidates.length > 0) {
    const { error: insertError } = await supabase
      .from("clashes")
      .insert(candidates.map((c) => ({ ...c, student_id: studentId })));
    if (insertError) throw new Error(`Failed to insert clashes: ${insertError.message}`);
  }

  return { clashCount: candidates.length };
}

/**
 * Rule 5: when a `cancellation` announcement is created, open a
 * `free_slots` row for every student whose timetable plausibly has the
 * cancelled class, then check whether any already-existing `event`/
 * `opportunity` announcement fits inside each new slot.
 *
 * Called from lib/ingestion/ingest.ts right after a `cancellation`
 * announcement is inserted. This is the one deterministic-engine step that
 * genuinely has to run at announcement-creation time (unlike clash
 * detection — see syncClashesForStudent's doc comment) because free-slot
 * creation isn't gated on any student's engagement status; it fans out to
 * every matching timetable entry immediately.
 */
export async function syncFreeSlotsForCancellation(
  supabase: SupabaseClient,
  cancellationAnnouncementId: string,
): Promise<{ freeSlotCount: number }> {
  const { data: cancellation, error: cancelError } = await supabase
    .from("announcements")
    .select("id, category, event_date, start_time, end_time, linked_class_name, match_confidence")
    .eq("id", cancellationAnnouncementId)
    .single();

  if (cancelError || !cancellation) {
    throw new Error(`Failed to load cancellation announcement: ${cancelError?.message}`);
  }
  if (cancellation.category !== "cancellation") {
    return { freeSlotCount: 0 };
  }

  // Scoped to no student in particular (that's exactly what we're solving
  // for) — necessarily scans every timetable entry. Fine at hackathon
  // scale; would want a narrower query (e.g. an ILIKE prefilter on
  // course_name) if this table grows large.
  const { data: allEntries, error: entriesError } = await supabase
    .from("timetable_entries")
    .select("id, student_id, day_of_week, start_time, end_time, course_name");
  if (entriesError) throw new Error(`Failed to load timetable entries: ${entriesError.message}`);

  const entries = (allEntries ?? []) as TimetableEntryRow[];
  const candidates = findFreeSlotCandidate(
    cancellation as AnnouncementForDeterministicEngine,
    entries,
  );
  if (candidates.length === 0) return { freeSlotCount: 0 };

  const { data: inserted, error: insertError } = await supabase
    .from("free_slots")
    .insert(candidates)
    .select("id, timetable_entry_id");
  if (insertError) throw new Error(`Failed to insert free_slots: ${insertError.message}`);

  // Second half of rule 5: check existing event/opportunity announcements
  // against each newly-opened slot.
  const { data: openCategoryAnnouncements, error: annError } = await supabase
    .from("announcements")
    .select("id, category, event_date, start_time, end_time")
    .in("category", FREE_SLOT_FILLER_CATEGORIES);
  if (annError) throw new Error(`Failed to load candidate announcements: ${annError.message}`);

  const entryById = new Map(entries.map((e) => [e.id, e]));

  for (const slot of inserted ?? []) {
    const entry = entryById.get(slot.timetable_entry_id as string);
    if (!entry) continue;

    const matchId = findMatchingOpportunityAnnouncement(
      cancellation as AnnouncementForDeterministicEngine,
      entry,
      (openCategoryAnnouncements ?? []) as AnnouncementForDeterministicEngine[],
    );
    if (!matchId) continue;

    const { error: updateError } = await supabase
      .from("free_slots")
      .update({ matched_announcement_id: matchId })
      .eq("id", slot.id);
    if (updateError) throw new Error(`Failed to link matched announcement: ${updateError.message}`);
  }

  return { freeSlotCount: candidates.length };
}

/**
 * Rule 5, the other direction: when a NEW `event`/`opportunity`
 * announcement is created, check it against every open (unmatched)
 * `free_slots` row, in case it fits into a slot freed by an earlier
 * cancellation. Called from lib/ingestion/ingest.ts right after such an
 * announcement is inserted.
 *
 * One announcement can legitimately fill more than one open slot (e.g. two
 * different students each had a different class cancelled at the same
 * time, and this one workshop fits both) — every matching slot gets
 * updated, not just the first.
 */
export async function matchAnnouncementToOpenFreeSlots(
  supabase: SupabaseClient,
  announcementId: string,
): Promise<{ matchedSlotIds: string[] }> {
  const { data: announcement, error: annError } = await supabase
    .from("announcements")
    .select("id, category, event_date, start_time, end_time")
    .eq("id", announcementId)
    .single();
  if (annError || !announcement) {
    throw new Error(`Failed to load announcement: ${annError?.message}`);
  }
  if (
    !FREE_SLOT_FILLER_CATEGORIES.includes(announcement.category) ||
    !announcement.event_date ||
    !announcement.start_time ||
    !announcement.end_time
  ) {
    return { matchedSlotIds: [] };
  }

  const { data: openSlots, error: slotsError } = await supabase
    .from("free_slots")
    .select("id, timetable_entry_id, cancellation_announcement_id")
    .is("matched_announcement_id", null);
  if (slotsError) throw new Error(`Failed to load open free slots: ${slotsError.message}`);
  if (!openSlots || openSlots.length === 0) return { matchedSlotIds: [] };

  const timetableEntryIds = [...new Set(openSlots.map((s) => s.timetable_entry_id as string))];
  const cancellationIds = [...new Set(openSlots.map((s) => s.cancellation_announcement_id as string))];

  const [entriesResult, cancellationsResult] = await Promise.all([
    supabase.from("timetable_entries").select("id, start_time, end_time").in("id", timetableEntryIds),
    supabase.from("announcements").select("id, event_date").in("id", cancellationIds),
  ]);
  if (entriesResult.error) {
    throw new Error(`Failed to load timetable entries: ${entriesResult.error.message}`);
  }
  if (cancellationsResult.error) {
    throw new Error(`Failed to load cancellation announcements: ${cancellationsResult.error.message}`);
  }

  const entryById = new Map((entriesResult.data ?? []).map((e) => [e.id as string, e]));
  const cancelDateById = new Map(
    (cancellationsResult.data ?? []).map((c) => [c.id as string, c.event_date as string | null]),
  );

  const matchedSlotIds: string[] = [];
  for (const slot of openSlots) {
    const entry = entryById.get(slot.timetable_entry_id as string);
    const cancelDate = cancelDateById.get(slot.cancellation_announcement_id as string);
    if (!entry || !cancelDate) continue;
    if (announcement.event_date !== cancelDate) continue;
    if (
      !timeRangeFitsWithin(
        announcement.start_time!,
        announcement.end_time!,
        entry.start_time as string,
        entry.end_time as string,
      )
    ) {
      continue;
    }
    matchedSlotIds.push(slot.id as string);
  }

  if (matchedSlotIds.length > 0) {
    const { error: updateError } = await supabase
      .from("free_slots")
      .update({ matched_announcement_id: announcement.id })
      .in("id", matchedSlotIds);
    if (updateError) throw new Error(`Failed to link matched announcement: ${updateError.message}`);
  }

  return { matchedSlotIds };
}
