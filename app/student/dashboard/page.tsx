import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shapeAnnouncements } from "@/lib/dashboard/shape-announcements";
import { buildDiffSummary } from "@/lib/dashboard/diff-summary";
import { excludeNotInterested, onlyNotInterested } from "@/lib/dashboard/discover-feed";
import { pickUrgentAnnouncementIds, sortByPriorityScore } from "@/lib/dashboard/priority";
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
      "id, category, title, why_it_matters, what_to_do_next, confidence, confidence_note, event_date, start_time, end_time, deadline_at, link_url, link_verified, payment_risk, seat_count, seats_unclear, priority_score, created_at, updated_at",
    )
    // The real sort now happens in JS, in sortByPriorityScore below, using
    // a live-computed score — this base order (used as a stable tie-break
    // by that sort, and as the order before that resort even runs) no
    // longer needs `priority_score`: every row's stored value has been 0
    // since the schema was first applied (see lib/dashboard/priority.ts's
    // own doc comment), so ordering by it was never meaningful.
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

  const shapedAnnouncements = shapeAnnouncements(
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
  // Real bug found in testing: "Not Interested" (docs/product-spec.md's
  // own "suppresses resurfacing in digests/summaries without deleting
  // history") was only ever applied to /student/dont-miss-this
  // (buildDiscoverFeed's own excludeNotInterested call) — the main Action
  // Plan feed here had no equivalent, so a Not-Interested item could still
  // appear, sort normally, and even win the URGENT ribbon. Fixed by
  // applying the exact same exclusion this dashboard's own "Don't miss"
  // stat-row count already reuses (lib/dashboard/discover-feed.ts's
  // excludeNotInterested) as early as possible — right after shaping,
  // before either sortByPriorityScore or pickUrgentAnnouncementIds ever
  // see the list. One filter application satisfies both halves of the
  // fix at once: an excluded item can't appear in the card feed (it's
  // simply not in `announcements` anymore) and structurally can't win the
  // ribbon either (pickUrgentAnnouncementIds only iterates what it's
  // given). This is a display filter only — `student_announcement_status`
  // itself is never touched, so the student's engagement history is
  // unaffected; it also means buildDiffSummary below no longer resurfaces
  // a Not-Interested item's own updates in the "N updates since you last
  // checked" banner, which is the same "digests/summaries" principle
  // applied consistently, not a separate special case.
  const nonSuppressedAnnouncements = excludeNotInterested(shapedAnnouncements);
  // Real, live-computed priority order (lib/dashboard/priority.ts) — this
  // is the card feed's actual sort now, not the DB query's now-dropped
  // (always-0) priority_score order above.
  const announcements = sortByPriorityScore(nonSuppressedAnnouncements, now);
  const urgentIds = pickUrgentAnnouncementIds(announcements, now);
  const diffSummary = buildDiffSummary(announcements, lastSeenResult.data?.last_seen_at ?? null);

  // Real gap found in testing, right after the Not-Interested suppression
  // fix above shipped: hiding these from the main feed meant there was no
  // longer any way for a student to find one again and change their mind
  // — the card holding the status pills was simply gone. This is the exact
  // complement of `excludeNotInterested` (taken from the same pre-filter
  // `shapedAnnouncements` list, before that exclusion runs), passed as its
  // own prop for DashboardClient's collapsed "dismissed items" section —
  // see that file for how a status change moves an item between this list
  // and the main one. Nothing above this line changes: `announcements`/
  // `urgentIds`/`diffSummary` are still computed exactly as they were.
  const dismissedAnnouncements = onlyNotInterested(shapedAnnouncements);

  return (
    <DashboardClient
      announcements={announcements}
      dismissedAnnouncements={dismissedAnnouncements}
      urgentIds={urgentIds}
      diffSummary={diffSummary}
      nowIso={now.toISOString()}
      clashes={clashesResult.data ?? []}
      freeSlots={freeSlotsResult.data ?? []}
    />
  );
}
