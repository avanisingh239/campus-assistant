import { describe, expect, it } from "vitest";
import type { ExtractedAnnouncement } from "@/lib/ai/extraction-schema";
import { toAnnouncementRow } from "./map-to-announcement";

const base: ExtractedAnnouncement = {
  category: "opportunity",
  title: "Robotics workshop — limited seats",
  why_it_matters: "Only a few spots remain for hands-on lab time.",
  what_to_do_next: "Register on the club form",
  confidence: "partial",
  confidence_note: "Exact seat count not stated",
  event_date: "2026-10-01",
  start_time: "14:00",
  end_time: "16:00",
  deadline_at: null,
  linked_class_name: null,
  match_confidence: null,
  seat_count: null,
  seats_unclear: true,
  link_url: "https://forms.example.com/robotics",
};

describe("toAnnouncementRow", () => {
  it("passes through fields the AI is allowed to set", () => {
    const row = toAnnouncementRow(base);
    expect(row.category).toBe("opportunity");
    expect(row.title).toBe(base.title);
    expect(row.link_url).toBe(base.link_url);
  });

  it("never includes deterministic-engine-only fields", () => {
    const row = toAnnouncementRow(base);
    expect(row).not.toHaveProperty("urgency_score");
    expect(row).not.toHaveProperty("consequence_weight");
    expect(row).not.toHaveProperty("priority_score");
  });

  it("keeps seats_unclear=true when seat_count is null", () => {
    const row = toAnnouncementRow(base);
    expect(row.seat_count).toBeNull();
    expect(row.seats_unclear).toBe(true);
  });

  it("forces seats_unclear to false when a concrete seat_count is given", () => {
    // A contradiction the Zod schema's types allow (both a count AND the
    // unclear flag) but that shouldn't reach the database — a stated count
    // isn't "unclear".
    const row = toAnnouncementRow({
      ...base,
      seat_count: 12,
      seats_unclear: true,
    });
    expect(row.seat_count).toBe(12);
    expect(row.seats_unclear).toBe(false);
  });
});
