import type { DashboardAnnouncement } from "./types";

/**
 * De-duplicates the Communities directory (docs/product-spec.md Area A.3)
 * by `link_url` — if the same group link was posted in multiple class
 * groups, show it once, not once per announcement. First occurrence wins
 * (the query this runs against is already sorted by title, so that's a
 * stable, predictable choice, not an arbitrary one).
 *
 * Deliberately simple: this is exact-URL de-dupe, not the full dedup/
 * "Confirmed by N sources" engine (still just notes in
 * supabase/schema.sql — see CLAUDE.md's Core architectural rule section).
 * It doesn't merge trace sources from the dropped duplicates into the
 * surviving entry either — trace-to-source on that one entry still shows
 * its own real source message(s), nothing is fabricated, just not
 * merged across announcements the way the real dedup engine eventually
 * would.
 *
 * Filters out anything with no `link_url` at all, defensively — the page
 * query already does this in SQL, but a pure function shouldn't assume
 * its caller always pre-filters.
 */
export function dedupeByLinkUrl(links: DashboardAnnouncement[]): DashboardAnnouncement[] {
  const seen = new Set<string>();
  const result: DashboardAnnouncement[] = [];

  for (const link of links) {
    if (link.link_url === null || seen.has(link.link_url)) continue;
    seen.add(link.link_url);
    result.push(link);
  }

  return result;
}
