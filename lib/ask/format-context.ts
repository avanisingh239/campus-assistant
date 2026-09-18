import type { AskCandidateRow } from "./types";

/**
 * Pure formatting of retrieved announcements into the plain-text context
 * block `lib/ai/answer.ts`'s `synthesizeAnswer` hands to Gemini — no
 * network access, same "pure function extracted out of the thin
 * API-calling wrapper" shape as everywhere else in this codebase. Only
 * ever states fields the announcement actually has; a missing date/why-
 * it-matters/what-to-do-next is simply omitted from that item's block
 * rather than printed as "null" or guessed at — the synthesis prompt's own
 * "never invent a fact" rule only holds if the context it's given never
 * contains a fabricated-looking placeholder in the first place.
 */
function formatContextItem(item: AskCandidateRow, index: number): string {
  const lines = [`[${index + 1}] Title: ${item.title}`, `Category: ${item.category}`];

  if (item.deadline_at) {
    lines.push(`Deadline: ${item.deadline_at}`);
  }
  if (item.event_date) {
    const timeRange = item.start_time ? ` ${item.start_time}${item.end_time ? `-${item.end_time}` : ""}` : "";
    lines.push(`Date: ${item.event_date}${timeRange}`);
  }
  if (item.why_it_matters) {
    lines.push(`Why it matters: ${item.why_it_matters}`);
  }
  if (item.what_to_do_next) {
    lines.push(`What to do next: ${item.what_to_do_next}`);
  }

  return lines.join("\n");
}

/** Joins every retrieved item's own block, blank-line separated — the full CONTEXT section of the synthesis prompt. */
export function buildContextBlock(items: AskCandidateRow[]): string {
  return items.map((item, index) => formatContextItem(item, index)).join("\n\n");
}
