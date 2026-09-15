"use client";

import { useState } from "react";
import { submitClassUpdate, submitSocietyUpdate, type AdminSubmissionSummary } from "@/lib/admin/actions";
import type { ClassUpdateFormInput, SocietyUpdateFormInput } from "@/lib/admin/validation";
import { Button } from "@/components/ui/button";
import { ClassUpdateForm } from "./class-update-form";
import { SocietyUpdateForm } from "./society-update-form";
import { SubmissionHistory } from "./submission-history";
import styles from "./admin-dashboard.module.css";

export interface AdminScopeInfo {
  scopeType: "class" | "society";
  className: string | null;
  societyName: string | null;
}

/**
 * One page that adapts to the signed-in admin's own scope, rather than two
 * separate admin apps — per the task and the consolidated-route pattern
 * already used for /login, /student/timetable, and /student/ingest. States
 * (docs/product-spec.md Area B.1-B.4, all folded into this one route): the
 * matching form, a success confirmation, and submission history — the
 * history list is always visible below the form/success area rather than
 * its own screen state, per the task's "below or accessible from the same
 * page" wording.
 *
 * `history` is local optimistic state, same update-then-keep shape as
 * app/student/timetable/timetable-screen.tsx's `entries` — each Server
 * Action already returns the inserted announcement's summary row, so
 * there's nothing to re-fetch after a successful submission.
 */
export function AdminDashboardScreen({
  scope,
  initialHistory,
}: {
  scope: AdminScopeInfo | null;
  initialHistory: AdminSubmissionSummary[];
}) {
  const [history, setHistory] = useState<AdminSubmissionSummary[]>(initialHistory);
  const [justSubmitted, setJustSubmitted] = useState<AdminSubmissionSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleClassSubmit(input: ClassUpdateFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitClassUpdate(input);
      setHistory((current) => [result, ...current]);
      setJustSubmitted(result);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit this update.");
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSocietySubmit(input: SocietyUpdateFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitSocietyUpdate(input);
      setHistory((current) => [result, ...current]);
      setJustSubmitted(result);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit this update.");
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Admin Dashboard</h1>

      {scope?.scopeType === "class" && (
        <span className="scope-badge">Class Representative — {scope.className}</span>
      )}
      {scope?.scopeType === "society" && (
        <span className="scope-badge">Society Coordinator — {scope.societyName ?? "Unknown society"}</span>
      )}

      {!scope && (
        <div className="card" style={{ borderColor: "var(--urgent)" }}>
          <p>
            This admin account has no assigned scope yet, so there&apos;s nothing to submit updates for.
            Contact the team to get a class or society scope set up — see supabase/schema.sql&apos;s
            <code> admin_scopes</code> table.
          </p>
        </div>
      )}

      {submitError && (
        <div className="card" style={{ borderColor: "var(--urgent)" }}>
          {submitError}
        </div>
      )}

      {justSubmitted && (
        <div className={styles.successBanner}>
          <p>
            ✅ Submitted — &quot;{justSubmitted.title}&quot; is now live on students&apos; dashboards.
          </p>
          <Button onClick={() => setJustSubmitted(null)}>Submit another update</Button>
        </div>
      )}

      {!justSubmitted && scope?.scopeType === "class" && (
        <ClassUpdateForm
          className={scope.className ?? "Unknown class"}
          submitting={submitting}
          onSubmit={handleClassSubmit}
        />
      )}
      {!justSubmitted && scope?.scopeType === "society" && (
        <SocietyUpdateForm
          societyName={scope.societyName ?? "Unknown society"}
          submitting={submitting}
          onSubmit={handleSocietySubmit}
        />
      )}

      <SubmissionHistory items={history} />
    </main>
  );
}
