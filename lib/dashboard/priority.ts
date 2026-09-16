import type { AnnouncementCategory, DashboardAnnouncement } from "./types";

/**
 * Real urgency × consequence priority scoring. `announcements.priority_score`
 * has existed as a generated column (`urgency_score * consequence_weight`,
 * supabase/schema.sql) since the original schema, but nothing has ever
 * actually set either input — every score has effectively been 0 the whole
 * time, and the dashboard's URGENT ribbon ran on a soonest-date fallback
 * instead.
 *
 * Deliberately computed live, at render time, rather than by a scheduled
 * job (supabase/schema.sql's own closing notes suggested a cron for
 * feature 2.3's "time-decay re-ranking"). A pure function of the
 * announcement's stored fields plus `now` needs no scheduling
 * infrastructure and *is* time-decay re-ranking as a side effect — a score
 * computed fresh on every page load is automatically always current. The
 * stored `priority_score`/`urgency_score`/`consequence_weight` columns are
 * deliberately left alone (not written back to) — see this file's own
 * closing note for why.
 */

/**
 * Consequence weight — how much it matters if you miss/ignore this,
 * independent of timing. A genuine product judgment call, not derived
 * from anything else in this codebase, so the full reasoning is spelled
 * out here rather than left implicit:
 *
 *   - `deadline` (1.0) and `registered_update` (1.0) — the top tier.
 *     `deadline` has a real external consequence (a late fee, a zero
 *     grade). `registered_update` means something changed about an event
 *     you've *already committed to* (a class you're registered for was
 *     rescheduled, a workshop's venue moved) — missing that update risks
 *     missing something you're already invested in, not just a fact you'd
 *     have liked to know. Tied rather than one above the other: both are
 *     "you're already on the hook for something," just via different
 *     mechanisms (an external deadline vs. your own prior commitment).
 *
 *   - `cancellation` (0.6), `opportunity` (0.6), and `event` (0.6) — the
 *     middle tier. Worth knowing and acting on, but lower stakes than the
 *     top tier: a cancellation mostly just saves you a wasted trip
 *     (annoying, not consequential), and a missed opportunity is a missed
 *     upside, not a penalty. `event` joins this tier rather than getting
 *     its own weight — it already shares `opportunity`'s tag-color family
 *     elsewhere in this codebase (lib/dashboard/category-meta.ts, "closest
 *     semantic cousin" reasoning) for the same underlying reason: a plain
 *     event announcement is "worth knowing, not consequential," the same
 *     shape as a cancellation or opportunity.
 *
 *   - `society_link` (0.2), `fyi` (0.2), `duplicate` (0.2), and
 *     `uncategorized` (0.2) — the lowest tier. Reference material or
 *     noise, not something with a deadline-shaped consequence.
 *     `uncategorized` joins `duplicate` here for the same reason
 *     category-meta.ts already pairs the two visually (shared icon/tag
 *     color) — "we don't know what this is" is never a reason to treat
 *     something as urgent by default.
 */
export const CONSEQUENCE_WEIGHTS: Record<AnnouncementCategory, number> = {
  deadline: 1.0,
  registered_update: 1.0,
  cancellation: 0.6,
  opportunity: 0.6,
  event: 0.6,
  society_link: 0.2,
  fyi: 0.2,
  duplicate: 0.2,
  uncategorized: 0.2,
};

/** The subset of an announcement's fields the scoring function actually needs. */
export interface PriorityScoreInput {
  category: AnnouncementCategory;
  deadline_at: string | null;
  event_date: string | null;
  start_time: string | null;
}

/** Beyond this many hours out, urgency has already flattened to its floor — see computeUrgencyScore. */
const URGENCY_WINDOW_HOURS = 14 * 24; // 2 weeks

/**
 * The low, deliberately-nonzero urgency a no-date announcement gets. Per
 * the task's own instruction: an unclear timeline "shouldn't crash,
 * shouldn't score as maximally urgent by default." Zero would make a
 * no-date item indistinguishable from one whose date has definitely
 * already passed (see below) — this is instead just below any item with
 * a real signal, so it never outranks something with an actual near-term
 * date, but a no-date announcement isn't nothing either (it may well still
 * be worth surfacing, just without a timing signal to rank it on).
 */
const NO_DATE_URGENCY = 5;

/** deadline_at wins when both are somehow set — mutually exclusive in practice by category convention. */
function relevantInstant(announcement: PriorityScoreInput): Date | null {
  if (announcement.deadline_at) return new Date(announcement.deadline_at);
  if (announcement.event_date) {
    // "YYYY-MM-DDTHH:MM:00Z" — same UTC-anchoring convention as
    // lib/deterministic/overlap.ts's dayOfWeekFromDate and this file's own
    // predecessor logic: event_date/start_time are treated as UTC
    // directly, never parsed against whatever timezone the server
    // happens to be running in.
    const time = announcement.start_time ?? "00:00";
    return new Date(`${announcement.event_date}T${time.slice(0, 5)}:00Z`);
  }
  return null;
}

