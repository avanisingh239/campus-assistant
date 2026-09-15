import type { AnnouncementCategory, DashboardAnnouncement } from "./types";

export type DiffSummary =
  | { kind: "first_visit" }
  | { kind: "no_changes" }
  | { kind: "updates"; count: number; text: string };

/**
 * docs/product-spec.md's own wording for the diff banner: "First-time
 * users see a 'Welcome! Here is your initial briefing' card; the diff
 * engine activates only from the second session onward." "No changes"
 * (a returning student with nothing new) gets no banner at all, not an
 * empty/zero one.
 */
function categoryPhrase(category: AnnouncementCategory, count: number): string {
  switch (category) {
    case "deadline":
      return `${count} new deadline${count === 1 ? "" : "s"}`;
    case "cancellation":
      return `${count} class${count === 1 ? "" : "es"} cancelled`;
    case "event":
      return `${count} new event${count === 1 ? "" : "s"}`;
    case "opportunity":
      return `${count} new opportunit${count === 1 ? "y" : "ies"}`;
    case "registered_update":
      return `${count} update${count === 1 ? "" : "s"} to something you're registered for`;
    case "society_link":
      return `${count} new group link${count === 1 ? "" : "s"}`;
    case "fyi":
      return `${count} new FYI${count === 1 ? "" : "s"}`;
    case "duplicate":
      return `${count} duplicate${count === 1 ? "" : "s"} flagged`;
    case "uncategorized":
      return `${count} uncategorized item${count === 1 ? "" : "s"}`;
  }
}

/**
 * Builds the "N updates since you last checked — ..." diff summary
 * (docs/requirements-traceability.md Feature 4.5). Scoped to what's
 * actually derivable from current data: new/updated `announcements` since
 * `lastSeenAt`, grouped by category. Deliberately does NOT include a
 * "clash resolved" phrase like the prototype's hardcoded example does —
 * that would need a history of clash state changes over time, which
 * nothing in this codebase tracks (lib/deterministic/ only reads current
 * state); adding a fabricated count here would be worse than omitting it.
 */
export function buildDiffSummary(
  announcements: DashboardAnnouncement[],
  lastSeenAt: string | null,
): DiffSummary {
  if (lastSeenAt === null) {
    return { kind: "first_visit" };
  }

  const lastSeenTime = new Date(lastSeenAt).getTime();
  const changed = announcements.filter((a) => {
    const created = new Date(a.created_at).getTime();
    const updated = new Date(a.updated_at).getTime();
    return created > lastSeenTime || updated > lastSeenTime;
  });

  if (changed.length === 0) {
    return { kind: "no_changes" };
  }

  const countByCategory = new Map<AnnouncementCategory, number>();
  for (const a of changed) {
    countByCategory.set(a.category, (countByCategory.get(a.category) ?? 0) + 1);
  }

  const phrases = [...countByCategory.entries()].map(([category, count]) =>
    categoryPhrase(category, count),
  );

  const count = changed.length;
  const text = `${count} update${count === 1 ? "" : "s"} since you last checked — ${phrases.join(", ")}.`;

  return { kind: "updates", count, text };
}
