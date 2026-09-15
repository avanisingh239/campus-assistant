import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shapeAnnouncements } from "@/lib/dashboard/shape-announcements";
import { buildDiscoverFeed } from "@/lib/dashboard/discover-feed";
import { DiscoverClient } from "./discover-client";

// Same reasoning as app/student/dashboard/page.tsx: per-student, RLS-scoped
// fetch, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Server Component for the "Don't Miss This" discovery feed
 * (docs/product-spec.md Area A.1 / Feature 4.3) — limited-seat
 * opportunities and other discovery-worthy announcements, kept visible
 * regardless of the dashboard's urgency scoring. Same real-data pattern as
 * app/student/dashboard/page.tsx (RLS-respecting client, flat queries
 * joined in JS via the same shapeAnnouncements()), but a different filter
 * and sort:
 *
 * - Filter (pushed into the query itself, not JS, so this route only ever
 *   fetches rows it could show): `category = 'opportunity'`, or
 *   `category = 'event'` with either a `seat_count` or `seats_unclear`,
 *   since a seat-limited event is just as discovery-worthy as a
 *   dedicated opportunity per the feature doc's own definition.
 * - buildDiscoverFeed() (lib/dashboard/discover-feed.ts) then excludes
 *   anything marked not_interested and sorts by soonest deadline/event
 *   date instead of priority_score — see that file's doc comment for why.
 */
export default async function StudentDiscoverPage() {
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
    .or(
      "category.eq.opportunity,and(category.eq.event,seat_count.not.is.null),and(category.eq.event,seats_unclear.eq.true)",
    );

  if (announcementsError) {
    throw new Error(`Failed to load announcements: ${announcementsError.message}`);
  }

  const announcementIds = (announcementRows ?? []).map((a) => a.id);

  const [engagementResult, contradictionResult, sourceLinkResult] = await Promise.all([
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

  const messageIds = [...new Set((sourceLinkResult.data ?? []).map((s) => s.message_id))];
  const { data: messageRows, error: messagesError } =
    messageIds.length > 0
      ? await supabase.from("messages").select("id, raw_text, source_group_name, created_at").in("id", messageIds)
      : { data: [], error: null };

  if (messagesError) {
    throw new Error(`Failed to load source messages: ${messagesError.message}`);
  }

  const shaped = shapeAnnouncements(
    announcementRows ?? [],
    engagementResult.data ?? [],
    contradictionResult.data ?? [],
    sourceLinkResult.data ?? [],
    messageRows ?? [],
  );

  const announcements = buildDiscoverFeed(shaped);
  const now = new Date();

  return <DiscoverClient announcements={announcements} nowIso={now.toISOString()} />;
}
