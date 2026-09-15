"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PinCard } from "@/components/ui/pin-card";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import {
  studentLoginSchema,
  studentSignupSchema,
  fieldErrorsFromZod,
  type FieldErrors,
} from "./validation";
import styles from "./login.module.css";

/**
 * State 2: the student flow. Login is the default view; a toggle link
 * switches to signup. Both post directly to Supabase auth via the browser
 * client (never the server/admin client — this runs entirely client-side).
 *
 * Signup passes role/full_name/class_name as auth metadata rather than
 * inserting into `profiles` directly — the `handle_new_user()` trigger in
 * supabase/schema.sql reads exactly these three keys off
 * raw_user_meta_data and creates the profiles row itself.
 */
export function StudentAuthForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
    setPendingConfirmation(false);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = studentLoginSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword(result.data);
    setLoading(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    router.push("/student/dashboard");
    router.refresh();
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = studentSignupSchema.safeParse({
      email,
      password,
      full_name: fullName,
      class_name: className,
    });
    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: result.data.email,
      password: result.data.password,
      options: {
        data: {
          role: "student",
          full_name: result.data.full_name,
          class_name: result.data.class_name,
        },
      },
    });
    setLoading(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    // If the Supabase project has email confirmation enabled, signUp()
    // succeeds but returns no session — there's nothing to redirect into
    // yet. Otherwise a session comes back immediately, same as a login.
    if (!data.session) {
      setPendingConfirmation(true);
      return;
    }

    router.push("/student/dashboard");
    router.refresh();
  }

  return (
    <PinCard>
      <button type="button" className={styles.backLink} onClick={onBack}>
        ← Back
      </button>

      {mode === "login" ? (
        <>
          <h1 className={styles.formHeading}>Student login</h1>
          <p className={styles.formSub}>Welcome back — sign in to see your action plan.</p>
          {formError && <div className={styles.formError}>{formError}</div>}
          <form onSubmit={handleLogin} noValidate>
            <TextField
              id="student-login-email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              autoComplete="email"
            />
            <TextField
              id="student-login-password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              autoComplete="current-password"
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className={styles.toggleRow}>
            New here?{" "}
            <button type="button" className={styles.toggleLink} onClick={() => switchMode("signup")}>
              Create an account
            </button>
          </p>
        </>
      ) : (
        <>
          <h1 className={styles.formHeading}>Create your account</h1>
          <p className={styles.formSub}>Set up your student account to get started.</p>
          {formError && <div className={styles.formError}>{formError}</div>}
          {pendingConfirmation ? (
            <p className={styles.formSub}>
              Almost there — check <strong>{email}</strong> for a confirmation link before signing in.
            </p>
          ) : (
            <form onSubmit={handleSignup} noValidate>
              <TextField
                id="student-signup-name"
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={fieldErrors.full_name}
                autoComplete="name"
              />
              <TextField
                id="student-signup-class"
                label="Class"
                placeholder="e.g. CSE-2028-A"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                error={fieldErrors.class_name}
              />
              <TextField
                id="student-signup-email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
                autoComplete="email"
              />
              <TextField
                id="student-signup-password"
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                autoComplete="new-password"
              />
              <Button type="submit" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>
          )}
          <p className={styles.toggleRow}>
            Already have an account?{" "}
            <button type="button" className={styles.toggleLink} onClick={() => switchMode("login")}>
              Sign in
            </button>
          </p>
        </>
      )}
    </PinCard>
  );
}
