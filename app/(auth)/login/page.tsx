import Link from "next/link";

// Role Selection entry point (docs/architecture.md §2, product-spec.md §Area D.1).
export default function LoginRoleSelectPage() {
  return (
    <main>
      <h1>Campus Assistant</h1>
      <p className="muted">Choose how you want to sign in.</p>
      <div className="card">
        <Link href="/student/login">
          <button style={{ width: "100%" }}>Student Login</button>
        </Link>
      </div>
      <div className="card">
        <Link href="/admin/login">
          <button style={{ width: "100%" }}>Admin Login</button>
        </Link>
      </div>
    </main>
  );
}
