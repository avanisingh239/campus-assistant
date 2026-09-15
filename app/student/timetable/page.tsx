import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TimetableScreen } from "./timetable-screen";

// Same reasoning as the other real student screens: per-student, RLS-scoped
// fetch, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Server Component for /student/timetable (docs/product-spec.md Area A.2
 * / Feature 1.4) — one route, internal client-side state (empty/setup,
 * manual-entry form, weekly view), matching the consolidation approach
 * already used for /login. Fetches the signed-in student's own
 * `timetable_entries` through the RLS-respecting client — students own
 * this table directly per supabase/schema.sql's "student manages own
 * timetable" policy, so a plain `select` is enough; no admin client
 * needed here (that's only for the `clashes` resync step inside
 * lib/timetable/actions.ts, not for reading the table itself).
 *
 * Also fetches `clashes` and `free_slots` (both readable by the student
 * directly — "student reads own clashes"/"student reads own free slots"
 * in supabase/schema.sql, same RLS client, no admin client needed here
 * either) so the weekly grid can actually show what's already being
 * computed server-side. `clashes` is filtered to rows with a
 * `timetable_entry_id` — `event_vs_event` clashes never have one (they're
 * announcement-vs-announcement, nothing on this grid to attach a badge
 * to) and are irrelevant here.
 *
 * Announcement titles for whatever `clashes.announcement_id`/
 * `free_slots.matched_announcement_id` point at are fetched in one more
 * flat query, same "flat queries joined in JS" pattern as everywhere
 * else — see lib/timetable/entry-status.ts for the actual join.
 */
export default async function StudentTimetablePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already guarantees an authenticated student reaches this
  // route — this is a defensive fallback, not the real auth gate.
  if (!user) {
    redirect("/login");
  }

  const [entriesResult, clashesResult, freeSlotsResult] = await Promise.all([
    supabase
      .from("timetable_entries")
      .select("id, student_id, day_of_week, start_time, end_time, course_name, section, teacher_name, teacher_name_confirmed")
      .eq("student_id", user.id),
    supabase
      .from("clashes")
      .select("timetable_entry_id, announcement_id, severity")
      .eq("student_id", user.id)
      .not("timetable_entry_id", "is", null),
    supabase
      .from("free_slots")
      .select("timetable_entry_id, matched_announcement_id")
      .eq("student_id", user.id),
  ]);

  if (entriesResult.error) {
    throw new Error(`Failed to load timetable: ${entriesResult.error.message}`);
  }
  if (clashesResult.error) {
    throw new Error(`Failed to load clashes: ${clashesResult.error.message}`);
  }
  if (freeSlotsResult.error) {
    throw new Error(`Failed to load free slots: ${freeSlotsResult.error.message}`);
  }

  const clashes = clashesResult.data ?? [];
  const freeSlots = freeSlotsResult.data ?? [];

  const announcementIds = [
    ...new Set(
      [
        ...clashes.map((c) => c.announcement_id),
        ...freeSlots.map((s) => s.matched_announcement_id),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const { data: announcementRows, error: announcementsError } =
    announcementIds.length > 0
      ? await supabase.from("announcements").select("id, title").in("id", announcementIds)
      : { data: [], error: null };

  if (announcementsError) {
    throw new Error(`Failed to load clash/free-slot announcement titles: ${announcementsError.message}`);
  }

  return (
    <TimetableScreen
      initialEntries={entriesResult.data ?? []}
      clashes={clashes}
      freeSlots={freeSlots}
      announcementTitles={announcementRows ?? []}
    />
  );
}
