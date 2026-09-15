import type { EngagementStatus } from "@/lib/deterministic/types";
import { buildContradictionSummary, type ConflictingValueEntry } from "./contradiction-summary";
import type {
  AnnouncementCategory,
  ConfidenceLevel,
  DashboardAnnouncement,
} from "./types";

/**
 * Pure shaping/joining of the raw rows lib/supabase queries return into the
 * flat DashboardAnnouncement shape the UI renders. No DB access here —
 * see app/student/dashboard/page.tsx for the queries that produce these
 * inputs. Follows the same established pattern as
 * lib/ingestion/map-to-announcement.ts: separate flat queries, joined in
 * JS (this codebase doesn't use PostgREST embeds anywhere), so the join
 * logic itself stays a plain, unit-testable function.
 */

export interface RawAnnouncementRow {
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
  priority_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface RawEngagementRow {
  announcement_id: string;
  status: EngagementStatus;
}

export interface RawContradictionRow {
  announcement_id: string;
  field_name: string;
  conflicting_values: ConflictingValueEntry[];
  resolved: boolean;
}

export interface RawSourceLinkRow {
  announcement_id: string;
  message_id: string;
}

export interface RawMessageRow {
  id: string;
  raw_text: string;
  source_group_name: string | null;
  created_at: string;
}

export function shapeAnnouncements(
  announcements: RawAnnouncementRow[],
  engagements: RawEngagementRow[],
  contradictions: RawContradictionRow[],
  sourceLinks: RawSourceLinkRow[],
  messages: RawMessageRow[],
): DashboardAnnouncement[] {
  const engagementByAnnouncementId = new Map(
    engagements.map((e) => [e.announcement_id, e.status]),
  );

  // Only the first unresolved contradiction per announcement is shown — one
  // banner per card, not a stack of them.
  const contradictionByAnnouncementId = new Map<string, RawContradictionRow>();
  for (const c of contradictions) {
    if (!c.resolved && !contradictionByAnnouncementId.has(c.announcement_id)) {
      contradictionByAnnouncementId.set(c.announcement_id, c);
    }
  }

  const messageById = new Map(messages.map((m) => [m.id, m]));

  const messageIdsByAnnouncementId = new Map<string, string[]>();
  for (const link of sourceLinks) {
    const list = messageIdsByAnnouncementId.get(link.announcement_id) ?? [];
    list.push(link.message_id);
    messageIdsByAnnouncementId.set(link.announcement_id, list);
  }

  return announcements.map((a) => {
    const contradiction = contradictionByAnnouncementId.get(a.id);
    const messageIds = messageIdsByAnnouncementId.get(a.id) ?? [];
    const traceSources = messageIds
      .map((id) => messageById.get(id))
      .filter((m): m is RawMessageRow => m !== undefined)
      .sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());

    const result: DashboardAnnouncement = {
      id: a.id,
      category: a.category,
      title: a.title,
      why_it_matters: a.why_it_matters,
      what_to_do_next: a.what_to_do_next,
      confidence: a.confidence,
      confidence_note: a.confidence_note,
      event_date: a.event_date,
      start_time: a.start_time,
      end_time: a.end_time,
      deadline_at: a.deadline_at,
      link_url: a.link_url,
      link_verified: a.link_verified,
      seat_count: a.seat_count,
      seats_unclear: a.seats_unclear,
      priority_score: a.priority_score ?? 0,
      created_at: a.created_at,
      updated_at: a.updated_at,
      engagementStatus: engagementByAnnouncementId.get(a.id) ?? "none",
      sourceCount: Math.max(1, messageIds.length), // every announcement has at least its originating message
      contradiction: contradiction
        ? {
            field_name: contradiction.field_name,
            summary: buildContradictionSummary(contradiction.field_name, contradiction.conflicting_values),
          }
        : null,
      traceSources,
    };

    return result;
  });
}
