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

  const { data: entries, error } = await supabase
    .from("timetable_entries")
    .select("id, student_id, day_of_week, start_time, end_time, course_name, section, teacher_name, teacher_name_confirmed")
    .eq("student_id", user.id);

  if (error) {
    throw new Error(`Failed to load timetable: ${error.message}`);
  }

  return <TimetableScreen initialEntries={entries ?? []} />;
}
