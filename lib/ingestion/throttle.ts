/**
 * Pure batch-request spacing for the WhatsApp .txt upload flow
 * (app/student/ingest/ingest-screen.tsx's `runIngest` loop, the same
 * "Processing N of M" batching a single paste already reuses as a batch
 * of 1). A real quota check against the live Google AI Studio console —
 * not just the SDK's own documentation — showed this project's Gemini key
 * is capped at roughly 5 requests/minute, tight enough that a single
 * 5+-message batch upload can exhaust it in one submission. Spacing
 * requests apart keeps a batch under that ceiling with a safety margin,
 * since the limit is a hard one and burst timing isn't perfectly
 * predictable.
 *
 * No timing/sleeping lives here on purpose — only the decision logic
 * (how long to wait before each request), so it's trivially unit-testable
 * without real-time waits. The caller (ingest-screen.tsx) is the one
 * thing that actually calls `setTimeout`.
 */

/** The real ceiling, from the live console — not the free tier's general ~10/min figure documented elsewhere in this codebase (lib/ai/extract.ts's own older comments; see CLAUDE.md for the reconciliation). */
export const GEMINI_RPM_LIMIT = 5;

/**
 * Stay under `GEMINI_RPM_LIMIT` with a one-request margin, since it's a
 * hard ceiling (a 429, not a soft warning) and this app's own request
 * timing — how long each Gemini call actually takes — isn't perfectly
 * predictable, so budgeting for exactly 5 would risk tipping over it on
 * real-world timing jitter.
 */
export const SAFE_REQUESTS_PER_MINUTE = 4;

/**
 * Spacing requests exactly this far apart guarantees no more than
 * `SAFE_REQUESTS_PER_MINUTE` requests land in ANY rolling 60-second
 * window, not just fixed per-minute buckets: with a fixed interval of
 * 60000 / SAFE_REQUESTS_PER_MINUTE ms between dispatches, any 60-second
 * window can contain at most `SAFE_REQUESTS_PER_MINUTE` of them. Simpler
 * and just as effective as tracking a real sliding-window request log for
 * this app's scale (one sequential batch at a time, never concurrent
 * batches sharing the budget).
 */
export const MIN_REQUEST_SPACING_MS = Math.ceil(60_000 / SAFE_REQUESTS_PER_MINUTE);

/**
 * The delay to wait BEFORE sending the request at `index` (0-based) in a
 * batch of `batchSize`. The very first request in any batch fires
 * immediately (0ms) — throttling only has something to space out once
 * there's a second request. A `batchSize` of 1 (a single one-off paste)
 * always returns 0 for its one request, matching the task's own explicit
 * requirement that single submissions never feel slow — only real batches
 * (uploads with more than one extracted message) get spaced out at all.
 */
export function delayBeforeRequest(index: number, batchSize: number): number {
  if (batchSize <= 1) return 0;
  if (index <= 0) return 0;
  return MIN_REQUEST_SPACING_MS;
}

/**
 * Same delays as `delayBeforeRequest`, precomputed for every index in the
 * batch — what `ingest-screen.tsx`'s loop actually consumes, one `await
 * sleep(delays[i])` per iteration before calling `ingestRawText`.
 */
export function computeBatchDelays(batchSize: number): number[] {
  return Array.from({ length: batchSize }, (_, index) => delayBeforeRequest(index, batchSize));
}
