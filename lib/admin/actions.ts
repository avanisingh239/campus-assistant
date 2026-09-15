"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  syncFreeSlotsForCancellation,
  matchAnnouncementToOpenFreeSlots,
} from "@/lib/deterministic/sync";
import { classUpdateSchema, societyUpdateSchema, type ClassUpdateFormInput, type SocietyUpdateFormInput } from "./validation";
import { buildClassUpdateDraft, buildSocietyUpdateDraft } from "./build-submission";

/**
 * Server Actions backing /admin/dashboard's two structured forms. Per
 * CLAUDE.md's §Admin Dashboard "Submission logic" section, this is
 * structured input from a verified, scoped admin — it deliberately does
 * NOT go through lib/ai/extract.ts's Gemini pipeline the way a student's
 * pasted text does. Instead each action builds the `messages`/
 * `announcements`/`announcement_sources` rows directly (mirroring the
 * shape of lib/ingestion/ingest.ts's own insert sequence, including its
 * free-slot-matching calls) and writes them through the service-role
 * client, same as ingest.ts — `messages` and `announcement_sources` have
 * no INSERT policy for `authenticated` at all (see docs/data-model.md §4),
 * so there's no RLS-client path available for those two regardless of the
 * "admins insert within scope" policy on `announcements` (whose own
 * comment in supabase/schema.sql notes its scope-check is only partial —
 * enforced at the app level, which is exactly what the admin_scopes lookup
 * below does).
 *
 * The admin's own `class_name`/`society_id` is always looked up server-side
 * from `admin_scopes` keyed by the signed-in user's id — never trusted from
 * the client — so an admin can only ever submit within their own assigned
 * scope, per the doc's scoping rule.
 */

export interface AdminSubmissionSummary {
  id: string;
  title: string;
  category: string;
  event_date: string | null;
  created_at: string;
}

async function requireAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export async function submitClassUpdate(
  input: ClassUpdateFormInput,
): Promise<AdminSubmissionSummary> {
  const adminId = await requireAdminId();
  const admin = createAdminClient();

  const { data: scope } = await admin
    .from("admin_scopes")
    .select("scope_type, class_name")
    .eq("profile_id", adminId)
    .maybeSingle();

  if (!scope || scope.scope_type !== "class" || !scope.class_name) {
    throw new Error("You don't have a class scope assigned — can't submit a class update.");
  }

  // Re-validate server-side (defense in depth — the client already
  // validated with the same schema before calling this action).
  const parsed = classUpdateSchema.parse(input);
  const draft = buildClassUpdateDraft(parsed, scope.class_name as string);

  const { data: message, error: messageError } = await admin
    .from("messages")
    .insert({
      raw_text: draft.raw_text,
      source_type: "admin_form",
      source_group_name: scope.class_name,
      // The announcements SELECT policy's class-match branch keys off this
      // column, not source_group_name (see supabase/schema.sql's
      // "class-scoping / display-label split" migration note) — a
      // `cancellation` (this flow's category) is class-scoped, not one of
      // the four cross-class categories, so without this a CR's own
      // submission would silently become invisible to their own class,
      // same failure mode the migration exists to fix. scope.class_name is
      // already a verified admin_scopes lookup above, not client input.
      submitted_by_class_name: scope.class_name,
      submitted_by: adminId,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    throw new Error(`Failed to store submission: ${messageError?.message}`);
  }

  const { data: announcement, error: announcementError } = await admin
    .from("announcements")
    .insert({
      category: "cancellation",
      title: draft.title,
      why_it_matters: null,
      what_to_do_next: null,
      confidence: "clear",
      confidence_note: null,
      event_date: draft.event_date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      deadline_at: null,
      linked_class_name: draft.linked_class_name,
      match_confidence: 1,
      seat_count: null,
      seats_unclear: false,
      link_url: null,
      link_verified: true,
    })
    .select("id, title, category, event_date, created_at")
    .single();
  if (announcementError || !announcement) {
    throw new Error(`Failed to store announcement: ${announcementError?.message}`);
  }

  const { error: sourceError } = await admin.from("announcement_sources").insert({
    announcement_id: announcement.id,
    message_id: message.id,
    extracted_fields: parsed,
  });
  if (sourceError) {
    throw new Error(`Failed to link source: ${sourceError.message}`);
  }

  // Same trigger point lib/ingestion/ingest.ts uses for a `cancellation`
  // announcement — a CR's structured submission deserves the same
  // free-slot matching a pasted one gets.
  await syncFreeSlotsForCancellation(admin, announcement.id as string);

  return announcement as AdminSubmissionSummary;
}

export async function submitSocietyUpdate(
  input: SocietyUpdateFormInput,
): Promise<AdminSubmissionSummary> {
  const adminId = await requireAdminId();
  const admin = createAdminClient();

  const { data: scope } = await admin
    .from("admin_scopes")
    .select("scope_type, society_id")
    .eq("profile_id", adminId)
    .maybeSingle();

  if (!scope || scope.scope_type !== "society" || !scope.society_id) {
    throw new Error("You don't have a society scope assigned — can't submit an event update.");
  }

  const { data: society } = await admin
    .from("societies")
    .select("name")
    .eq("id", scope.society_id)
    .maybeSingle();
  if (!society) {
    throw new Error("Your assigned society could not be found.");
  }

  const parsed = societyUpdateSchema.parse(input);
  const draft = buildSocietyUpdateDraft(parsed, society.name as string);

  const { data: message, error: messageError } = await admin
    .from("messages")
    .insert({
      raw_text: draft.raw_text,
      source_type: "admin_form",
      source_group_name: society.name,
      submitted_by: adminId,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    throw new Error(`Failed to store submission: ${messageError?.message}`);
  }

  const { data: announcement, error: announcementError } = await admin
    .from("announcements")
    .insert({
      category: "event",
      title: draft.title,
      why_it_matters: null,
      what_to_do_next: null,
      confidence: "clear",
      confidence_note: null,
      event_date: draft.event_date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      deadline_at: draft.deadline_at,
      linked_class_name: null,
      match_confidence: null,
      seat_count: draft.seat_count,
      seats_unclear: false,
      link_url: draft.link_url,
      // A Tier-1 Verified Admin Submission (docs/requirements-traceability.md
      // Area C §2) — not untrusted pasted text, so lib/ingestion/verify-link.ts's
      // domain-allowlist check (built for spoofed links in forwarded messages)
      // doesn't apply here; an authenticated, manually-provisioned, scoped
      // admin typing their own registration link is the trust case that
      // check exists to approximate in the first place.
      link_verified: draft.link_url !== null,
    })
    .select("id, title, category, event_date, created_at")
    .single();
  if (announcementError || !announcement) {
    throw new Error(`Failed to store announcement: ${announcementError?.message}`);
  }

  const { error: sourceError } = await admin.from("announcement_sources").insert({
    announcement_id: announcement.id,
    message_id: message.id,
    extracted_fields: parsed,
  });
  if (sourceError) {
    throw new Error(`Failed to link source: ${sourceError.message}`);
  }

  // Same trigger point lib/ingestion/ingest.ts uses for a new `event`
  // announcement — checks it against any already-open free slot.
  await matchAnnouncementToOpenFreeSlots(admin, announcement.id as string);

  return announcement as AdminSubmissionSummary;
}
