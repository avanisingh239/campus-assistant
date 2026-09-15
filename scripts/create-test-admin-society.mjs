// Companion to create-test-admin.mjs, for testing /admin/dashboard's other
// branch: a Society Coordinator scope. create-test-admin.mjs only ever
// creates a `scope_type: 'class'` admin — this script exists so testing
// the CR flow and the Society flow doesn't require hand-editing rows in
// the Supabase dashboard. Also seeds the `societies` row this admin's
// `admin_scopes.society_id` points at, since none exist yet in a fresh
// project.
//
// Usage:
//   node --env-file=.env.local scripts/create-test-admin-society.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (same
// vars lib/supabase/admin.ts needs) to be set — see .env.example.

import { createClient } from "@supabase/supabase-js";

const TEST_ADMIN_EMAIL = "test-admin-society@rescript.dev";
const TEST_ADMIN_PASSWORD = "TestAdmin123!";
const TEST_SOCIETY_NAME = "Robotics Club";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run this with: node --env-file=.env.local scripts/create-test-admin-society.mjs",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// societies.name is unique — reuse the existing row if this script has
// already been run once against this project, rather than erroring.
let societyId;
const { data: existingSociety } = await supabase
  .from("societies")
  .select("id")
  .eq("name", TEST_SOCIETY_NAME)
  .maybeSingle();

if (existingSociety) {
  societyId = existingSociety.id;
} else {
  const { data: createdSociety, error: societyError } = await supabase
    .from("societies")
    .insert({ name: TEST_SOCIETY_NAME })
    .select("id")
    .single();
  if (societyError) {
    console.error(`Failed to create society: ${societyError.message}`);
    process.exit(1);
  }
  societyId = createdSociety.id;
}

// handle_new_user() (supabase/schema.sql) fires on any auth.users insert,
// admin.createUser() included, and reads role/full_name/class_name off
// raw_user_meta_data to create the matching profiles row itself.
const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email: TEST_ADMIN_EMAIL,
  password: TEST_ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: {
    role: "admin",
    full_name: "Test Society Admin",
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
// with no write policy at all — see CLAUDE.md §Data model), so this also
// has to go through the service-role client.
const { error: scopeError } = await supabase.from("admin_scopes").insert({
  profile_id: profileId,
  scope_type: "society",
  society_id: societyId,
});

if (scopeError) {
  console.error(`User created, but failed to create admin_scopes row: ${scopeError.message}`);
  process.exit(1);
}

console.log("Test society admin account created:");
console.log(`  email:      ${TEST_ADMIN_EMAIL}`);
console.log(`  password:   ${TEST_ADMIN_PASSWORD}`);
console.log(`  scope:      society ${TEST_SOCIETY_NAME} (${societyId})`);
console.log(`  profile id: ${profileId}`);
