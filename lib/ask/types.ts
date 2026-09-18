import type { AnnouncementCategory, ConfidenceLevel } from "@/lib/dashboard/types";

/**
 * One of a student's own visible announcements, as fetched for retrieval
 * (lib/ask/actions.ts) — the query that produces this is deliberately the
 * SAME RLS-scoped, unfiltered `announcements` query
 * app/student/dashboard/page.tsx uses, just a narrower column list (this
 * feature never renders engagement pills, contradictions, or trace-to-
 * source drawers, so it doesn't fetch those joins). Whatever comes back
 * here IS, by construction, exactly what this student is allowed to see —
 * see lib/ask/actions.ts's own doc comment for why that's not an
 * assumption this file needs to re-enforce itself.
 */
export interface AskCandidateRow {
  id: string;
  category: AnnouncementCategory;
  title: string;
  why_it_matters: string | null;
  what_to_do_next: string | null;
  confidence: ConfidenceLevel;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  deadline_at: string | null;
  /** Same column, same meaning, as `lib/deduplication/types.ts`'s `DedupFields.title_embedding` — this feature is a second reader of that one stored value, never a second embedding pipeline. */
  title_embedding: number[] | null;
}

/** One retrieved announcement, shown alongside the synthesized answer so a student can see exactly what it was drawn from. */
export interface AskSource {
  id: string;
  title: string;
  category: AnnouncementCategory;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}
