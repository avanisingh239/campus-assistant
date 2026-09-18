import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AskScreen } from "./ask-screen";

// Same reasoning as every other real student screen: this route doesn't
// fetch any announcement data itself (askQuestion, the Server Action,
// does that per-question) but it's still per-student and never statically
// cached — see app/student/layout.tsx, which already forces this for
// everything under app/student/.
export const dynamic = "force-dynamic";

/**
 * Server Component for /student/ask ("Ask Rescript" — see CLAUDE.md's own
 * section for the full feature). Only job here is confirming a signed-in
 * student session exists, same pattern as /student/ingest's page.tsx — the
 * actual embed -> retrieve -> synthesize pipeline is lib/ask/actions.ts's
 * `askQuestion`, a Server Action called directly from the Client Component
 * below, not fetched here.
 */
export default async function StudentAskPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already guarantees an authenticated student reaches this
  // route — this is a defensive fallback, not the real auth gate.
  if (!user) {
    redirect("/login");
  }

  return <AskScreen now={new Date()} />;
}
