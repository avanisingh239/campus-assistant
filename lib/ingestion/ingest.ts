"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { extractAnnouncements, ExtractionError } from "@/lib/ai/extract";
import { toAnnouncementRow } from "./map-to-announcement";
import type { IngestOptions, IngestResult } from "./types";

/**
 * End-to-end ingestion pipeline: raw pasted text -> Claude extraction ->
 * Zod-validated structured data -> `messages` + `announcements` rows.
 *
 * Runs through the service-role client (lib/supabase/admin.ts) because
 * `messages` and `announcements` have no INSERT policy for the
 * `authenticated` role in supabase/schema.sql — see docs/data-model.md §4.
 *
 * Deliberately NOT implemented here (see docs/data-model.md §5 — these are
 * deterministic-engine work, not part of this pass):
 *   - deduplication against existing announcements ("Confirmed by N sources")
 *   - clash detection / free-slot matching
 *   - urgency_score / consequence_weight / priority_score
 * Every call currently inserts new `announcements` rows unconditionally.
 */
export async function ingestRawText(
  rawText: string,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const trimmed = rawText.trim();
  if (trimmed.length < 10) {
    throw new Error("Paste at least 10 characters of message text.");
  }

  const supabase = createAdminClient();

  // 1. Store the raw message immutably (ai-contracts.md Contract 2: ready -> processing)
  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      raw_text: trimmed,
      source_type: options.sourceType ?? "paste",
      source_group_name: options.sourceGroupName ?? null,
      submitted_by: options.submittedBy ?? null,
    })
    .select("id")
    .single();

  if (messageError || !message) {
    throw new Error(`Failed to store raw message: ${messageError?.message}`);
  }

  // 2. Claude extraction, validated against ExtractedAnnouncementSchema
  //    (ai-contracts.md Contract 1).
  let extracted;
  try {
    extracted = await extractAnnouncements(trimmed);
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError(`Extraction failed: ${(err as Error).message}`);
  }

  // 3. One announcement + one announcement_sources link per extracted item.
  const announcementIds: string[] = [];
  for (const item of extracted) {
    const row = toAnnouncementRow(item);

    const { data: announcement, error: announcementError } = await supabase
      .from("announcements")
      .insert(row)
      .select("id")
      .single();

    if (announcementError || !announcement) {
      throw new Error(
        `Failed to store announcement "${item.title}": ${announcementError?.message}`,
      );
    }

    const { error: sourceError } = await supabase
      .from("announcement_sources")
      .insert({
        announcement_id: announcement.id,
        message_id: message.id,
        extracted_fields: item,
      });

    if (sourceError) {
      throw new Error(
        `Failed to link source for "${item.title}": ${sourceError.message}`,
      );
    }

    announcementIds.push(announcement.id as string);
  }

  return {
    messageId: message.id as string,
    announcementIds,
    extractedCount: extracted.length,
  };
}
