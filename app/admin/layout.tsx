import Link from "next/link";
import { SignOutButton } from "../sign-out-button";

// Scoped Admin Shell (docs/architecture.md §2). The Verified Scope Header
// (docs/product-spec.md Area B.1) needs admin_scopes read server-side —
// not wired up in this pass (see docs/data-model.md §3.2: admin_scopes has
// RLS enabled but no policy yet, so it's service-role-only for now).
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
          <Link href="/admin/submit/class">Submit Class Update</Link>
          <Link href="/admin/submit/society">Submit Society Event</Link>
          <Link href="/admin/history">History</Link>
        </nav>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
