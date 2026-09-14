import type { ExtractedAnnouncement } from "@/lib/ai/extraction-schema";

/**
 * Pure transform from a validated Claude extraction item to an
 * `announcements` insert row. Deliberately excludes `urgency_score`,
 * `consequence_weight`, and `priority_score` (generated) — those are
 * deterministic-engine fields the AI never writes (docs/data-model.md §5)
 * and are left to their column defaults (null / generated) until that
 * engine exists.
 *
 * No network/DB access here on purpose, so it's cheap to unit test
 * (see map-to-announcement.test.ts) without mocking Supabase or Claude.
 */
export function toAnnouncementRow(item: ExtractedAnnouncement) {
  // Normalize a contradiction the schema's types allow but the data
  // shouldn't: a concrete seat_count makes "unclear" meaningless.
  const seatsUnclear = item.seat_count === null ? item.seats_unclear : false;

  return {
    category: item.category,
    title: item.title,
    why_it_matters: item.why_it_matters,
    what_to_do_next: item.what_to_do_next,
    confidence: item.confidence,
    confidence_note: item.confidence_note,
    event_date: item.event_date,
    start_time: item.start_time,
    end_time: item.end_time,
    deadline_at: item.deadline_at,
    linked_class_name: item.linked_class_name,
    match_confidence: item.match_confidence,
    seat_count: item.seat_count,
    seats_unclear: seatsUnclear,
    link_url: item.link_url,
  };
}

export type AnnouncementRow = ReturnType<typeof toAnnouncementRow>;
