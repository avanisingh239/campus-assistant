import type { AnnouncementCategory, ConfidenceLevel } from "@/lib/dashboard/types";

export type IngestSourceType = "paste" | "whatsapp_export" | "admin_form" | "whatsapp_bot";

export interface IngestOptions {
  sourceType?: IngestSourceType;
  sourceGroupName?: string;
  submittedBy?: string;
}

/**
 * One extracted item's headline fields — enough for the ingestion UI
 * (app/student/ingest) to show real confirmation of what was parsed
 * without a second round-trip fetch. Everything else about the row
 * (why_it_matters, dates, trace sources, ...) is already visible once the
 * student navigates to the dashboard; this is deliberately not the full
 * DashboardAnnouncement shape.
 */
export interface IngestedAnnouncementSummary {
  id: string;
  category: AnnouncementCategory;
  title: string;
  confidence: ConfidenceLevel;
}

export interface IngestResult {
  messageId: string;
  announcementIds: string[];
  extractedCount: number;
  announcements: IngestedAnnouncementSummary[];
}
