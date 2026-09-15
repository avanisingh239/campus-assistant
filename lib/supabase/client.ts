import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Uses the anon key, so every read/write it
 * makes is subject to RLS as the currently signed-in user — never wire this
 * client to `messages` inserts or anything else the RLS policies in
 * supabase/schema.sql don't grant to `authenticated`. See lib/supabase/admin.ts
 * for the service-role client the ingestion pipeline needs instead.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
