"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncClashesForStudent } from "@/lib/deterministic/sync";
import type { EngagementStatus } from "@/lib/deterministic/types";

/**
 * Sets a student's interest/registration status on an announcement — the
 * Interested / Registered / Not Interested toggles (docs/product-spec.md
 * Area A.1 "Engagement Toggles"). No card UI calls this yet (see
 * CLAUDE.md), but clash detection needs a real trigger point for "a
 * student's engagement status changes," and none existed until now: a
 * future card component should call this directly.
 *
 * Writes through the RLS-respecting client — students own
 * `student_announcement_status` directly per supabase/schema.sql's
 * "student manages own status" policy — then resyncs clashes through the
 * service-role client, same reasoning as lib/timetable/actions.ts.
 */
export async function setAnnouncementStatus(
  announcementId: string,
  status: EngagementStatus,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase.from("student_announcement_status").upsert(
    { student_id: user.id, announcement_id: announcementId, status },
    { onConflict: "student_id,announcement_id" },
  );

  if (error) throw new Error(`Failed to update engagement status: ${error.message}`);

  // Interest/registration status gates class_vs_event and event_vs_event
  // clashes (rules 2 & 3, docs/data-model.md §5) — any change here can
  // create or remove a clash, in either direction, so always resync.
  await syncClashesForStudent(createAdminClient(), user.id);
}
