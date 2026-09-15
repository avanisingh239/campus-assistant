import type { DashboardAnnouncement } from "./types";

export type DashboardFilter = "all" | "deadline" | "events" | "conflicts" | "unclear";

export const DASHBOARD_FILTERS: { id: DashboardFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deadline", label: "Deadline" },
  { id: "events", label: "Events" },
  { id: "conflicts", label: "Conflicts" },
  { id: "unclear", label: "Unclear" },
];

/**
 * Client-side category filter for the Action Plan feed
 * (docs/figma-screen-inventory.md §1.2's "Filter feed by category"
 * Requirement). `all`/`deadline`/`unclear` map onto real, single fields;
 * `events` and `conflicts` don't correspond to one column each, so their
 * exact scope is a deliberate choice, not an arbitrary label:
 *
 * - `events` = `event` ∪ `opportunity` — not a new grouping invented for
 *   this filter: it's exactly the pair dashboard.module.css's own
 *   `.card[data-category="event"], .card[data-category="opportunity"]`
 *   selector already treats as one color family. `registered_update` gets
 *   its own card color and its own place in "All" instead, on purpose.
 * - `conflicts` = "this announcement appears on either side of one of this
 *   student's `clashes` rows" (see lib/dashboard/clash-flags.ts) — the
 *   task's suggested tab name, implemented against real clash data rather
 *   than a fabricated category. A `class_vs_class` clash never references
 *   an announcement at all, so it can never populate this tab; that's
 *   `/student/timetable`'s own clash badges' job, not this feed's.
 */
export function filterAnnouncements(
  announcements: DashboardAnnouncement[],
  filter: DashboardFilter,
  clashedAnnouncementIds: ReadonlySet<string>,
): DashboardAnnouncement[] {
  switch (filter) {
    case "all":
      return announcements;
    case "deadline":
      return announcements.filter((a) => a.category === "deadline");
    case "events":
      return announcements.filter((a) => a.category === "event" || a.category === "opportunity");
    case "conflicts":
      return announcements.filter((a) => clashedAnnouncementIds.has(a.id));
    case "unclear":
      return announcements.filter((a) => a.confidence === "unclear");
  }
}
