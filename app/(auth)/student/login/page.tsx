import { LoginForm } from "../../login-form";

// Never statically prerendered: it constructs a Supabase browser client on
// render, which needs NEXT_PUBLIC_SUPABASE_URL/ANON_KEY present — fine at
// request time in any real deployment, but there's nothing useful to
// prerender for a sign-in form anyway.
export const dynamic = "force-dynamic";

export default function StudentLoginPage() {
  return <LoginForm heading="Student Portal" redirectTo="/student/dashboard" />;
}
