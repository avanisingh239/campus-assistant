import { type NextRequest } from "next/server";
// Relative import, not the "@/*" alias, on purpose — Next.js bundles
// middleware.ts separately from normal pages/routes, in a more
// restrictive runtime that doesn't resolve tsconfig's path aliases; on
// Vercel this alias resolved fine at build time but crashed at request
// time with `ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'`, since
// the alias was never rewritten to a real path in the deployed bundle.
// Every other file in this repo can keep using "@/..." — this is
// specific to middleware.ts's own import chain.
import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
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
