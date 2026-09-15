"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { extractAnnouncements, ExtractionError } from "@/lib/ai/extract";
import {
  syncFreeSlotsForCancellation,
  matchAnnouncementToOpenFreeSlots,
} from "@/lib/deterministic/sync";
import { toAnnouncementRow } from "./map-to-announcement";
import type { IngestOptions, IngestResult, IngestedAnnouncementSummary } from "./types";

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
 *   - urgency_score / consequence_weight / priority_score
 * Every call currently inserts new `announcements` rows unconditionally.
 *
 * Free-slot matching (lib/deterministic/sync.ts) DOES run here now, right
 * after each announcement is inserted — see the per-item loop below. Clash
 * detection deliberately does NOT run from here: a brand-new announcement
 * has no student_announcement_status rows yet, so it can't possibly
 * produce a class_vs_event/event_vs_event clash the moment it's created
 * (both are gated on interested/registered). Clash detection's real
 * trigger points are lib/timetable/actions.ts and lib/engagement/actions.ts.
 *
 * Also resolves `messages.submitted_by_class_name` — the announcements RLS
 * policy's real matching key (supabase/schema.sql) — from a fresh
 * `profiles.class_name` lookup keyed off `options.submittedBy`, never from
 * a caller-supplied value. See the lookup right below for why this can't
 * be spoofed the way a plain option could, and supabase/schema.sql's
 * "class-scoping / display-label split" migration note for the bug this
 * replaced (`source_group_name`, a free-text display label, was never the
 * same shape of data as `profiles.class_name` and was being used to gate
 * visibility anyway).
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

  // Server-derived RLS matching key (supabase/schema.sql's "class-scoping /
  // display-label split" migration note) — deliberately NOT taken from
  // `options`. `source_group_name` below stays whatever free text the
  // caller passed (a display label only); `submitted_by_class_name` is a
  // fresh read of the submitting student's own `profiles.class_name`,
  // looked up here rather than trusted from any caller-supplied value, so
  // it can never be spoofed by tampering with a client-side call. Stays
  // null when there's no `submittedBy` at all — the known, documented case
  // being the WhatsApp bot webhook, which has no authenticated student
  // session to derive a class from (see CLAUDE.md's §Admin Dashboard
  // section list / the schema migration note for the full reasoning).
  let submittedByClassName: string | null = null;
  if (options.submittedBy) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("class_name")
      .eq("id", options.submittedBy)
      .maybeSingle();
    submittedByClassName = (profile?.class_name as string | null) ?? null;
  }

  // 1. Store the raw message immutably (ai-contracts.md Contract 2: ready -> processing)
  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      raw_text: trimmed,
      source_type: options.sourceType ?? "paste",
      source_group_name: options.sourceGroupName ?? null,
      submitted_by_class_name: submittedByClassName,
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
  const announcements: IngestedAnnouncementSummary[] = [];
  for (const item of extracted) {
    const row = toAnnouncementRow(item, trimmed);

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
    announcements.push({
      id: announcement.id as string,
      category: row.category,
      title: row.title,
      confidence: row.confidence,
    });

    // Rule 5 (docs/data-model.md §5): free-slot matching runs at creation
    // time in both directions - a cancellation opens slots across every
    // matching student's timetable, and an event/opportunity gets checked
    // against slots that are already open from an earlier cancellation.
    if (row.category === "cancellation") {
      await syncFreeSlotsForCancellation(supabase, announcement.id as string);
    } else if (row.category === "event" || row.category === "opportunity") {
      await matchAnnouncementToOpenFreeSlots(supabase, announcement.id as string);
    }
  }

  return {
    messageId: message.id as string,
    announcementIds,
    extractedCount: extracted.length,
    announcements,
  };
}
