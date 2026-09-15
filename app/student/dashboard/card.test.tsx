/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Card } from "./card";
import type { DashboardAnnouncement } from "@/lib/dashboard/types";

/**
 * Regression test for a real bug: clicking "View original message" on one
 * card also expanded a different card's trace-to-source panel. Investigated
 * and found `traceOpen` (this file) is already a `useState` local to each
 * `Card` instance, keyed by a unique `announcement.id` — i.e. the shared-
 * state hypothesis the bug report suggested didn't hold against this code.
 * This test renders two Cards side by side, the same way
 * dashboard-client.tsx's `.map()` does, and proves independence empirically
 * rather than by code-reading alone — see CLAUDE.md's Student Dashboard
 * section for why that distinction matters here.
 */

const NOW = new Date("2026-09-15T12:00:00Z");

function announcement(overrides: Partial<DashboardAnnouncement> = {}): DashboardAnnouncement {
  return {
    id: "a1",
    category: "deadline",
    title: "Test announcement",
    why_it_matters: null,
    what_to_do_next: null,
    confidence: "clear",
    confidence_note: null,
    event_date: null,
    start_time: null,
    end_time: null,
    deadline_at: null,
    link_url: null,
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

const cardA = announcement({
  id: "announcement-a",
  title: "Card A",
  traceSources: [
    {
      id: "message-a",
      raw_text: "This is card A's original message text.",
      source_group_name: "Group A",
      created_at: "2026-09-10T00:00:00Z",
    },
  ],
});

const cardB = announcement({
  id: "announcement-b",
  title: "Card B",
  traceSources: [
    {
      id: "message-b",
      raw_text: "This is card B's original message text.",
      source_group_name: "Group B",
      created_at: "2026-09-11T00:00:00Z",
    },
  ],
});

function renderTwoCards() {
  const onStatusChange = vi.fn().mockResolvedValue(undefined);
  render(
    <>
      <Card announcement={cardA} isUrgent={false} now={NOW} onStatusChange={onStatusChange} />
      <Card announcement={cardB} isUrgent={false} now={NOW} onStatusChange={onStatusChange} />
    </>,
  );
}

describe("Card trace-to-source toggle", () => {
  // @testing-library/react doesn't auto-cleanup between tests under
  // vitest (that's a Jest-specific default) — without this, each test's
  // rendered DOM stacks on top of the last one's.
  afterEach(cleanup);

  it("keeps each card's panel independently closed by default", () => {
    renderTwoCards();
    expect(screen.queryByText(/card a's original message/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/card b's original message/i)).not.toBeInTheDocument();
  });

  it("opening card A's panel does not open or affect card B's", async () => {
    const user = userEvent.setup();
    renderTwoCards();

    const [toggleA, toggleB] = screen.getAllByRole("button", { name: /view original message/i });
    await user.click(toggleA);

    expect(screen.getByText(/card a's original message/i)).toBeInTheDocument();
    expect(screen.queryByText(/card b's original message/i)).not.toBeInTheDocument();
    // Card B's own toggle must still read "View" (closed), not "Hide".
    expect(toggleB).toHaveTextContent(/view original message/i);
  });

  it("opening card B afterward leaves card A open, each showing only its own source text", async () => {
    const user = userEvent.setup();
    renderTwoCards();

    const [toggleA, toggleB] = screen.getAllByRole("button", { name: /view original message/i });
    await user.click(toggleA);
    await user.click(toggleB);

    expect(screen.getByText(/card a's original message/i)).toBeInTheDocument();
    expect(screen.getByText(/card b's original message/i)).toBeInTheDocument();

    // Each panel shows exactly its own text and attribution, never the
    // other card's — this is the literal cross-contamination the bug
    // report described ("that second... panel renders empty" or, worse,
    // could show the wrong card's content).
    const panels = screen.getAllByText(/original message text/i).map((el) => el.closest("div"));
    expect(panels).toHaveLength(2);
    expect(within(panels[0]!).queryByText(/group b/i)).not.toBeInTheDocument();
    expect(within(panels[1]!).queryByText(/group a/i)).not.toBeInTheDocument();
  });

  it("closing card A's panel does not close card B's", async () => {
    const user = userEvent.setup();
    renderTwoCards();

    const [toggleA, toggleB] = screen.getAllByRole("button", { name: /view original message/i });
    await user.click(toggleA);
    await user.click(toggleB);
    await user.click(toggleA); // re-click A's toggle (now reads "Hide...") to close it

    expect(screen.queryByText(/card a's original message/i)).not.toBeInTheDocument();
    expect(screen.getByText(/card b's original message/i)).toBeInTheDocument();
  });

  it("a card with no linked sources renders no toggle at all (not an empty panel)", () => {
    const noSources = announcement({ id: "announcement-c", title: "Card C", traceSources: [] });
    render(<Card announcement={noSources} isUrgent={false} now={NOW} onStatusChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /view original message/i })).not.toBeInTheDocument();
  });
});
