import type { DashboardAnnouncement } from "./types";

/**
 * The same "discovery-worthy" predicate as app/student/dont-miss-this's
 * `.or()` Supabase filter, exposed as a plain JS function for call sites
 * that already have a full, unfiltered announcement list in memory and
 * don't want to issue a second query just to re-derive this — namely the
 * dashboard's stat row (see app/student/dashboard/dashboard-client.tsx),
 * which needs a "Don't miss" count alongside announcements it already
 * fetched with no category filter. The dedicated /student/dont-miss-this
 * page keeps pushing the filter into SQL for its own reasons (never fetch
 * a row it couldn't show), so the two definitions are kept in sync by
 * hand — if this predicate changes, update that page's `.or()` string too.
 */
export function isDiscoveryWorthy(announcement: DashboardAnnouncement): boolean {
  if (announcement.category === "opportunity") return true;
  return announcement.category === "event" && (announcement.seat_count !== null || announcement.seats_unclear);
}

/**
 * "Not Interested" suppresses resurfacing in digests/summaries without
 * deleting the underlying `student_announcement_status` row
 * (docs/product-spec.md's own wording — see CLAUDE.md's §"Not Interested"
 * fix for the real bug this predicate now closes). A shared, single
 * source of truth: originally inlined only in `buildDiscoverFeed` below,
 * extracted once a second caller (the main Action Plan dashboard's own
 * feed, `app/student/dashboard/page.tsx`) needed the exact same exclusion
 * — same "extract on second use" pattern as `isDiscoveryWorthy` above.
 * Purely a display filter: the `student_announcement_status` row itself is
 * never touched or deleted, so a student's engagement history is fully
 * intact for any other part of the UI that might read it later.
 */
export function excludeNotInterested(announcements: DashboardAnnouncement[]): DashboardAnnouncement[] {
  return announcements.filter((a) => a.engagementStatus !== "not_interested");
}

/**
 * Filters and sorts the "Don't Miss This" discovery feed
 * (docs/product-spec.md Area A.1 / Feature 4.3) from the same
 * DashboardAnnouncement shape the Action Plan dashboard uses.
 *
 * The category filter itself (opportunity, or event with a seat count or
 * seats_unclear — see `isDiscoveryWorthy` above) runs in the page's
 * Supabase query, not here — that way the query only ever fetches rows
 * this feed could show, same "push the filter into SQL" reasoning as the
 * rest of this codebase. This function owns the two rules that need the
 * shaped/joined data to evaluate:
 *  - excludes anything the student has already marked not_interested
 *    (`excludeNotInterested` above)
 *  - sorts by soonest deadline/event date, not priority_score, so a
 *    genuinely time-sensitive item still surfaces first without the
 *    dashboard's urgency scoring ever burying a low-score opportunity —
 *    the whole reason this feed exists separately from the dashboard
 */
export function buildDiscoverFeed(announcements: DashboardAnnouncement[]): DashboardAnnouncement[] {
  return excludeNotInterested(announcements)
    .slice()
    .sort((a, b) => soonestDateMs(a) - soonestDateMs(b) || b.created_at.localeCompare(a.created_at));
}

/** Earliest of deadline_at/event_date, in ms since epoch; +Infinity if neither is set (sorts last). */
function soonestDateMs(announcement: DashboardAnnouncement): number {
  const dates = [announcement.deadline_at, announcement.event_date]
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime());
  return dates.length > 0 ? Math.min(...dates) : Number.POSITIVE_INFINITY;
}
