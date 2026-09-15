"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAccessResult = { ok: true } | { ok: false; reason: string };

/**
 * Post-login authorization check for the admin flow (docs/product-spec.md:
 * "admin scope is assigned, never self-selected"). Called right after
 * supabase.auth.signInWithPassword() succeeds on the admin form — a
 * successful sign-in only proves the credentials are valid, not that this
 * account is actually an admin with a scope, so this Server Action re-checks
 * both before the caller redirects to /admin/dashboard.
 *
 * admin_scopes has RLS enabled but no policy defined yet (see
 * supabase/schema.sql) — the RLS-respecting client would always get an
 * empty result for it, so that lookup specifically goes through the
 * service-role client. The profiles.role check above it uses the RLS
 * client since "read own profile" is already a real policy.
 */
export async function checkAdminAccess(): Promise<AdminAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, reason: "You're not signed in." };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "admin") {
    return { ok: false, reason: "This account doesn't have admin access." };
  }

  const adminClient = createAdminClient();
  const { data: scope } = await adminClient
    .from("admin_scopes")
    .select("id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!scope) {
    return { ok: false, reason: "This admin account has no assigned scope yet." };
  }

  return { ok: true };
}
