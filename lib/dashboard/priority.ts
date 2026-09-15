import type { AnnouncementCategory, DashboardAnnouncement } from "./types";

/**
 * Categories where "urgent" is a meaningful concept — a bare FYI or a
 * society link isn't something that can be urgent, no matter its score.
 */
const URGENCY_ELIGIBLE_CATEGORIES: ReadonlySet<AnnouncementCategory> = new Set([
  "deadline",
  "cancellation",
  "event",
  "opportunity",
  "registered_update",
]);

/** The soonest upcoming (>= now) timestamp this announcement has, or +Infinity if none. */
function soonestUpcomingTimestamp(announcement: DashboardAnnouncement, now: Date): number {
  const candidates: number[] = [];
  if (announcement.deadline_at) {
    candidates.push(new Date(announcement.deadline_at).getTime());
  }
  if (announcement.event_date) {
    const time = announcement.start_time ?? "00:00";
    candidates.push(new Date(`${announcement.event_date}T${time.slice(0, 5)}:00Z`).getTime());
  }
  const upcoming = candidates.filter((t) => t >= now.getTime());
  return upcoming.length > 0 ? Math.min(...upcoming) : Infinity;
}

/**
 * Picks the single announcement to show the pulsing "URGENT" corner ribbon
 * on (docs' own task framing: "show it on the single highest-priority item
 * if that reads better — your call"). Highest `priority_score` wins;
 * ties (the common case right now — every score is 0 until the
 * urgency_score/consequence_weight deterministic engine exists, see
 * docs/data-model.md §5) break on the soonest upcoming deadline/event.
 *
 * Returns null rather than an arbitrary pick when there's genuinely no
 * signal to rank on (no positive score AND nothing has an upcoming date) —
 * showing URGENT on literally the first list item with no real reason
 * would be misleading, not "reads better."
 */
export function pickUrgentAnnouncementId(
  announcements: DashboardAnnouncement[],
  now: Date,
): string | null {
  const eligible = announcements.filter((a) => URGENCY_ELIGIBLE_CATEGORIES.has(a.category));
  if (eligible.length === 0) return null;

  let best: DashboardAnnouncement | null = null;
  let bestScore = -Infinity;
  let bestSoonest = Infinity;

  for (const announcement of eligible) {
    const score = announcement.priority_score;
    const soonest = soonestUpcomingTimestamp(announcement, now);
    if (score > bestScore || (score === bestScore && soonest < bestSoonest)) {
      best = announcement;
      bestScore = score;
      bestSoonest = soonest;
    }
  }

  if (best && (bestScore > 0 || bestSoonest !== Infinity)) {
    return best.id;
  }
  return null;
}
