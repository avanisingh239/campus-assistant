import { describe, expect, it } from "vitest";
import { resolveEarliestSourceGroupNames } from "./source-group-names";

describe("resolveEarliestSourceGroupNames", () => {
  it("resolves a single source's group name", () => {
    const result = resolveEarliestSourceGroupNames(
      [{ announcement_id: "a1", message_id: "m1", created_at: "2026-09-10T00:00:00Z" }],
      [{ id: "m1", source_group_name: "CSE-2028-A" }],
    );
    expect(result.get("a1")).toBe("CSE-2028-A");
  });

  it("picks the EARLIEST source's group name when an announcement has several (a merge)", () => {
    const result = resolveEarliestSourceGroupNames(
      [
        { announcement_id: "a1", message_id: "later", created_at: "2026-09-15T00:00:00Z" },
        { announcement_id: "a1", message_id: "earlier", created_at: "2026-09-01T00:00:00Z" },
      ],
      [
        { id: "later", source_group_name: "AM SheVibes" },
        { id: "earlier", source_group_name: "CSE-2028-A" },
      ],
    );
    expect(result.get("a1")).toBe("CSE-2028-A");
  });

  it("resolves independently per announcement", () => {
    const result = resolveEarliestSourceGroupNames(
      [
        { announcement_id: "a1", message_id: "m1", created_at: "2026-09-01T00:00:00Z" },
        { announcement_id: "a2", message_id: "m2", created_at: "2026-09-02T00:00:00Z" },
      ],
      [
        { id: "m1", source_group_name: "Group A" },
        { id: "m2", source_group_name: "Group B" },
      ],
    );
    expect(result.get("a1")).toBe("Group A");
    expect(result.get("a2")).toBe("Group B");
  });

  it("resolves to null when the source's own source_group_name is null", () => {
    const result = resolveEarliestSourceGroupNames(
      [{ announcement_id: "a1", message_id: "m1", created_at: "2026-09-01T00:00:00Z" }],
      [{ id: "m1", source_group_name: null }],
    );
    expect(result.get("a1")).toBeNull();
  });

  it("resolves to null when the linked message row is missing entirely", () => {
    const result = resolveEarliestSourceGroupNames(
      [{ announcement_id: "a1", message_id: "missing", created_at: "2026-09-01T00:00:00Z" }],
      [],
    );
    expect(result.get("a1")).toBeNull();
  });

  it("returns an empty map for no source links", () => {
    expect(resolveEarliestSourceGroupNames([], []).size).toBe(0);
  });

  it("has no entry at all for an announcement with no source links", () => {
    const result = resolveEarliestSourceGroupNames(
      [{ announcement_id: "a1", message_id: "m1", created_at: "2026-09-01T00:00:00Z" }],
      [{ id: "m1", source_group_name: "Group A" }],
    );
    expect(result.has("a2")).toBe(false);
  });
});
