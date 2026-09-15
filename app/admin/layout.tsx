import Link from "next/link";
import { SignOutButton } from "../sign-out-button";

// Scoped Admin Shell (docs/architecture.md §2). The Verified Scope Header
// (docs/product-spec.md Area B.1) is rendered inside /admin/dashboard
// itself, not here — see that page's own scope badge.
//
// Just "Dashboard" in the nav: /admin/submit/class, /admin/submit/society,
// and /admin/history used to be separate links here, but their real
// functionality was folded into /admin/dashboard when it was built (one
// scope-adaptive page, not four routes — see CLAUDE.md's §Admin Dashboard).
// The three placeholder routes and their dead nav links were removed
// outright once that made them pure dead ends with nothing left pointing
// at them — same one-real-page pattern every other persona in this app
// already uses (/login, /student/timetable, /student/ingest).
//
// force-dynamic: see the matching comment in app/student/layout.tsx.
export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/admin/dashboard">Dashboard</Link>
        </nav>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