/**
 * How soon the relevant date/time is, on a 0-100 scale — closer means
 * higher, and it decays linearly to 0 by `URGENCY_WINDOW_HOURS` out.
 * Already-passed dates score 0, not "maximally urgent" — a deadline that
 * has come and gone isn't something to flag URGENT (matches this file's
 * pre-existing "does not consider a past deadline 'upcoming'" behavior);
 * there's no "archived" state built yet (docs/requirements-traceability.md's
 * announcement lifecycle names one, unbuilt) for genuinely stale content,
 * so simply not treating it as urgent is the safe default. No date at all
 * gets the low, fixed `NO_DATE_URGENCY` floor rather than crashing or
 * defaulting to either extreme.
 */
export function computeUrgencyScore(announcement: PriorityScoreInput, now: Date): number {
  const instant = relevantInstant(announcement);
  if (!instant) return NO_DATE_URGENCY;

  const hoursUntil = (instant.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntil < 0) return 0;

  const clampedHours = Math.min(hoursUntil, URGENCY_WINDOW_HOURS);
  return 100 * (1 - clampedHours / URGENCY_WINDOW_HOURS);
}

/** urgency (0-100) × consequence weight (0.2-1.0) — same shape as the generated `priority_score` column's own formula. */
export function computePriorityScore(announcement: PriorityScoreInput, now: Date): number {
  return computeUrgencyScore(announcement, now) * CONSEQUENCE_WEIGHTS[announcement.category];
}

/**
 * Sorts announcements highest-priority-first using the live-computed
 * score above — this is now the dashboard's real card order, replacing
 * the DB query's old `.order("priority_score", ...)` (meaningless while
 * every row's stored score was 0; see app/student/dashboard/page.tsx).
 * `Array.prototype.sort` is a stable sort (guaranteed since ES2019), so an
 * exact score tie keeps the callers' own prior order — the DB query's
 * `created_at desc` — as a reasonable secondary order, without this
 * function needing its own explicit tie-break.
 */
export function sortByPriorityScore(
  announcements: DashboardAnnouncement[],
  now: Date,
): DashboardAnnouncement[] {
  return [...announcements].sort(
    (a, b) => computePriorityScore(b, now) - computePriorityScore(a, now),
  );
}

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

/**
 * Below this, there's no real signal to justify singling one item out for
 * the ribbon — e.g. every eligible item is either genuinely far off or has
 * no date at all. Chosen so a deadline/registered_update more than ~12
 * days out (urgency ≈10-15 × weight 1.0) or a no-date item at any weight
 * (urgency 5 × weight ≤1.0 = 5) don't clear it on their own, but anything
 * within about a week and a half of a real date does.
 */
const URGENT_RIBBON_THRESHOLD = 15;

/**
 * Picks the single announcement to show the pulsing "URGENT" corner
 * ribbon on, using the real computed priority score above (previously:
 * the always-0 stored `priority_score`, tie-broken by soonest upcoming
 * date — that fallback is gone now that the score itself is real).
 * Highest score among the eligible categories wins; returns `null` rather
 * than an arbitrary pick when nothing clears `URGENT_RIBBON_THRESHOLD` —
 * showing URGENT on literally the first list item with no real reason
 * would be misleading.
 */
export function pickUrgentAnnouncementId(
  announcements: DashboardAnnouncement[],
  now: Date,
): string | null {
  const eligible = announcements.filter((a) => URGENCY_ELIGIBLE_CATEGORIES.has(a.category));
  if (eligible.length === 0) return null;

  let best: DashboardAnnouncement | null = null;
  let bestScore = -Infinity;

  for (const announcement of eligible) {
    const score = computePriorityScore(announcement, now);
    if (score > bestScore) {
      best = announcement;
      bestScore = score;
    }
  }

  if (best && bestScore > URGENT_RIBBON_THRESHOLD) {
    return best.id;
  }
  return null;
}

/*
 * Not written back to `urgency_score`/`consequence_weight`/`priority_score`
 * (the task's own point 5 left this optional). Deliberately skipped:
 * `urgency_score` decays continuously with time by design (that's the
 * whole "time-decay re-ranking as a side effect" point above) — writing
 * a snapshot of it into a stored column would go stale within hours,
 * reintroducing exactly the staleness problem computing it live was
 * chosen to avoid. And nothing else in this codebase currently reads any
 * of those three columns for anything (confirmed via a repo-wide grep) —
 * there's no existing consumer that would benefit from having it stored,
 * so there's no concrete win to justify the extra write path (and its
 * write-amplification cost — one UPDATE per announcement per read, if it
 * were kept fresh at all).
 */
