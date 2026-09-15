import type { AnnouncementCategory, ConfidenceLevel } from "./types";

/**
 * Human-readable tag label per category — matches announcement_category in
 * supabase/schema.sql exactly (9 values). Overridden to "Merged · N
 * sources" at render time when there's an unresolved contradiction — see
 * dashboard-client.tsx / card.tsx, not here.
 */
export const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  deadline: "Deadline",
  cancellation: "Cancellation",
  event: "Event",
  opportunity: "Opportunity",
  registered_update: "Registered update",
  society_link: "Society link",
  fyi: "FYI",
  duplicate: "Duplicate",
  uncategorized: "Uncategorized",
};

/**
 * Which icon each category renders in the card's cap band. The prototype
 * (dashboard.html) only demonstrates 6 of the 9 real categories — for the
 * 3 it doesn't (`event`, `fyi`, `uncategorized`), this is this
 * implementation's own reasonable choice, documented here rather than
 * silently invented:
 *   - `event` reuses the `opportunity` icon key's color family in CSS
 *     (closest semantic cousin, and the prototype's own defined tag-color
 *     palette has no separate "event" family) but gets its own icon
 *     (calendar) so the two remain visually distinct.
 *   - `fyi` gets a plain info icon; low-urgency/neutral, so it does not
 *     borrow a color family meant to signal something more actionable.
 *   - `uncategorized` reuses the prototype's card-6 warning-triangle icon
 *     (shown there for a merged/contradictory item) for its literal
 *     "we don't know what this is" meaning, and the `duplicate` tag color
 *     family (muted tan), since no dedicated family exists for it either.
 */
export const CATEGORY_ICON: Record<AnnouncementCategory, string> = {
  deadline: "deadline",
  cancellation: "cancellation",
  event: "event",
  opportunity: "opportunity",
  registered_update: "registeredUpdate",
  society_link: "societyLink",
  fyi: "fyi",
  duplicate: "duplicate",
  uncategorized: "uncategorized",
};

/**
 * Categories where a 1-tap Interested/Registered/Not Interested toggle
 * makes sense (docs/product-spec.md Area A.4 "Engagement Toggles"). A
 * `society_link` isn't something you register interest in — the
 * prototype's own society-link card (#5) shows no pills at all.
 */
export function supportsEngagementToggle(category: AnnouncementCategory): boolean {
  return category !== "society_link";
}

/**
 * The confidence badge text (docs/product-spec.md Area C.4's
 * `confidence_badge`: `✅ Clear` / `⚠️ Partially clear` / `❓ Unclear`).
 * Pulled out of card.tsx once app/student/ingest's result panel needed the
 * exact same three labels — the CSS class per level stays local to each
 * consumer (card.tsx / result-panel.tsx), since which stylesheet's
 * `.confidenceClear` etc. applies depends on which CSS Module the caller
 * already imports, not on this shared text.
 */
export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  clear: "✅ Clear",
  partial: "⚠️ Partially clear",
  unclear: "❓ Unclear",
};
