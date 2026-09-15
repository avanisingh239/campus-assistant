"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PinCard } from "@/components/ui/pin-card";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { WarningCircleIcon } from "@/components/icons";
import { adminLoginSchema, fieldErrorsFromZod, type FieldErrors } from "./validation";
import { checkAdminAccess } from "./check-admin-access";
import styles from "./login.module.css";

/**
 * State 3: the admin flow. Login only — no signup UI, since an admin's
 * scope is assigned, never self-selected (product-spec.md), and accounts
 * are provisioned manually (see scripts/create-test-admin.mjs).
 *
 * A successful signInWithPassword() only proves the credentials are valid,
 * not that this account is actually an admin — checkAdminAccess() (a
 * Server Action) re-checks profiles.role and admin_scopes afterward. On
 * failure this signs the session back out rather than leaving the visitor
 * silently authenticated on the login screen.
 */
export function AdminAuthForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [restrictedReason, setRestrictedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = adminLoginSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword(result.data);

    if (signInError) {
      setLoading(false);
      setFormError(signInError.message);
      return;
    }

    const access = await checkAdminAccess();
    setLoading(false);

    if (!access.ok) {
      await supabase.auth.signOut();
      setRestrictedReason(access.reason);
      return;
    }

    router.push("/admin/dashboard");
    router.refresh();
  }

  if (restrictedReason) {
    return (
      <PinCard>
        <div className={styles.restricted}>
          <div className={styles.restrictedIcon}>
            <WarningCircleIcon />
          </div>
          <h1 className={styles.restrictedTitle}>Access Restricted</h1>
          <p className={styles.restrictedText}>{restrictedReason}</p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setRestrictedReason(null);
              setPassword("");
            }}
          >
            Try a different account
          </Button>
        </div>
        <button
          type="button"
          className={`${styles.backLink} ${styles.backLinkCentered}`}
          onClick={onBack}
        >
          ← Back to role selection
        </button>
      </PinCard>
    );
  }

  return (
    <PinCard>
      <button type="button" className={styles.backLink} onClick={onBack}>
        ← Back
      </button>
      <h1 className={styles.formHeading}>Admin login</h1>
      <p className={styles.formSub}>Admin accounts are provisioned by the team — no signup here.</p>
      {formError && <div className={styles.formError}>{formError}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="admin-login-email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          autoComplete="email"
        />
        <TextField
          id="admin-login-password"
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
    </PinCard>
  );
}
