import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server Component / Server Action / Route Handler Supabase client, bound to
 * the current request's auth cookies. Still uses the anon key — RLS applies
 * as the signed-in user. Use this for anything that should respect a
 * student's or admin's own permissions (reading their profile, their
 * timetable, etc).
 *
 * Server Components can't set cookies, so the `setAll` call below is
 * wrapped in a try/catch — that's expected there and harmless as long as
 * `middleware.ts` (at the repo root) is refreshing the session cookie on
 * every request; that logic is inlined directly in `middleware.ts` itself,
 * not a separate module, so it can't be broken by import resolution in
 * Vercel's middleware bundling.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — middleware.ts refreshes the
            // session cookie on the request/response cycle instead.
          }
        },
      },
    },
  );
}
