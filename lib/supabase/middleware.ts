import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STUDENT_HOME = "/student/dashboard";
const ADMIN_HOME = "/admin/dashboard";

/**
 * Refreshes the Supabase auth session on every request and enforces the
 * student/admin route split described in docs/architecture.md §4.1:
 *   - unauthenticated visitors hitting a protected route are redirected to /login
 *   - students hitting /admin/* get HTTP 403
 *   - admins hitting /student/* get HTTP 403 (persona isolation cuts both ways —
 *     see product-spec.md's "Strict Persona Isolation" tenet)
 *
 * This must run in middleware.ts, not in each layout — Server Components
 * can't write cookies, so the token refresh below is what keeps the
 * session alive across requests. See lib/supabase/server.ts for why its
 * setAll() is a no-op try/catch.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: do not remove this call. It refreshes the auth token and
  // must run before any route-protection logic below.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // /student/login and /admin/login live under the (auth) route group
  // (app/(auth)/student/login, app/(auth)/admin/login) — they share the
  // /student and /admin URL prefix but must stay reachable while signed
  // out, so they're excluded from the protected-route checks below.
  const isLoginRoute = pathname === "/student/login" || pathname === "/admin/login";
  const isStudentRoute = pathname.startsWith("/student") && !isLoginRoute;
  const isAdminRoute = pathname.startsWith("/admin") && !isLoginRoute;

  if (!isStudentRoute && !isAdminRoute) {
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;

  if (isAdminRoute && role !== "admin") {
    return new NextResponse("Forbidden — admin access required.", {
      status: 403,
    });
  }

  if (isStudentRoute && role !== "student") {
    return new NextResponse("Forbidden — student access required.", {
      status: 403,
    });
  }

  return response;
}

export { STUDENT_HOME, ADMIN_HOME };
