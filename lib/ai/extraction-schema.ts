import { z } from "zod";

/**
 * Mirrors the `announcements` table in supabase/schema.sql column-for-column.
 * See docs/ai-contracts.md §3 for the full rationale and the list of fields
 * that were removed from earlier drafts because no matching column exists
 * (course_code, faculty_name, target_section, location_room, ...).
 *
 * This is the contract Claude's output must satisfy. Treat it as untrusted
 * input even though `client.messages.parse()` (see lib/ai/extract.ts)
 * already validates against it — lib/ingestion/ingest.ts re-checks each
 * item independently before it reaches the database.
 */
export const ExtractedAnnouncementSchema = z.object({
  category: z.enum([
    "deadline",
    "cancellation",
    "event",
    "opportunity",
    "registered_update",
    "society_link",
    "fyi",
    "duplicate",
    "uncategorized",
  ]),
  title: z.string().min(3).max(120),
  why_it_matters: z.string().min(5).max(180).nullable(),
  what_to_do_next: z.string().min(3).max(120).nullable(),

  confidence: z.enum(["clear", "partial", "unclear"]),
  confidence_note: z.string().nullable(),

  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .nullable(),
  start_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM")
    .nullable(),
  end_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM")
    .nullable(),
  deadline_at: z.string().datetime().nullable(),

  linked_class_name: z.string().nullable(),
  match_confidence: z.number().min(0).max(1).nullable(),

  seat_count: z.number().int().positive().nullable(),
  seats_unclear: z.boolean().default(false),

  link_url: z.string().url().nullable(),
});

export type ExtractedAnnouncement = z.infer<typeof ExtractedAnnouncementSchema>;

export const ExtractionBatchSchema = z.object({
  announcements: z.array(ExtractedAnnouncementSchema),
});

export type ExtractionBatch = z.infer<typeof ExtractionBatchSchema>;
