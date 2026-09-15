// "Don't Miss This" discovery feed placeholder (docs/product-spec.md Area
// A.1's "Don't Miss This Discovery Feed"). New this pass — the dashboard's
// tab row (app/student/dashboard/dashboard-client.tsx) needed a real route
// to link to; building the feed itself was explicitly out of scope
// ("Don't build the other tabs").
export default function StudentDontMissThisPage() {
  return (
    <main>
      <h1>Don&apos;t Miss This</h1>
      <p className="muted">
        Limited-seat/one-off opportunity discovery feed lands here — not
        built in this pass. See docs/product-spec.md Area A.1.
      </p>
    </main>
  );
}
