"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractAnnouncements, ExtractionError } from "@/lib/ai/extract";
import { embedTitle } from "@/lib/ai/embed";
import {
  syncFreeSlotsForCancellation,
  matchAnnouncementToOpenFreeSlots,
} from "@/lib/deterministic/sync";
import { findAndMergeDuplicate } from "@/lib/deduplication/sync";
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
 * Deduplication ("Confirmed by N sources") now runs here — see
 * lib/deduplication/sync.ts's `findAndMergeDuplicate`, called per extracted
 * item right below, before deciding whether to insert a new `announcements`
 * row at all. `urgency_score`/`consequence_weight`/`priority_score` are
 * still not written from here — see lib/dashboard/priority.ts, which
 * computes those live at render time instead.
 *
 * Free-slot matching (lib/deterministic/sync.ts) runs right after each
 * announcement is inserted — see the per-item loop below — but ONLY when
 * that item was genuinely newly-created, not merged into an existing
 * announcement (see the loop's own comment for why a merge must skip this).
 * Clash detection deliberately does NOT run from here: a brand-new
 * announcement has no student_announcement_status rows yet, so it can't
 * possibly produce a class_vs_event/event_vs_event clash the moment it's
 * created (both are gated on interested/registered). Clash detection's
 * real trigger points are lib/timetable/actions.ts and
 * lib/engagement/actions.ts.
 *
 * Also resolves `messages.submitted_by_class_name` — the announcements RLS
 * policy's real matching key (supabase/schema.sql) — from a fresh
 * `profiles.class_name` lookup keyed off `options.submittedBy`, never from
 * a caller-supplied value. See the lookup right below for why this can't
 * be spoofed the way a plain option could, and supabase/schema.sql's
 * "class-scoping / display-label split" migration note for the bug this
 * replaced (`source_group_name`, a free-text display label, was never the
 * same shape of data as `profiles.class_name` and was being used to gate
 * visibility anyway). This same resolved value is now also
 * `findAndMergeDuplicate`'s privacy guard — the reason dedup has to know
 * which class a message came from at all.
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

  // 3. One announcement + one announcement_sources link per extracted item —
  //    unless it's a likely duplicate of an already-existing announcement
  //    (lib/deduplication/sync.ts), in which case the new message is
  //    linked to that existing row instead of creating a second one.
  const announcementIds: string[] = [];
  const announcements: IngestedAnnouncementSummary[] = [];
  for (const item of extracted) {
    // Real ML upgrade to dedup's title-matching (see lib/deduplication/
    // match.ts's own doc comment for the full reasoning): one embedding
    // call per extracted item, computed BEFORE the dedup check since that
    // check needs it — never re-embedding an existing candidate, which
    // already has its own `title_embedding` stored from when IT was
    // created. `embedTitle` (lib/ai/embed.ts) never throws — a failed/
    // rate-limited call logs and resolves to `null`, which the dedup
    // matcher already treats as "fall back to the exact linked_class_name
    // path only for this item," never as a reason to fail the whole
    // ingestion.
    const titleEmbedding = await embedTitle(item.title);
    const row = { ...toAnnouncementRow(item, trimmed), title_embedding: titleEmbedding };

    const dedupResult = await findAndMergeDuplicate(
      supabase,
      row,
      message.id as string,
      item,
      submittedByClassName,
    );

    let announcementId: string;
    if (dedupResult.merged && dedupResult.announcementId) {
      announcementId = dedupResult.announcementId;
    } else {
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

      announcementId = announcement.id as string;
    }

    announcementIds.push(announcementId);
    announcements.push({
      id: announcementId,
      category: row.category,
      title: row.title,
      confidence: row.confidence,
    });

    // Rule 5 (docs/data-model.md §5): free-slot matching runs at creation
    // time in both directions - a cancellation opens slots across every
    // matching student's timetable, and an event/opportunity gets checked
    // against slots that are already open from an earlier cancellation.
    // Deliberately skipped on a merge: this announcement was already
    // processed through this exact step once, when it was first created —
    // syncFreeSlotsForCancellation has no duplicate-insert guard (unlike
    // lib/timetable/actions.ts's callers), so re-running it here for a
    // merged cancellation would insert a second free_slots row for every
    // timetable entry it already matched the first time.
    if (dedupResult.merged) continue;

    if (row.category === "cancellation") {
      await syncFreeSlotsForCancellation(supabase, announcementId);
    } else if (row.category === "event" || row.category === "opportunity") {
      await matchAnnouncementToOpenFreeSlots(supabase, announcementId);
    }
  }

  // Real bug found in testing: submitting a message here and then
  // navigating to the dashboard (or Don't Miss This, or the timetable, if
  // a cancellation matched an existing entry) could keep showing stale
  // data until a manual hard refresh. All three of those pages are
  // force-dynamic (always re-fetch on the server), but that alone doesn't
  // invalidate the Router Cache Next.js keeps client-side for routes
  // already visited this session — a soft `<Link>` navigation back to one
  // of them (e.g. result-panel.tsx's "View on your dashboard") could still
  // be served the last cached RSC payload from before this mutation. A
  // brand-new announcement can affect any of the three (the dashboard
  // always; Don't Miss This if it's an opportunity/seat-limited event; the
  // timetable if a cancellation here just matched an existing entry via
  // syncFreeSlotsForCancellation above), so all three are revalidated
  // unconditionally rather than trying to predict which one a given batch
  // touched. Called once per extracted item in a batch — revalidatePath is
  // idempotent, so the repetition is harmless.
  revalidatePath("/student/dashboard");
  revalidatePath("/student/dont-miss-this");
  revalidatePath("/student/timetable");

  return {
    messageId: message.id as string,
    announcementIds,
    extractedCount: extracted.length,
    announcements,
  };
}
