import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALWAYS_SHARED_CATEGORIES, DEDUP_LOOKBACK_DAYS, findDuplicateMatch } from "./match";
import { detectFieldContradictions } from "./contradictions";
import type { ConflictingValueEntry, FieldValues } from "./contradictions";
import type { DedupCandidate, DedupFields } from "./types";

/**
 * DB-fetching/writing wrapper around the pure functions in match.ts and
 * contradictions.ts — same shape as lib/deterministic/sync.ts relative to
 * clashes.ts/free-slots.ts. Always called with the service-role client
 * (lib/supabase/admin.ts), same as the rest of the ingestion pipeline —
 * `announcements`/`announcement_sources`/`contradictions` have no
 * INSERT/UPDATE policy for `authenticated` at all (see docs/data-model.md
 * §4).
 */

export interface DedupResult {
  merged: boolean;
  /** The existing announcement's id this message was merged into, or `null` when nothing matched. */
  announcementId: string | null;
}

interface CandidateRow {
  id: string;
  category: string;
  title: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  deadline_at: string | null;
  linked_class_name: string | null;
  seat_count: number | null;
  title_embedding: number[] | null;
}

/**
 * For every candidate announcement in a class-scoped category, resolves
 * the class its EARLIEST source came from — the value a field like
 * `event_date` currently holds was set by that first source (fields are
 * never overwritten after creation, see contradictions.ts), so that
 * source's class is the announcement's real class for the privacy check in
 * match.ts's `findDuplicateMatch`. Flat queries joined in JS (this
 * codebase's established pattern — no PostgREST embeds anywhere): one
 * query for the link rows, one for the messages they point at.
 */
async function resolveEarliestSubmittingClasses(
  supabase: SupabaseClient,
  candidateIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (candidateIds.length === 0) return result;

  const { data: sourceLinks, error: linksError } = await supabase
    .from("announcement_sources")
    .select("announcement_id, message_id, created_at")
    .in("announcement_id", candidateIds);
  if (linksError) throw new Error(`Failed to load candidate sources: ${linksError.message}`);

  const messageIds = [...new Set((sourceLinks ?? []).map((s) => s.message_id as string))];
  const { data: messageRows, error: messagesError } =
    messageIds.length > 0
      ? await supabase.from("messages").select("id, submitted_by_class_name").in("id", messageIds)
      : { data: [], error: null };
  if (messagesError) throw new Error(`Failed to load candidate source messages: ${messagesError.message}`);

  const classByMessageId = new Map(
    (messageRows ?? []).map((m) => [m.id as string, m.submitted_by_class_name as string | null]),
  );

  const earliestCreatedAt = new Map<string, string>();
  for (const link of sourceLinks ?? []) {
    const announcementId = link.announcement_id as string;
    const createdAt = link.created_at as string;
    const current = earliestCreatedAt.get(announcementId);
    if (!current || createdAt < current) {
      earliestCreatedAt.set(announcementId, createdAt);
      result.set(announcementId, classByMessageId.get(link.message_id as string) ?? null);
    }
  }

  return result;
}

/**
 * Given a message's earliest-linked source, returns that source's
 * `message_id` — used to attribute the "existing" side of a contradiction
 * to the message that actually set the stored value, rather than the
 * announcement itself (which has no message reference of its own).
 */
