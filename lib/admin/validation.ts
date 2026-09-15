import { z } from "zod";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation";

/**
 * Form validation for /admin/dashboard's two structured forms (CR / Society
 * Coordinator). Same reasoning as app/(auth)/login/validation.ts and
 * lib/timetable/validation.ts: plain controlled inputs + zod, no new form
 * library, form state kept as strings and coerced here.
 */

export { fieldErrorsFromZod, type FieldErrors };

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const CLASS_UPDATE_STATUSES = [
  "cancelled",
  "rescheduled",
  "room_shift",
  "urgent_announcement",
] as const;

export type ClassUpdateStatus = (typeof CLASS_UPDATE_STATUSES)[number];

export const CLASS_UPDATE_STATUS_LABELS: Record<ClassUpdateStatus, string> = {
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  room_shift: "Room shift",
  urgent_announcement: "Urgent announcement",
};

export const classUpdateSchema = z
  .object({
    section: z.string().min(1, "Section is required.").max(60),
    course_name: z.string().min(1, "Course is required.").max(120),
    status: z.enum(CLASS_UPDATE_STATUSES),
    event_date: z.string().regex(DATE_REGEX, "Pick a date."),
    start_time: z.string().regex(TIME_REGEX, "Use a 24-hour HH:MM time.").optional().or(z.literal("")),
    end_time: z.string().regex(TIME_REGEX, "Use a 24-hour HH:MM time.").optional().or(z.literal("")),
  })
  .refine((data) => !data.start_time || !data.end_time || data.end_time > data.start_time, {
    message: "End time must be after start time.",
    path: ["end_time"],
  });

export type ClassUpdateFormInput = z.infer<typeof classUpdateSchema>;

export const societyUpdateSchema = z
  .object({
    title: z.string().min(3, "Event title is required.").max(120),
    event_date: z.string().regex(DATE_REGEX, "Pick a date."),
    start_time: z.string().regex(TIME_REGEX, "Use a 24-hour HH:MM time."),
    end_time: z.string().regex(TIME_REGEX, "Use a 24-hour HH:MM time."),
    unlimited_seats: z.boolean(),
    seat_count: z.string(),
    deadline_at: z.string().optional().or(z.literal("")),
    link_url: z.string().url("Enter a valid URL.").optional().or(z.literal("")),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: "End time must be after start time.",
    path: ["end_time"],
  })
  .superRefine((data, ctx) => {
    if (data.unlimited_seats) return;
    const n = Number(data.seat_count);
    if (!data.seat_count || !Number.isInteger(n) || n <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a seat count, or check Unlimited.",
        path: ["seat_count"],
      });
    }
  });

export type SocietyUpdateFormInput = z.infer<typeof societyUpdateSchema>;
