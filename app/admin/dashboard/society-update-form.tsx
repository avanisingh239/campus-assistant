"use client";

import { useState, type FormEvent } from "react";
import {
  societyUpdateSchema,
  fieldErrorsFromZod,
  type SocietyUpdateFormInput,
  type FieldErrors,
} from "@/lib/admin/validation";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import uiStyles from "@/components/ui.module.css";
import styles from "./admin-dashboard.module.css";

interface FormState {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  unlimited_seats: boolean;
  seat_count: string;
  deadline_at: string;
  link_url: string;
  details: string;
}

const EMPTY: FormState = {
  title: "",
  event_date: "",
  start_time: "",
  end_time: "",
  unlimited_seats: false,
  seat_count: "",
  deadline_at: "",
  link_url: "",
  details: "",
};

/**
 * Society Coordinator flow (docs/product-spec.md Area B.3 / Feature 5.1),
 * simplified to the columns `announcements` actually has (no venue/room —
 * same reasoning as class-update-form.tsx). `Society identity` isn't an
 * editable field — it's rendered read-only from the admin's own assigned
 * scope (see admin-dashboard-screen.tsx).
 */
export function SocietyUpdateForm({
  societyName,
  submitting,
  onSubmit,
}: {
  societyName: string;
  submitting: boolean;
  onSubmit: (input: SocietyUpdateFormInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Record<string, string>>>({});

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = societyUpdateSchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});
    try {
      await onSubmit(result.data);
      setForm(EMPTY);
    } catch {
      // admin-dashboard-screen.tsx already surfaces the failure; keep the
      // admin's input in place rather than clearing a submission that failed.
    }
  }

  return (
    <div className="card">
      <h2>Submit a society / event update</h2>
      <form onSubmit={handleSubmit} noValidate>
        <TextField id="society-name" label="Society" value={societyName} disabled readOnly labelClassName={styles.fieldLabel} />

        <TextField
          id="title"
          label="Event title"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          error={fieldErrors.title}
          labelClassName={styles.fieldLabel}
        />

        <label className={uiStyles.field} htmlFor="details">
          <span className={`${uiStyles.fieldLabel} ${styles.fieldLabel}`}>
            Details (optional) — venue, what changed, or anything else worth telling students
          </span>
          <textarea
            id="details"
            className={uiStyles.fieldInput}
            value={form.details}
            onChange={(e) => update("details", e.target.value)}
            placeholder="e.g. Held in the main auditorium, bring your student ID"
            rows={3}
          />
          {fieldErrors.details && <p className={uiStyles.fieldError}>{fieldErrors.details}</p>}
        </label>

        <TextField
          id="event_date"
          label="Date"
          type="date"
          value={form.event_date}
          onChange={(e) => update("event_date", e.target.value)}
          error={fieldErrors.event_date}
          labelClassName={styles.fieldLabel}
        />

        <div className={styles.timeRow}>
          <TextField
            id="start_time"
            label="Start time"
            type="time"
            value={form.start_time}
            onChange={(e) => update("start_time", e.target.value)}
            error={fieldErrors.start_time}
            labelClassName={styles.fieldLabel}
          />
          <TextField
            id="end_time"
            label="End time"
            type="time"
            value={form.end_time}
            onChange={(e) => update("end_time", e.target.value)}
            error={fieldErrors.end_time}
            labelClassName={styles.fieldLabel}
          />
        </div>

        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={form.unlimited_seats}
            onChange={(e) => update("unlimited_seats", e.target.checked)}
          />
          Unlimited / open seats
        </label>

        {!form.unlimited_seats && (
          <TextField
            id="seat_count"
            label="Seat count"
            type="number"
            min={1}
            value={form.seat_count}
            onChange={(e) => update("seat_count", e.target.value)}
            error={fieldErrors.seat_count}
            labelClassName={styles.fieldLabel}
          />
        )}

        <TextField
          id="deadline_at"
          label="Registration deadline (optional)"
          type="datetime-local"
          value={form.deadline_at}
          onChange={(e) => update("deadline_at", e.target.value)}
          error={fieldErrors.deadline_at}
          labelClassName={styles.fieldLabel}
        />

        <TextField
          id="link_url"
          label="Registration form / link (optional)"
          type="url"
          placeholder="https://forms.gle/..."
          value={form.link_url}
          onChange={(e) => update("link_url", e.target.value)}
          error={fieldErrors.link_url}
          labelClassName={styles.fieldLabel}
        />

        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit update"}
        </Button>
      </form>
    </div>
  );
}
