"use client";

import { useState, type FormEvent } from "react";
import {
  classUpdateSchema,
  fieldErrorsFromZod,
  CLASS_UPDATE_STATUSES,
  CLASS_UPDATE_STATUS_LABELS,
  type ClassUpdateFormInput,
  type FieldErrors,
} from "@/lib/admin/validation";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import styles from "./admin-dashboard.module.css";

interface FormState {
  section: string;
  course_name: string;
  status: ClassUpdateFormInput["status"];
  event_date: string;
  start_time: string;
  end_time: string;
}

const EMPTY: FormState = {
  section: "",
  course_name: "",
  status: "cancelled",
  event_date: "",
  start_time: "",
  end_time: "",
};

/**
 * CR flow (docs/product-spec.md Area B.2 / Feature 5.1), simplified to the
 * columns `announcements` actually has (no course_code/location_room —
 * see docs/ai-contracts.md §3, same reason the AI extraction schema
 * doesn't have them). `Class` isn't an editable field here — it's rendered
 * read-only from the admin's own assigned scope (see admin-dashboard-screen.tsx),
 * so a CR can only ever submit for the class they're actually scoped to.
 */
export function ClassUpdateForm({
  className,
  submitting,
  onSubmit,
}: {
  className: string;
  submitting: boolean;
  onSubmit: (input: ClassUpdateFormInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Record<string, string>>>({});

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = classUpdateSchema.safeParse(form);
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
      <h2>Submit a class update</h2>
      <form onSubmit={handleSubmit} noValidate>
        <TextField id="class-name" label="Class" value={className} disabled readOnly />

        <TextField
          id="section"
          label="Section"
          value={form.section}
          onChange={(e) => update("section", e.target.value)}
          error={fieldErrors.section}
        />
        <TextField
          id="course_name"
          label="Course"
          value={form.course_name}
          onChange={(e) => update("course_name", e.target.value)}
          error={fieldErrors.course_name}
        />

        <fieldset className={styles.radioGroup}>
          <legend>Status</legend>
          {CLASS_UPDATE_STATUSES.map((status) => (
            <label key={status} className={styles.radioOption}>
              <input
                type="radio"
                name="status"
                value={status}
                checked={form.status === status}
                onChange={() => update("status", status)}
              />
              {CLASS_UPDATE_STATUS_LABELS[status]}
            </label>
          ))}
        </fieldset>

        <TextField
          id="event_date"
          label="Date"
          type="date"
          value={form.event_date}
          onChange={(e) => update("event_date", e.target.value)}
          error={fieldErrors.event_date}
        />

        <div className={styles.timeRow}>
          <TextField
            id="start_time"
            label="Start time (optional)"
            type="time"
            value={form.start_time}
            onChange={(e) => update("start_time", e.target.value)}
            error={fieldErrors.start_time}
          />
          <TextField
            id="end_time"
            label="End time (optional)"
            type="time"
            value={form.end_time}
            onChange={(e) => update("end_time", e.target.value)}
            error={fieldErrors.end_time}
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit update"}
        </Button>
      </form>
    </div>
  );
}
