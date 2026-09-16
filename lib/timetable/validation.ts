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
    // Real confusion found in testing: this field is a native
    // <input type="time">, which shows separate hour/minute/AM-PM segments
    // in most browsers — if the AM/PM segment is left unset, the browser
    // reports the whole value as empty and this regex fails, which read as
    // an unexplained bug rather than an incomplete time. The message now
    // names AM/PM explicitly with a full example, even though the value
    // this regex actually validates is always 24-hour "HH:MM" underneath
    // (that's just how <input type="time"> serializes regardless of
    // display locale) — the point is to describe what the user sees and
    // needs to finish filling in, not the underlying wire format.
    start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a complete time, including AM/PM (e.g. 09:00 AM)."),
    end_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a complete time, including AM/PM (e.g. 09:00 AM)."),
    course_name: z.string().min(1, "Course name is required.").max(120),
    section: z.string().max(60).optional().or(z.literal("")),
    teacher_name: z.string().max(120).optional().or(z.literal("")),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: "End time must be after start time.",
    path: ["end_time"],
  });

export type TimetableEntryFormInput = z.infer<typeof timetableEntrySchema>;
