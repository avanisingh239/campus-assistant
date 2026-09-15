import { describe, expect, it } from "vitest";
import { shapeAnnouncements, type RawAnnouncementRow } from "./shape-announcements";

function rawAnnouncement(overrides: Partial<RawAnnouncementRow> = {}): RawAnnouncementRow {
  return {
    id: "ann-1",
    category: "deadline",
    title: "Fee payment",
    why_it_matters: "Late fee applies.",
    what_to_do_next: "Pay before Friday.",
    confidence: "clear",
    confidence_note: null,
    event_date: null,
    start_time: null,
    end_time: null,
    deadline_at: "2026-09-20T18:00:00Z",
    link_url: null,
    link_verified: true,
    seat_count: null,
    seats_unclear: false,
    priority_score: 0,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("shapeAnnouncements", () => {
  it("defaults engagement status to 'none' when there's no status row", () => {
    const [result] = shapeAnnouncements([rawAnnouncement()], [], [], [], []);
    expect(result.engagementStatus).toBe("none");
  });

  it("attaches the matching engagement status", () => {
    const [result] = shapeAnnouncements(
      [rawAnnouncement()],
      [{ announcement_id: "ann-1", status: "registered" }],
      [],
      [],
      [],
    );
    expect(result.engagementStatus).toBe("registered");
  });

  it("counts sources and attaches trace messages, sorted oldest first", () => {
    const [result] = shapeAnnouncements(
      [rawAnnouncement()],
      [],
      [],
      [
        { announcement_id: "ann-1", message_id: "m1" },
        { announcement_id: "ann-1", message_id: "m2" },
      ],
      [
        { id: "m2", raw_text: "second", source_group_name: "Group B", created_at: "2026-09-05T00:00:00Z" },
        { id: "m1", raw_text: "first", source_group_name: "Group A", created_at: "2026-09-01T00:00:00Z" },
      ],
    );
    expect(result.sourceCount).toBe(2);
    expect(result.traceSources.map((s) => s.raw_text)).toEqual(["first", "second"]);
  });

  it("defaults sourceCount to 1 with no linked messages (every announcement has an origin)", () => {
    const [result] = shapeAnnouncements([rawAnnouncement()], [], [], [], []);
    expect(result.sourceCount).toBe(1);
    expect(result.traceSources).toEqual([]);
  });

  it("attaches only the first unresolved contradiction", () => {
    const [result] = shapeAnnouncements(
      [rawAnnouncement()],
      [],
      [
        { announcement_id: "ann-1", field_name: "deadline_at", conflicting_values: [{ value: "2026-05-05" }], resolved: true },
        { announcement_id: "ann-1", field_name: "event_date", conflicting_values: [{ value: "2026-05-06" }], resolved: false },
      ],
      [],
      [],
    );
    expect(result.contradiction).not.toBeNull();
    expect(result.contradiction?.field_name).toBe("event_date");
  });

  it("leaves contradiction null when none are unresolved", () => {
    const [result] = shapeAnnouncements(
      [rawAnnouncement()],
      [],
      [{ announcement_id: "ann-1", field_name: "deadline_at", conflicting_values: [], resolved: true }],
      [],
      [],
    );
    expect(result.contradiction).toBeNull();
  });

  it("coalesces a null priority_score to 0", () => {
    const [result] = shapeAnnouncements([rawAnnouncement({ priority_score: null })], [], [], [], []);
    expect(result.priority_score).toBe(0);
  });
});
