import { describe, expect, it } from "vitest";
import { dedupeByLinkUrl } from "./community-links";
import type { DashboardAnnouncement } from "./types";

function link(overrides: Partial<DashboardAnnouncement> = {}): DashboardAnnouncement {
  return {
    id: "a1",
    category: "society_link",
    title: "Robotics Club",
    why_it_matters: null,
    what_to_do_next: null,
    confidence: "clear",
    confidence_note: null,
    event_date: null,
    start_time: null,
    end_time: null,
    deadline_at: null,
    link_url: "https://chat.whatsapp.com/robotics",
    link_verified: true,
    seat_count: null,
    seats_unclear: false,
    priority_score: 0,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    engagementStatus: "none",
    sourceCount: 1,
    contradiction: null,
    traceSources: [],
    ...overrides,
  };
}

describe("dedupeByLinkUrl", () => {
  it("keeps a single entry per unique link_url", () => {
    const first = link({ id: "a", link_url: "https://chat.whatsapp.com/robotics" });
    const second = link({ id: "b", link_url: "https://chat.whatsapp.com/robotics" });
    const result = dedupeByLinkUrl([first, second]);
    expect(result.map((l) => l.id)).toEqual(["a"]);
  });

  it("keeps entries with distinct link_urls", () => {
    const a = link({ id: "a", link_url: "https://chat.whatsapp.com/robotics" });
    const b = link({ id: "b", link_url: "https://chat.whatsapp.com/photography" });
    const result = dedupeByLinkUrl([a, b]);
    expect(result.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("drops entries with no link_url", () => {
    const noLink = link({ id: "no-link", link_url: null });
    const withLink = link({ id: "with-link", link_url: "https://chat.whatsapp.com/robotics" });
    const result = dedupeByLinkUrl([noLink, withLink]);
    expect(result.map((l) => l.id)).toEqual(["with-link"]);
  });

  it("preserves input order among survivors (first occurrence wins)", () => {
    const a = link({ id: "a", link_url: "https://chat.whatsapp.com/a" });
    const b = link({ id: "b", link_url: "https://chat.whatsapp.com/b" });
    const aDupe = link({ id: "a-dupe", link_url: "https://chat.whatsapp.com/a" });
    const result = dedupeByLinkUrl([a, b, aDupe]);
    expect(result.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [link({ id: "a" }), link({ id: "b", link_url: "https://chat.whatsapp.com/b" })];
    const inputCopy = [...input];
    dedupeByLinkUrl(input);
    expect(input).toEqual(inputCopy);
  });
});
