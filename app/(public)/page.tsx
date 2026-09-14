import Link from "next/link";

// Public landing & overview (docs/architecture.md §2 route tree).
export default function PublicLandingPage() {
  return (
    <main>
      <h1>Campus Assistant</h1>
      <p>What actually matters to me — a campus announcement assistant.</p>
      <p>
        <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
