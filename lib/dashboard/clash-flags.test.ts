import { describe, expect, it } from "vitest";
import { collectClashedAnnouncementIds } from "./clash-flags";

describe("collectClashedAnnouncementIds", () => {
  it("collects announcement_id from a class_vs_event row", () => {
    const ids = collectClashedAnnouncementIds([{ announcement_id: "a1", other_announcement_id: null }]);
    expect(ids.has("a1")).toBe(true);
  });

  it("collects both sides of an event_vs_event row", () => {
    const ids = collectClashedAnnouncementIds([{ announcement_id: "a1", other_announcement_id: "a2" }]);
    expect(ids).toEqual(new Set(["a1", "a2"]));
  });

  it("ignores a class_vs_class row with no announcement reference at all", () => {
    const ids = collectClashedAnnouncementIds([{ announcement_id: null, other_announcement_id: null }]);
    expect(ids.size).toBe(0);
  });

  it("de-dupes the same announcement appearing across multiple rows", () => {
    const ids = collectClashedAnnouncementIds([
      { announcement_id: "a1", other_announcement_id: null },
      { announcement_id: "a1", other_announcement_id: "a2" },
    ]);
    expect(ids).toEqual(new Set(["a1", "a2"]));
  });

  it("returns an empty set for no clashes", () => {
    expect(collectClashedAnnouncementIds([]).size).toBe(0);
  });
});
