"use client";

import { useState, type FormEvent } from "react";
import { timetableEntrySchema } from "@/lib/timetable/validation";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation";
import { WEEKDAYS } from "@/lib/dashboard/format";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import type { TimetableEntry } from "@/lib/timetable/types";
import type { TimetableEntryInput } from "@/lib/timetable/actions";
import uiStyles from "@/components/ui.module.css";
import styles from "./timetable.module.css";

interface FormState {
  day_of_week: string;
  start_time: string;
  end_time: string;
  course_name: string;
  section: string;
  teacher_name: string;
}

function toFormState(entry: TimetableEntry | null): FormState {
  if (!entry) {
    return { day_of_week: "1", start_time: "", end_time: "", course_name: "", section: "", teacher_name: "" };
  }
  return {
    day_of_week: String(entry.day_of_week),
    // Postgres `time` can come back as "HH:MM:SS" — <input type="time"> and
    // the validation regex both want exactly "HH:MM".
    start_time: entry.start_time.slice(0, 5),
    end_time: entry.end_time.slice(0, 5),
    course_name: entry.course_name,
    section: entry.section ?? "",
    teacher_name: entry.teacher_name ?? "",
  };
}

/**
 * State 2 (add) and the edit half of state 4, per the task: one form for
 * both, distinguished by whether `initialEntry` is set. Manual entry only
 * — this is the "safest path" per the feature doc, and the only one
 * built this pass (see CLAUDE.md's §Timetable for the image-upload
 * scope decision).
 */
export function TimetableForm({
  initialEntry,
  saving,
  onSubmit,
  onDelete,
  onCancel,
}: {
  initialEntry: TimetableEntry | null;
  saving: boolean;
  onSubmit: (input: TimetableEntryInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialEntry));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Record<string, string>>>({});

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = timetableEntrySchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});

    const input: TimetableEntryInput = {
      day_of_week: result.data.day_of_week,
      start_time: result.data.start_time,
      end_time: result.data.end_time,
      course_name: result.data.course_name,
      section: result.data.section ? result.data.section : null,
      teacher_name: result.data.teacher_name ? result.data.teacher_name : null,
    };

    try {
      await onSubmit(input);
    } catch {
      // The parent already surfaces the failure (see timetable-screen.tsx's
      // actionError banner) — nothing form-local to do beyond not
      // resetting these fields, so the student doesn't lose their input.
    }
  }

  return (
    <div className={styles.formCard}>
      <h2 className={styles.formHeading}>{initialEntry ? "Edit class" : "Add a class"}</h2>
      <form onSubmit={handleSubmit} noValidate>
        <label className={uiStyles.field} htmlFor="day_of_week">
          <span className={uiStyles.fieldLabel}>Day</span>
          <select
            id="day_of_week"
            className={uiStyles.fieldInput}
            value={form.day_of_week}
            onChange={(e) => update("day_of_week", e.target.value)}
          >
            {WEEKDAYS.map((label, day) => (
              <option key={day} value={day}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.timeRow}>
          <TextField
            id="start_time"
            label="Start time"
            type="time"
            value={form.start_time}
            onChange={(e) => update("start_time", e.target.value)}
            error={fieldErrors.start_time}
          />
          <TextField
            id="end_time"
            label="End time"
            type="time"
            value={form.end_time}
            onChange={(e) => update("end_time", e.target.value)}
            error={fieldErrors.end_time}
          />
        </div>

        <TextField
          id="course_name"
          label="Course name"
          value={form.course_name}
          onChange={(e) => update("course_name", e.target.value)}
          error={fieldErrors.course_name}
        />
        <TextField
          id="section"
          label="Section (optional)"
          value={form.section}
          onChange={(e) => update("section", e.target.value)}
          error={fieldErrors.section}
        />
        <TextField
          id="teacher_name"
          label="Teacher (optional)"
          value={form.teacher_name}
          onChange={(e) => update("teacher_name", e.target.value)}
          error={fieldErrors.teacher_name}
        />

        <div className={styles.formActions}>
          <Button type="submit" disabled={saving} className={styles.actionButton}>
            {saving ? "Saving…" : initialEntry ? "Save changes" : "Add class"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving} className={styles.actionButton}>
            Cancel
          </Button>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              disabled={saving}
              className={styles.actionButton}
            >
              Delete class
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
