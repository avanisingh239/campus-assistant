import { z } from "zod";

/**
 * Manual-entry form validation for /student/timetable. Reuses zod (same
 * reasoning as app/(auth)/login/validation.ts) — plain controlled inputs,
 * no new form library.
 *
 * Empty `section`/`teacher_name` inputs come through as `""`, not
 * `undefined` (controlled `<input>`s always have a string value) — the
 * `.optional().or(z.literal(""))` shape accepts that, and
 * lib/timetable/actions.ts's Server Actions already treat both fields as
 * nullable, so the mapping from "" to null happens at the call site
 * (timetable-form.tsx), not here.
 */
export const timetableEntrySchema = z
  .object({
    day_of_week: z.coerce.number().int().min(0).max(6),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time."),
    end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time."),
    course_name: z.string().min(1, "Course name is required.").max(120),
    section: z.string().max(60).optional().or(z.literal("")),
    teacher_name: z.string().max(120).optional().or(z.literal("")),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: "End time must be after start time.",
    path: ["end_time"],
  });

export type TimetableEntryFormInput = z.infer<typeof timetableEntrySchema>;
