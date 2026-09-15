"use client";

import Link from "next/link";
import type { IngestedAnnouncementSummary } from "@/lib/ingestion/types";
import { CATEGORY_LABELS, CONFIDENCE_LABELS } from "@/lib/dashboard/category-meta";
import { classifyIngestOutcome } from "@/lib/ingestion/result-state";
import { Button } from "@/components/ui/button";
import cardStyles from "@/app/student/dashboard/dashboard.module.css";
import uiStyles from "@/components/ui.module.css";
import styles from "./ingest.module.css";

/** One completed run's outcome — a single pasted message counts as a batch of 1. */
export interface BatchOutcome {
  extracted: IngestedAnnouncementSummary[];
  successCount: number;
  failureCount: number;
  /** Messages actually run through the pipeline (successCount + failureCount). */
  processedCount: number;
  /** Messages the parser found before any MAX_BATCH_SIZE truncation — equal to
   * processedCount unless a .txt upload had more messages than that cap. */
  foundCount: number;
  skippedSystemLines: number;
  firstErrorMessage: string | null;
}

export type Outcome = { kind: "unsupported_format" } | { kind: "batch"; data: BatchOutcome };

const CONFIDENCE_CLASS: Record<IngestedAnnouncementSummary["confidence"], string> = {
  clear: cardStyles.confidenceClear,
  partial: cardStyles.confidencePartial,
  unclear: cardStyles.confidenceUnclear,
};

/**
 * States 5-9 of docs/product-spec.md's Ingestion States list (see
 * lib/ingestion/result-state.ts for which 5 of those this page actually
 * builds, and why `Duplicate Input` isn't one of them).
 */
export function ResultPanel({
  outcome,
  onIngestMore,
  onRetry,
}: {
  outcome: Outcome;
  onIngestMore: () => void;
  onRetry: () => void;
}) {
  if (outcome.kind === "unsupported_format") {
    return (
      <div className={styles.resultCard}>
        <p className={styles.resultBadge} data-tone="failed">
          Unsupported format
        </p>
        <h2 className={styles.resultHeading}>That doesn&apos;t look like a WhatsApp export</h2>
        <p className={styles.resultBody}>
          Make sure you&apos;re uploading the .txt file from WhatsApp&apos;s &quot;Export chat&quot; option — each
          line should start with a date and time, like <code>3/10/24, 9:05 AM - Name: message</code>.
        </p>
        <div className={styles.formActions}>
          <Button className={styles.actionButton} onClick={onIngestMore}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { data } = outcome;
  const state = classifyIngestOutcome({
    successCount: data.successCount,
    failureCount: data.failureCount,
    extracted: data.extracted,
  });
  const truncated = data.foundCount > data.processedCount;

  const BADGE: Record<typeof state, { tone: string; text: string }> = {
    successfully_parsed: { tone: "success", text: "Successfully parsed" },
    partially_parsed: { tone: "partial", text: "Partially parsed" },
    needs_clarification: { tone: "unclear", text: "Needs clarification" },
    failed: { tone: "failed", text: "Failed" },
  };
  const badge = BADGE[state];

  return (
    <div className={styles.resultCard}>
      <p className={styles.resultBadge} data-tone={badge.tone}>
        {badge.text}
      </p>

      {state === "failed" && (
        <>
          <h2 className={styles.resultHeading}>
            {data.processedCount > 1 ? "None of these messages could be processed" : "That message couldn't be processed"}
          </h2>
          <p className={styles.resultBody}>
            {data.firstErrorMessage ?? "Something went wrong talking to the extraction service."}
          </p>
        </>
      )}

      {state === "partially_parsed" && (
        <>
          <h2 className={styles.resultHeading}>
            {data.successCount} of {data.processedCount} messages processed
          </h2>
          <p className={styles.resultBody}>
            {data.failureCount} message{data.failureCount === 1 ? "" : "s"} failed to process
            {data.firstErrorMessage ? ` — first error: ${data.firstErrorMessage}` : ""}. The
            {data.successCount === 1 ? " one that worked is" : " ones that worked are"} shown below; nothing was
            silently dropped.
          </p>
        </>
      )}

      {state === "needs_clarification" && (
        <>
          <h2 className={styles.resultHeading}>These need a closer look</h2>
          <p className={styles.resultBody}>
            Everything below came back too ambiguous to categorize with confidence. They&apos;re still saved to
            your dashboard, flagged as <strong>❓ Unclear</strong> — review them there when you get a chance.
          </p>
        </>
      )}

      {state === "successfully_parsed" && (
        <>
          <h2 className={styles.resultHeading}>
            {data.extracted.length === 0
              ? "Nothing to extract"
              : `Extracted ${data.extracted.length} announcement${data.extracted.length === 1 ? "" : "s"}`}
          </h2>
          <p className={styles.resultBody}>
            {data.extracted.length === 0
              ? "This text didn't contain anything Rescript recognized as a campus announcement."
              : "Confirmed and saved — you'll see these on your dashboard."}
          </p>
        </>
      )}

      {data.extracted.length > 0 && (
        <ul className={styles.extractedList}>
          {data.extracted.map((item) => (
            <li key={item.id} className={styles.extractedItem}>
              <span className={`${cardStyles.cbadge} ${CONFIDENCE_CLASS[item.confidence]}`}>
                {CONFIDENCE_LABELS[item.confidence]}
              </span>
              <span className={styles.extractedCategory}>{CATEGORY_LABELS[item.category]}</span>
              <span className={styles.extractedTitle}>{item.title}</span>
            </li>
          ))}
        </ul>
      )}

      {(truncated || data.skippedSystemLines > 0) && (
        <p className={styles.resultNote}>
          {truncated &&
            `Processed the first ${data.processedCount} of ${data.foundCount} messages found in this file to stay within Gemini's free-tier rate limit. `}
          {data.skippedSystemLines > 0 &&
            `Skipped ${data.skippedSystemLines} system notice${data.skippedSystemLines === 1 ? "" : "s"} (joins, encryption notices, etc.) that weren't real messages.`}
        </p>
      )}

      <div className={styles.formActions}>
        {state === "successfully_parsed" || state === "needs_clarification" ? (
          <>
            <Link
              href="/student/dashboard"
              className={`${uiStyles.button} ${uiStyles.buttonPrimary} ${styles.actionButton}`}
              style={{ textAlign: "center", textDecoration: "none", display: "inline-block" }}
            >
              View on your dashboard
            </Link>
            <Button variant="ghost" className={styles.actionButton} type="button" onClick={onIngestMore}>
              Add more messages
            </Button>
          </>
        ) : (
          <>
            <Button className={styles.actionButton} type="button" onClick={onRetry}>
              Retry
            </Button>
            <Button variant="ghost" className={styles.actionButton} type="button" onClick={onIngestMore}>
              Back
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
