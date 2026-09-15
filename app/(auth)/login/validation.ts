import { z } from "zod";

/**
 * Form validation for /login. Reuses zod (already a dependency for the AI
 * extraction schema, see lib/ai/extraction-schema.ts) rather than adding a
 * new form library — plain controlled inputs + these schemas is enough for
 * three small forms.
 */

export const studentLoginSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const studentSignupSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  full_name: z.string().min(1, "Full name is required."),
  class_name: z.string().min(1, "Class is required, e.g. CSE-2028-A."),
});

export const adminLoginSchema = studentLoginSchema;

export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
export type StudentSignupInput = z.infer<typeof studentSignupSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

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
