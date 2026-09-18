import type { AnnouncementCategory } from "@/lib/dashboard/types";

/**
 * The subset of an extracted/stored announcement's fields the dedup engine
 * actually reads — mirrors the narrow-row-shape convention already
 * established in lib/deterministic/types.ts (AnnouncementForDeterministicEngine)
 * rather than depending on the full announcements row shape.
 */
export interface DedupFields {
  category: AnnouncementCategory;
  title: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  deadline_at: string | null;
  linked_class_name: string | null;
  seat_count: number | null;
  /**
   * The title's semantic embedding (lib/ai/embed.ts's `embedText`),
   * computed once at ingestion time — `null` when embedding failed/rate-
   * limited for this item (see embed.ts's own doc comment) or when the
   * candidate predates this feature and never had one computed at all.
   * Either way, `null` is a real, expected value, not an error state —
   * lib/deduplication/embedding-similarity.ts's `embeddingsIndicateMatch`
   * always treats it as "can't compare," never as "assume similar."
   */
  title_embedding: number[] | null;
}

/**
 * One existing `announcements` row being considered as a merge target.
 * `submittedByClassName` isn't a real column on `announcements` — it's
 * resolved by the DB-fetching wrapper (lib/deduplication/sync.ts) from the
 * candidate's own `announcement_sources` -> `messages.submitted_by_class_name`,
 * the same field the RLS policy itself keys on (supabase/schema.sql). Left
 * `null` (never fetched) for the always-cross-class categories, where it's
 * irrelevant — see match.ts's `ALWAYS_SHARED_CATEGORIES`.
 */
export interface DedupCandidate extends DedupFields {
  id: string;
  submittedByClassName: string | null;
}
