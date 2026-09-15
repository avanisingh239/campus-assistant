import type { ExtractedAnnouncement } from "@/lib/ai/extraction-schema";
import { verifyLink } from "./verify-link";

/**
 * Pure transform from a validated Claude extraction item to an
 * `announcements` insert row. Deliberately excludes `urgency_score`,
 * `consequence_weight`, and `priority_score` (generated) — those are
 * deterministic-engine fields the AI never writes (docs/data-model.md §5)
 * and are left to their column defaults (null / generated) until that
 * engine exists. `link_verified` is the same idea: the AI never wrote it
 * either (it isn't part of `ExtractedAnnouncementSchema` at all), and the
 * deterministic `verifyLink` check (lib/ingestion/verify-link.ts) below
 * is the actual source of truth for it, not a stand-in for a missing AI
 * field.
 *
 * `rawMessageText` is the original, unmodified source text this item was
 * extracted from — passed through so `verifyLink`'s "does the surrounding
 * text explicitly claim a WhatsApp group?" check runs against what was
 * actually written, not an AI paraphrase of it.
 *
 * No network/DB access here on purpose, so it's cheap to unit test
 * (see map-to-announcement.test.ts) without mocking Supabase or Claude.
 */
export function toAnnouncementRow(item: ExtractedAnnouncement, rawMessageText: string) {
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
    // No link at all means "unverified" is meaningless — true matches the
    // column's own DB default rather than flagging a link that isn't there.
    link_verified: item.link_url === null ? true : verifyLink(item.link_url, rawMessageText),
  };
}

export type AnnouncementRow = ReturnType<typeof toAnnouncementRow>;
