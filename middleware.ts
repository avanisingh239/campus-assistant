import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

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
