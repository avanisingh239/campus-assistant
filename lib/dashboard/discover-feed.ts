import type { DashboardAnnouncement } from "./types";

/**
 * Filters and sorts the "Don't Miss This" discovery feed
 * (docs/product-spec.md Area A.1 / Feature 4.3) from the same
 * DashboardAnnouncement shape the Action Plan dashboard uses.
 *
 * The category filter itself (opportunity, or event with a seat count or
 * seats_unclear) runs in the page's Supabase query, not here — that way
 * the query only ever fetches rows this feed could show, same "push the
 * filter into SQL" reasoning as the rest of this codebase. This function
 * owns the two rules that need the shaped/joined data to evaluate:
 *  - excludes anything the student has already marked not_interested
 *    ("Not Interested" suppresses resurfacing in digests per
 *    docs/product-spec.md — this feed counts as a digest)
 *  - sorts by soonest deadline/event date, not priority_score, so a
 *    genuinely time-sensitive item still surfaces first without the
 *    dashboard's urgency scoring ever burying a low-score opportunity —
 *    the whole reason this feed exists separately from the dashboard
 */
export function buildDiscoverFeed(announcements: DashboardAnnouncement[]): DashboardAnnouncement[] {
  return announcements
    .filter((a) => a.engagementStatus !== "not_interested")
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
