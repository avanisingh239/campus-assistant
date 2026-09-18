import { describe, expect, it } from "vitest";
import { buildClassUpdateDraft, buildSocietyUpdateDraft } from "./build-submission";
import type { ClassUpdateFormInput, SocietyUpdateFormInput } from "./validation";

function classInput(overrides: Partial<ClassUpdateFormInput> = {}): ClassUpdateFormInput {
  return {
    section: "B",
    course_name: "Database Systems",
    status: "cancelled",
    event_date: "2026-09-22",
    start_time: "11:00",
    end_time: "12:00",
    ...overrides,
  };
}

function societyInput(overrides: Partial<SocietyUpdateFormInput> = {}): SocietyUpdateFormInput {
  return {
    title: "Robotics Workshop",
    event_date: "2026-09-22",
    start_time: "14:00",
    end_time: "16:00",
    unlimited_seats: false,
    seat_count: "30",
    deadline_at: "2026-09-20T23:59",
    link_url: "https://forms.gle/abc123",
    ...overrides,
  };
}

describe("buildClassUpdateDraft", () => {
  it("titles and serializes a cancellation", () => {
    const draft = buildClassUpdateDraft(classInput(), "CSE-2028-A");
    expect(draft.title).toBe("Database Systems (Section B) — Cancelled");
    expect(draft.raw_text).toContain("Class: CSE-2028-A");
    expect(draft.raw_text).toContain("Section: B");
    expect(draft.raw_text).toContain("Course: Database Systems");
    expect(draft.raw_text).toContain("Status: Cancelled");
    expect(draft.raw_text).toContain("Date: 2026-09-22");
    expect(draft.raw_text).toContain("Time: 11:00–12:00");
    expect(draft.linked_class_name).toBe("Database Systems");
    expect(draft.event_date).toBe("2026-09-22");
  });

  it("uses each status's own label", () => {
    expect(buildClassUpdateDraft(classInput({ status: "rescheduled" }), "CSE-2028-A").title).toContain(
      "Rescheduled",
    );
    expect(buildClassUpdateDraft(classInput({ status: "room_shift" }), "CSE-2028-A").title).toContain(
      "Room shift",
    );
    expect(
      buildClassUpdateDraft(classInput({ status: "urgent_announcement" }), "CSE-2028-A").title,
    ).toContain("Urgent announcement");
  });

  it("handles missing times without fabricating a range", () => {
    const draft = buildClassUpdateDraft(classInput({ start_time: "", end_time: "" }), "CSE-2028-A");
    expect(draft.start_time).toBeNull();
    expect(draft.end_time).toBeNull();
    expect(draft.raw_text).toContain("Time: not specified");
  });

  it("flows the admin's Details text into why_it_matters and raw_text", () => {
    const draft = buildClassUpdateDraft(
      classInput({ status: "rescheduled", details: "Moved to Room 204, Thursday 3-4pm" }),
      "CSE-2028-A",
    );
    expect(draft.why_it_matters).toBe("Moved to Room 204, Thursday 3-4pm");
    expect(draft.raw_text).toContain("Details: Moved to Room 204, Thursday 3-4pm");
  });

  it("does not fabricate details when left blank", () => {
    const draft = buildClassUpdateDraft(classInput({ details: undefined }), "CSE-2028-A");
    expect(draft.why_it_matters).toBeNull();
    expect(draft.raw_text).toContain("Details: none given");
  });

  it("trims whitespace-only details down to null", () => {
    const draft = buildClassUpdateDraft(classInput({ details: "   " }), "CSE-2028-A");
    expect(draft.why_it_matters).toBeNull();
  });
});

describe("buildSocietyUpdateDraft", () => {
  it("titles and serializes a limited-seat event", () => {
    const draft = buildSocietyUpdateDraft(societyInput(), "Robotics Club");
    expect(draft.title).toBe("Robotics Workshop — Robotics Club");
    expect(draft.raw_text).toContain("Society: Robotics Club");
    expect(draft.raw_text).toContain("Event: Robotics Workshop");
    expect(draft.raw_text).toContain("Time: 14:00–16:00");
    expect(draft.raw_text).toContain("Seats: 30");
    expect(draft.raw_text).toContain("Registration deadline: 2026-09-20 23:59");
    expect(draft.raw_text).toContain("Registration link: https://forms.gle/abc123");
    expect(draft.seat_count).toBe(30);
    expect(draft.deadline_at).toBe("2026-09-20T23:59:00Z");
    expect(draft.link_url).toBe("https://forms.gle/abc123");
  });

  it("treats unlimited seats as no seat_count, not a fabricated number", () => {
    const draft = buildSocietyUpdateDraft(
      societyInput({ unlimited_seats: true, seat_count: "" }),
      "Robotics Club",
    );
    expect(draft.seat_count).toBeNull();
    expect(draft.raw_text).toContain("Seats: Unlimited");
  });

  it("omits deadline/link when not given, without fabricating placeholders", () => {
    const draft = buildSocietyUpdateDraft(
      societyInput({ deadline_at: "", link_url: "" }),
      "Robotics Club",
    );
    expect(draft.deadline_at).toBeNull();
    expect(draft.link_url).toBeNull();
    expect(draft.raw_text).toContain("Registration deadline: none given");
    expect(draft.raw_text).toContain("Registration link: none given");
  });

  it("flows the admin's Details text into why_it_matters and raw_text", () => {
    const draft = buildSocietyUpdateDraft(
      societyInput({ details: "Held in the main auditorium, bring your student ID" }),
      "Robotics Club",
    );
    expect(draft.why_it_matters).toBe("Held in the main auditorium, bring your student ID");
    expect(draft.raw_text).toContain("Details: Held in the main auditorium, bring your student ID");
  });

  it("does not fabricate details when left blank", () => {
    const draft = buildSocietyUpdateDraft(societyInput({ details: undefined }), "Robotics Club");
    expect(draft.why_it_matters).toBeNull();
    expect(draft.raw_text).toContain("Details: none given");
  });
});
