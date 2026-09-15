import { describe, expect, it } from "vitest";
import { timetableEntrySchema } from "./validation";
import { fieldErrorsFromZod } from "@/lib/validation";

const valid = {
  day_of_week: "1",
  start_time: "09:00",
  end_time: "10:30",
  course_name: "Database Systems",
  section: "A",
  teacher_name: "Dr. Rao",
};

describe("timetableEntrySchema", () => {
  it("accepts a well-formed entry", () => {
    expect(timetableEntrySchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional section/teacher_name as empty strings", () => {
    const result = timetableEntrySchema.safeParse({ ...valid, section: "", teacher_name: "" });
    expect(result.success).toBe(true);
  });

  it("coerces day_of_week from a string (e.g. a <select> value)", () => {
    const result = timetableEntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.day_of_week).toBe(1);
    }
  });

  it("rejects a day_of_week outside 0-6", () => {
    const result = timetableEntrySchema.safeParse({ ...valid, day_of_week: "7" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed time", () => {
    const result = timetableEntrySchema.safeParse({ ...valid, start_time: "9am" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).start_time).toBe("Use a 24-hour HH:MM time.");
    }
  });

  it("rejects end_time not after start_time", () => {
    const result = timetableEntrySchema.safeParse({ ...valid, start_time: "10:00", end_time: "09:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).end_time).toBe("End time must be after start time.");
    }
  });

  it("rejects a missing course_name", () => {
    const result = timetableEntrySchema.safeParse({ ...valid, course_name: "" });
    expect(result.success).toBe(false);
  });
});