async function findEarliestSourceMessageId(
  supabase: SupabaseClient,
  announcementId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("announcement_sources")
    .select("message_id, created_at")
    .eq("announcement_id", announcementId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Failed to load existing source: ${error.message}`);
  return (data?.[0]?.message_id as string | undefined) ?? null;
}

/**
 * Creates a new `contradictions` row for (announcementId, field), or —
 * if an unresolved one already exists for that exact field (a third
 * source disagreeing too) — appends the new value to it, rather than
 * creating a second row for the same field. Never updates/removes an
 * existing entry: this only ever adds, matching "never silently pick a
 * side."
 */
async function recordContradiction(
  supabase: SupabaseClient,
  announcementId: string,
  fieldName: string,
  existingValue: string,
  existingSourceMessageId: string | null,
  newValue: string,
  newSourceMessageId: string,
): Promise<void> {
  const { data: existingRow, error: fetchError } = await supabase
    .from("contradictions")
    .select("id, conflicting_values")
    .eq("announcement_id", announcementId)
    .eq("field_name", fieldName)
    .eq("resolved", false)
    .maybeSingle();
  if (fetchError) throw new Error(`Failed to check existing contradictions: ${fetchError.message}`);

  if (existingRow) {
    const updatedValues: ConflictingValueEntry[] = [
      ...((existingRow.conflicting_values as ConflictingValueEntry[]) ?? []),
      { value: newValue, source_message_id: newSourceMessageId },
    ];
    const { error: updateError } = await supabase
      .from("contradictions")
      .update({ conflicting_values: updatedValues })
      .eq("id", existingRow.id);
    if (updateError) throw new Error(`Failed to update contradiction: ${updateError.message}`);
    return;
  }

  const conflictingValues: ConflictingValueEntry[] = [
    { value: existingValue, source_message_id: existingSourceMessageId ?? undefined },
    { value: newValue, source_message_id: newSourceMessageId },
  ];
  const { error: insertError } = await supabase.from("contradictions").insert({
    announcement_id: announcementId,
    field_name: fieldName,
    conflicting_values: conflictingValues,
  });
  if (insertError) throw new Error(`Failed to create contradiction: ${insertError.message}`);
}

/**
 * The real entry point: called from lib/ingestion/ingest.ts for every
 * extracted item, BEFORE it would otherwise be inserted as a new
 * `announcements` row. Looks for a likely duplicate among same-category
 * announcements created within `DEDUP_LOOKBACK_DAYS`; if found, links the
 * new message to it (never creates a second `announcements` row) and
 * records any field-level contradictions, returning `{ merged: true,
 * announcementId }`. Returns `{ merged: false, announcementId: null }`
 * when nothing matched, in which case the caller proceeds to insert a new
 * announcement exactly as before this pass.
 *
 * `newMessageId`/`newExtractedFields` are used for the `announcement_sources`
 * insert's `message_id`/`extracted_fields` — the same two values the
 * non-merge path already writes, so a merged source looks identical to a
 * fresh one from the trace-to-source drawer's point of view.
 */
export async function findAndMergeDuplicate(
  supabase: SupabaseClient,
  newItem: DedupFields,
  newMessageId: string,
  newExtractedFields: unknown,
  submittedByClassName: string | null,
): Promise<DedupResult> {
  const sinceIso = new Date(Date.now() - DEDUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rawCandidates, error: candidatesError } = await supabase
    .from("announcements")
    .select(
      "id, category, title, event_date, start_time, end_time, deadline_at, linked_class_name, seat_count, title_embedding",
    )
    .eq("category", newItem.category)
    .gte("created_at", sinceIso);
  if (candidatesError) {
    throw new Error(`Failed to load dedup candidates: ${candidatesError.message}`);
  }

  const candidateRows = (rawCandidates ?? []) as CandidateRow[];

  // The class-resolving join is only meaningful (and only run) for
  // categories where merging across classes would actually be a problem —
  // see ALWAYS_SHARED_CATEGORIES's own doc comment.
  const classById = ALWAYS_SHARED_CATEGORIES.has(newItem.category)
    ? new Map<string, string | null>()
    : await resolveEarliestSubmittingClasses(
        supabase,
        candidateRows.map((c) => c.id),
      );

  const candidates: DedupCandidate[] = candidateRows.map((c) => ({
    ...c,
    category: c.category as DedupFields["category"],
    submittedByClassName: classById.get(c.id) ?? null,
  }));

  const match = findDuplicateMatch(newItem, submittedByClassName, candidates);
  if (!match) {
    return { merged: false, announcementId: null };
  }

  const { error: sourceInsertError } = await supabase.from("announcement_sources").insert({
    announcement_id: match.id,
    message_id: newMessageId,
    extracted_fields: newExtractedFields,
  });
  if (sourceInsertError) {
    throw new Error(`Failed to link duplicate source: ${sourceInsertError.message}`);
  }

  const existingFields: FieldValues = {
    event_date: match.event_date,
    start_time: match.start_time,
    end_time: match.end_time,
    deadline_at: match.deadline_at,
    seat_count: match.seat_count,
  };
  const incomingFields: FieldValues = {
    event_date: newItem.event_date,
    start_time: newItem.start_time,
    end_time: newItem.end_time,
    deadline_at: newItem.deadline_at,
    seat_count: newItem.seat_count,
  };
  const fieldContradictions = detectFieldContradictions(existingFields, incomingFields);

  if (fieldContradictions.length > 0) {
    const existingSourceMessageId = await findEarliestSourceMessageId(supabase, match.id);
    for (const contradiction of fieldContradictions) {
      await recordContradiction(
        supabase,
        match.id,
        contradiction.field_name,
        contradiction.existingValue,
        existingSourceMessageId,
        contradiction.newValue,
        newMessageId,
      );
    }
  }

  return { merged: true, announcementId: match.id };
}
