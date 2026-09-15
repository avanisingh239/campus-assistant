import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and enforces the
 * student/admin route split described in docs/architecture.md §4.1:
 *   - unauthenticated visitors hitting a protected route are redirected to /login
 *   - students hitting /admin/* get HTTP 403
 *   - admins hitting /student/* get HTTP 403 (persona isolation cuts both ways —
 *     see product-spec.md's "Strict Persona Isolation" tenet)
 *
 * Inlined directly in this file, not imported from lib/supabase/middleware.ts
 * (which used to hold this logic and has been deleted — nothing else in the
 * app imported it). Two rounds of external imports inside middleware.ts each
 * failed in Vercel's production middleware bundling in a different way
 * (`@/*` alias unresolved, then a relative import missing its `.js`
 * extension) despite `next build && next start` locally showing no problem
 * either time — Vercel's middleware packaging isn't fully reproducible
 * locally. Inlining removes the whole category of risk: with no external
 * import left in this file's own module graph, there's nothing for that
 * bundling step to get wrong.
 */
export async function middleware(request: NextRequest) {
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

  // /login (app/(auth)/login) is the only auth entry point now — it lives
  // in the (auth) route group, so it doesn't share a URL prefix with
  // /student or /admin and needs no special-case exclusion here.
  const isStudentRoute = pathname.startsWith("/student");
  const isAdminRoute = pathname.startsWith("/admin");

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

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, manifest.json, sw.js (PWA/static assets)
     * - any file with an extension (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\..*).*)",
  ],
};
