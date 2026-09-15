import type { EngagementStatus } from "@/lib/deterministic/types";

export type AnnouncementCategory =
  | "deadline"
  | "cancellation"
  | "event"
  | "opportunity"
  | "registered_update"
  | "society_link"
  | "fyi"
  | "duplicate"
  | "uncategorized";

export type ConfidenceLevel = "clear" | "partial" | "unclear";

/** One raw `messages` row surfaced via `announcement_sources` for the trace-to-source drawer. */
export interface TraceSource {
  id: string;
  raw_text: string;
  source_group_name: string | null;
  created_at: string;
}

/** One unresolved `contradictions` row, already summarized into display text — see contradiction-summary.ts. */
export interface ContradictionInfo {
  field_name: string;
  summary: string;
}

/**
 * Everything a dashboard card needs to render, already joined and shaped —
 * see shape-announcements.ts for how the raw Supabase rows become this.
 * Deliberately flat (no nested `announcement.sources` etc.) so it's a
 * plain, easy-to-test data structure.
 */
export interface DashboardAnnouncement {
  id: string;
  category: AnnouncementCategory;
  title: string;
  why_it_matters: string | null;
  what_to_do_next: string | null;
  confidence: ConfidenceLevel;
  confidence_note: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  deadline_at: string | null;
  link_url: string | null;
  link_verified: boolean;
  seat_count: number | null;
  seats_unclear: boolean;
  priority_score: number;
  created_at: string;
  updated_at: string;
  engagementStatus: EngagementStatus;
  sourceCount: number;
  contradiction: ContradictionInfo | null;
  traceSources: TraceSource[];
}
