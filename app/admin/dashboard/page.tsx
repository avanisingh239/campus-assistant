import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardScreen, type AdminScopeInfo } from "./admin-dashboard-screen";
import type { AdminSubmissionSummary } from "@/lib/admin/actions";

// Same reasoning as the other real per-user screens: RLS-scoped fetch,
// never statically cached.
export const dynamic = "force-dynamic";

/**
 * Real /admin/dashboard (docs/product-spec.md Area B.1) — one route that
 * adapts to the signed-in admin's own `admin_scopes` row, matching the
 * consolidation pattern already used for /login, /student/timetable, and
 * /student/ingest instead of building /admin/submit/class,
 * /admin/submit/society, and /admin/history as separate routes. Those
 * three started out as untouched placeholders once this page absorbed
 * their functionality, and were later deleted outright (along with their
 * admin-nav links) once that made them pure dead ends — see CLAUDE.md's
 * §Admin Dashboard.
 *
 * Reads `admin_scopes` through the RLS-respecting client now that
 * "admin reads own scope" exists (supabase/schema.sql) — this table had
 * RLS enabled with no policy at all until this pass, so this is the first
 * page able to read it without the service-role client. `societies` has
 * no RLS enabled at all (see supabase/schema.sql's RLS block — it's
 * absent from the `alter table ... enable row level security` list), so
 * looking up a society scope's name needs no special client either.
 *
 * Submission history: flat queries joined in JS (this codebase's usual
 * pattern) — `messages` where `submitted_by = auth.uid()` and
 * `source_type = 'admin_form'`, then `announcement_sources`/`announcements`
 * for the ones that produced a row, matched back up by `message_id`.
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already guarantees an authenticated admin reaches this
  // route — this is a defensive fallback, not the real auth gate.
  if (!user) {
    redirect("/login");
  }

  const { data: scopeRow } = await supabase
    .from("admin_scopes")
    .select("scope_type, class_name, society_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  let societyName: string | null = null;
  if (scopeRow?.scope_type === "society" && scopeRow.society_id) {
    const { data: society } = await supabase
      .from("societies")
      .select("name")
      .eq("id", scopeRow.society_id)
      .maybeSingle();
    societyName = (society?.name as string | undefined) ?? null;
  }

  const scope: AdminScopeInfo | null = scopeRow
    ? {
        scopeType: scopeRow.scope_type as "class" | "society",
        className: (scopeRow.class_name as string | null) ?? null,
        societyName,
      }
    : null;

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, created_at")
    .eq("submitted_by", user.id)
    .eq("source_type", "admin_form")
    .order("created_at", { ascending: false });

  if (messagesError) {
    throw new Error(`Failed to load submission history: ${messagesError.message}`);
  }

  const messageIds = (messages ?? []).map((m) => m.id as string);

  const { data: sources, error: sourcesError } =
    messageIds.length > 0
      ? await supabase
          .from("announcement_sources")
          .select("message_id, announcement_id")
          .in("message_id", messageIds)
      : { data: [] as { message_id: string; announcement_id: string }[], error: null };
  if (sourcesError) {
    throw new Error(`Failed to load submission sources: ${sourcesError.message}`);
  }

  const announcementIds = [...new Set((sources ?? []).map((s) => s.announcement_id as string))];

  const { data: announcements, error: announcementsError } =
    announcementIds.length > 0
      ? await supabase
          .from("announcements")
          .select("id, title, category, event_date, created_at")
          .in("id", announcementIds)
      : { data: [] as AdminSubmissionSummary[], error: null };
  if (announcementsError) {
    throw new Error(`Failed to load submitted announcements: ${announcementsError.message}`);
  }

  const announcementById = new Map(
    (announcements ?? []).map((a) => [a.id as string, a as AdminSubmissionSummary]),
  );
  const announcementIdByMessageId = new Map(
    (sources ?? []).map((s) => [s.message_id as string, s.announcement_id as string]),
  );

  const history: AdminSubmissionSummary[] = (messages ?? [])
    .map((m) => {
      const announcementId = announcementIdByMessageId.get(m.id as string);
      return announcementId ? announcementById.get(announcementId) : undefined;
    })
    .filter((a): a is AdminSubmissionSummary => a !== undefined);

  return <AdminDashboardScreen scope={scope} initialHistory={history} />;
}
