import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely — this is intentional
 * and necessary: `messages`, `announcement_sources`, `contradictions`,
 * `clashes`, and `free_slots` either have no INSERT policy or a role-gated
 * one (see docs/data-model.md §4), so the ingestion pipeline and the
 * (not-yet-built) deterministic engine both need to write through this
 * client rather than the per-request anon client.
 *
 * `import "server-only"` makes any accidental client-component import of
 * this module fail the build instead of shipping the service-role key to
 * the browser. Never import this from a Client Component or anything under
 * app/**\/page.tsx that doesn't start with "use server" / live in a Route
 * Handler or Server Action.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase project's values.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
