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
    const row = toAnnouncementRow(base, "Robotics workshop, register on the club form.");
    expect(row.category).toBe("opportunity");
    expect(row.title).toBe(base.title);
    expect(row.link_url).toBe(base.link_url);
  });

  it("never includes deterministic-engine-only fields", () => {
    const row = toAnnouncementRow(base, "Robotics workshop, register on the club form.");
    expect(row).not.toHaveProperty("urgency_score");
    expect(row).not.toHaveProperty("consequence_weight");
    expect(row).not.toHaveProperty("priority_score");
  });

  it("keeps seats_unclear=true when seat_count is null", () => {
    const row = toAnnouncementRow(base, "Robotics workshop, register on the club form.");
    expect(row.seat_count).toBeNull();
    expect(row.seats_unclear).toBe(true);
  });

  it("forces seats_unclear to false when a concrete seat_count is given", () => {
    // A contradiction the Zod schema's types allow (both a count AND the
    // unclear flag) but that shouldn't reach the database — a stated count
    // isn't "unclear".
    const row = toAnnouncementRow(
      { ...base, seat_count: 12, seats_unclear: true },
      "Robotics workshop, register on the club form.",
    );
    expect(row.seat_count).toBe(12);
    expect(row.seats_unclear).toBe(false);
  });

  it("computes link_verified deterministically instead of trusting an AI-supplied value", () => {
    // base.link_url is "https://forms.example.com/robotics" — not on the
    // allowlist (only forms.gle is), so this should come back unverified
    // regardless of what the AI "thought."
    const row = toAnnouncementRow(base, "Robotics workshop, register on the club form.");
    expect(row.link_verified).toBe(false);
  });

  it("reproduces the real bug report: a spoofed domain claimed as a WhatsApp group link", () => {
    const row = toAnnouncementRow(
      { ...base, link_url: "https://whatsap-group-join.xyz/abc123" },
      "Join our WhatsApp group here: https://whatsap-group-join.xyz/abc123",
    );
    expect(row.link_verified).toBe(false);
  });

  it("verifies a real chat.whatsapp.com link from the raw message text", () => {
    const row = toAnnouncementRow(
      { ...base, link_url: "https://chat.whatsapp.com/AbCdEf12345" },
      "Join our WhatsApp group here: https://chat.whatsapp.com/AbCdEf12345",
    );
    expect(row.link_verified).toBe(true);
  });

  it("defaults link_verified to true when there's no link at all", () => {
    const row = toAnnouncementRow({ ...base, link_url: null }, "No link in this one.");
    expect(row.link_verified).toBe(true);
  });
});
