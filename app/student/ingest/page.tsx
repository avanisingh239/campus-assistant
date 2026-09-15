import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IngestScreen } from "./ingest-screen";

// Same reasoning as the other real student screens: per-student session
// check, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Server Component for /student/ingest (docs/product-spec.md Area A.4's
 * Message Ingestion Drawer, promoted to its own tab/route the same way
 * "Don't Miss This" was — see CLAUDE.md's §"Don't Miss This" for the same
 * drawer-to-tab supersession). This is the real, authenticated, polished
 * replacement for app/(dev)/ingest-test, which has been deleted (see
 * CLAUDE.md's §Ingestion page).
 *
 * The only thing this Server Component does is confirm a signed-in student
 * session exists and hand the student's id down — `submitted_by` on the
 * `messages` row it creates. The actual extract -> validate -> write
 * pipeline is unchanged from app/(dev)/ingest-test: still
 * lib/ingestion/ingest.ts's `ingestRawText`, still writing through the
 * service-role client (see that file's own doc comment for why), called
 * directly from the Client Component below exactly like
 * lib/timetable/actions.ts's Server Actions already are from
 * timetable-screen.tsx.
 */
export default async function StudentIngestPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already guarantees an authenticated student reaches this
  // route — this is a defensive fallback, not the real auth gate.
  if (!user) {
    redirect("/login");
  }

  return <IngestScreen studentId={user.id} now={new Date()} />;
}
