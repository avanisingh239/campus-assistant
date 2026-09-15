import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shapeAnnouncements } from "@/lib/dashboard/shape-announcements";
import { buildDiffSummary } from "@/lib/dashboard/diff-summary";
import { pickUrgentAnnouncementId } from "@/lib/dashboard/priority";
import { DashboardClient } from "./dashboard-client";

// Never statically prerendered — it's a per-student, RLS-scoped fetch.
// (Also true of every route under app/student/, forced at the layout
// level — see app/student/layout.tsx.)
export const dynamic = "force-dynamic";

/**
 * Server Component: the one data-fetching entry point for the Action Plan
 * dashboard. Everything here goes through the RLS-respecting client
 * (lib/supabase/server.ts), per the task — this route reads only what a
 * signed-in student is allowed to see under supabase/schema.sql's
 * policies, and (as of this pass) that requires two new SELECT policies
 * that don't exist in the live schema yet — see CLAUDE.md and
 * docs/data-model.md §4 for the exact migration to run.
 *
 * Flat queries joined in JS, not PostgREST embeds — same established
 * pattern as lib/ingestion/ingest.ts and lib/deterministic/sync.ts.
 */
export default async function StudentDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already guarantees an authenticated student reaches this
  // route — this is a defensive fallback, not the real auth gate.
  if (!user) {
    redirect("/login");
  }

  const { data: announcementRows, error: announcementsError } = await supabase
    .from("announcements")
    .select(
      "id, category, title, why_it_matters, what_to_do_next, confidence, confidence_note, event_date, start_time, end_time, deadline_at, link_url, link_verified, seat_count, seats_unclear, priority_score, created_at, updated_at",
    )
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (announcementsError) {
    throw new Error(`Failed to load announcements: ${announcementsError.message}`);
  }

  const announcementIds = (announcementRows ?? []).map((a) => a.id);

  const [engagementResult, contradictionResult, sourceLinkResult, lastSeenResult] = await Promise.all([
    supabase.from("student_announcement_status").select("announcement_id, status").eq("student_id", user.id),
    announcementIds.length > 0
      ? supabase
          .from("contradictions")
          .select("announcement_id, field_name, conflicting_values, resolved")
          .in("announcement_id", announcementIds)
      : Promise.resolve({ data: [], error: null }),
    announcementIds.length > 0
      ? supabase.from("announcement_sources").select("announcement_id, message_id").in("announcement_id", announcementIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("last_seen").select("last_seen_at").eq("student_id", user.id).maybeSingle(),
  ]);

  if (engagementResult.error) {
    throw new Error(`Failed to load engagement status: ${engagementResult.error.message}`);
  }
  if (contradictionResult.error) {
    throw new Error(`Failed to load contradictions: ${contradictionResult.error.message}`);
  }
  if (sourceLinkResult.error) {
    throw new Error(`Failed to load announcement sources: ${sourceLinkResult.error.message}`);
  }
  if (lastSeenResult.error) {
    throw new Error(`Failed to load last_seen: ${lastSeenResult.error.message}`);
  }

  const messageIds = [...new Set((sourceLinkResult.data ?? []).map((s) => s.message_id))];
  const { data: messageRows, error: messagesError } =
    messageIds.length > 0
      ? await supabase.from("messages").select("id, raw_text, source_group_name, created_at").in("id", messageIds)
      : { data: [], error: null };

  if (messagesError) {
    throw new Error(`Failed to load source messages: ${messagesError.message}`);
  }

  const announcements = shapeAnnouncements(
    announcementRows ?? [],
    engagementResult.data ?? [],
    contradictionResult.data ?? [],
    sourceLinkResult.data ?? [],
    messageRows ?? [],
  );

  // Stat row + free-slot spotlight (see CLAUDE.md's §Student Dashboard for
  // the four-element follow-up pass this is part of). Both tables have a
  // "student reads own ___" SELECT policy — same RLS client, no admin
  // client needed to read them, only to write them (lib/deterministic/sync.ts).
  const [clashesResult, freeSlotsResult] = await Promise.all([
    supabase.from("clashes").select("id, clash_type, announcement_id, other_announcement_id, severity").eq("student_id", user.id),
    supabase
      .from("free_slots")
      .select("id, timetable_entry_id, cancellation_announcement_id, matched_announcement_id, status, created_at")
      .eq("student_id", user.id)
      .not("matched_announcement_id", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  if (clashesResult.error) {
    throw new Error(`Failed to load clashes: ${clashesResult.error.message}`);
  }
  if (freeSlotsResult.error) {
    throw new Error(`Failed to load free slots: ${freeSlotsResult.error.message}`);
  }

  const now = new Date();
  const urgentId = pickUrgentAnnouncementId(announcements, now);
  const diffSummary = buildDiffSummary(announcements, lastSeenResult.data?.last_seen_at ?? null);

  return (
    <DashboardClient
      announcements={announcements}
      urgentId={urgentId}
      diffSummary={diffSummary}
      nowIso={now.toISOString()}
      clashes={clashesResult.data ?? []}
      freeSlots={freeSlotsResult.data ?? []}
    />
  );
}
