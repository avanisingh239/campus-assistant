"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Shared sign-in form for /student/login and /admin/login (docs/figma
 * screen-inventory.md §1.1/§2.1). Persona isolation is enforced by
 * middleware.ts, not here — this form just signs in and redirects to the
 * matching dashboard; a mismatched role gets a 403 from middleware on
 * arrival, same as typing the URL directly.
 */
export function LoginForm({
  heading,
  redirectTo,
}: {
  heading: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <main>
      <h1>{heading}</h1>
      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: "block", width: "100%", marginBlock: "0.5rem" }}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: "block", width: "100%", marginBlock: "0.5rem" }}
        />
        {error && <p style={{ color: "#e5484d" }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="muted">
        <a href="/login">Back to role selection</a>
      </p>
    </main>
  );
}
