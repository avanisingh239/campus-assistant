import Link from "next/link";
import { SignOutButton } from "../sign-out-button";

// Student Shell: PWA nav + offline banner slot (docs/architecture.md §2).
// Deliberately bare — the real dashboard/timetable/communities UI is being
// designed separately and will replace these placeholder pages; this pass
// only needs the route skeleton and role-gated layout to exist.
//
// force-dynamic: everything under here is already gated by middleware.ts on
// live session state, and <SignOutButton> constructs a Supabase browser
// client during its server-render pass — static generation would try to do
// that at build time with no request/env context. Never statically cache
// an authenticated shell anyway.
export const dynamic = "force-dynamic";

export default function StudentLayout({
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
          <Link href="/student/dashboard">Dashboard</Link>
          <Link href="/student/timetable">Timetable</Link>
          <Link href="/student/communities">Communities</Link>
        </nav>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
