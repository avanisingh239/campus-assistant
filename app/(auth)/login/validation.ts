import { z } from "zod";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation";

/**
 * Form validation for /login. Reuses zod (already a dependency for the AI
 * extraction schema, see lib/ai/extraction-schema.ts) rather than adding a
 * new form library — plain controlled inputs + these schemas is enough for
 * three small forms.
 */

export { fieldErrorsFromZod, type FieldErrors };

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
