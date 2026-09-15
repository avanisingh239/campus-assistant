import type { ConfidenceLevel } from "@/lib/dashboard/types";

/**
 * The 5 result states the real ingestion page (app/student/ingest) actually
 * builds, out of the 9 states docs/product-spec.md's §Area D.2 "Ingestion
 * States" lists — `Empty`/`Ready`/`Processing` are just this page's own
 * screen state (see ingest-screen.tsx), and `Duplicate Input` is
 * deliberately not built (needs the dedup engine, which doesn't exist yet
 * — see CLAUDE.md's Core architectural rule section). `unsupported_format`
 * isn't decided here — see whatsapp-parser.ts, which the caller checks
 * before this function ever runs.
 */
export type IngestResultState =
  | "successfully_parsed"
  | "partially_parsed"
  | "needs_clarification"
  | "failed";

/**
 * Pure classifier over one ingestion run's outcome (a single pasted message
 * counts as a batch of 1) — no DB/network access, unit-tested directly. The
 * ordering of these checks matters: a batch is "failed" only when nothing
 * at all succeeded, "partially_parsed" whenever some but not all messages
 * succeeded (regardless of what those successes' confidence looks like —
 * the counts alone already tell the honest story), and only once every
 * message succeeded does confidence come into play at all.
 */
export function classifyIngestOutcome(input: {
  successCount: number;
  failureCount: number;
  extracted: { confidence: ConfidenceLevel }[];
}): IngestResultState {
  if (input.successCount === 0) {
    return "failed";
  }
  if (input.failureCount > 0) {
    return "partially_parsed";
  }
  if (input.extracted.length > 0 && input.extracted.every((a) => a.confidence === "unclear")) {
    return "needs_clarification";
  }
  return "successfully_parsed";
}
