"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Updates `last_seen.last_seen_at` to now for the current student — called
 * on explicit "Got it" dismissal of the diff banner, and only then.
 * Deliberately NOT called automatically on page load: doing so would make
 * the banner disappear before the student has actually read it (the task
 * itself: "don't update it immediately on page load ... that would make
 * the banner disappear before it's useful"). No delayed-auto-dismiss
 * timer either — explicit-dismiss-only is simpler and avoids the banner
 * vanishing out from under someone mid-read.
 *
 * Writes through the RLS-respecting client — students own `last_seen`
 * directly per supabase/schema.sql's "student manages own last_seen"
 * policy (`for all using (auth.uid() = student_id)`), so `upsert` covers
 * both a student's first-ever dismiss (insert) and every one after
 * (update) with the same call.
 */
export async function dismissDiffBanner(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("last_seen")
    .upsert({ student_id: user.id, last_seen_at: new Date().toISOString() }, { onConflict: "student_id" });

  if (error) throw new Error(`Failed to update last_seen: ${error.message}`);
}
