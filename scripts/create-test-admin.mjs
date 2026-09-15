// One-off script to provision a test admin account for local testing of
// /login's admin flow. Admin accounts are manually provisioned (see
// CLAUDE.md, supabase/schema.sql's handle_new_user()) — there's no signup
// UI for the admin role, so this exists instead of a dashboard click-through
// because it's fast and reproducible.
//
// Usage:
//   node --env-file=.env.local scripts/create-test-admin.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (same
// vars lib/supabase/admin.ts needs) to be set — see .env.example.

import { createClient } from "@supabase/supabase-js";

const TEST_ADMIN_EMAIL = "test-admin@rescript.dev";
const TEST_ADMIN_PASSWORD = "TestAdmin123!";
const TEST_ADMIN_CLASS = "CSE-2028-A";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run this with: node --env-file=.env.local scripts/create-test-admin.mjs",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// handle_new_user() (supabase/schema.sql) fires on any auth.users insert,
// admin.createUser() included, and reads role/full_name/class_name off
// raw_user_meta_data to create the matching profiles row itself.
const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email: TEST_ADMIN_EMAIL,
  password: TEST_ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: {
    role: "admin",
    full_name: "Test Admin",
    class_name: null,
  },
});

if (createError) {
  console.error(`Failed to create user: ${createError.message}`);
  if (createError.message.toLowerCase().includes("already")) {
    console.error(
      `A user with email ${TEST_ADMIN_EMAIL} may already exist — delete it in the Supabase ` +
        "dashboard (Authentication > Users) and re-run this script, or edit TEST_ADMIN_EMAIL above.",
    );
  }
  process.exit(1);
}

const profileId = created.user.id;

// admin_scopes has no INSERT policy for `authenticated` (RLS is enabled
// with no policy at all yet — see CLAUDE.md §Data model), so this also
// has to go through the service-role client.
const { error: scopeError } = await supabase.from("admin_scopes").insert({
  profile_id: profileId,
  scope_type: "class",
  class_name: TEST_ADMIN_CLASS,
});

if (scopeError) {
  console.error(`User created, but failed to create admin_scopes row: ${scopeError.message}`);
  process.exit(1);
}

console.log("Test admin account created:");
console.log(`  email:      ${TEST_ADMIN_EMAIL}`);
console.log(`  password:   ${TEST_ADMIN_PASSWORD}`);
console.log(`  scope:      class ${TEST_ADMIN_CLASS}`);
console.log(`  profile id: ${profileId}`);
