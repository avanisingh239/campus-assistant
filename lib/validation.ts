import type { z } from "zod";

/**
 * Shared zod-error-to-field-errors helper, used by every plain-
 * controlled-input form in this app (originally written for
 * app/(auth)/login/validation.ts, extracted here once
 * app/student/timetable's form needed the exact same thing).
 */

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Flattens a ZodError into { field: firstMessage }, for rendering one inline error per field. */
export function fieldErrorsFromZod<T extends Record<string, unknown>>(
  error: z.ZodError<T>,
): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof T | undefined;
    if (key !== undefined && !(key in errors)) {
      errors[key] = issue.message;
    }
  }
  return errors;
}
