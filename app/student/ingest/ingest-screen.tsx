"use client";

import { useState } from "react";
import { ingestRawText } from "@/lib/ingestion/ingest";
import { parseWhatsAppExport } from "@/lib/ingestion/whatsapp-parser";
import { computeBatchDelays } from "@/lib/ingestion/throttle";
import type { IngestedAnnouncementSummary, IngestSourceType } from "@/lib/ingestion/types";
import { CanvasBackground } from "@/components/canvas-background";
import { ChatBubbleIcon } from "@/components/icons";
import { AppHeader } from "../app-header";
import { TabRow } from "../tab-row";
import { SourceSelect } from "./source-select";
import { PasteForm } from "./paste-form";
import { UploadForm } from "./upload-form";
import { ResultPanel, type Outcome } from "./result-panel";
import shellStyles from "../shell.module.css";
import styles from "./ingest.module.css";

type Screen = "choose" | "paste" | "upload" | "processing" | "result";

/**
 * A real quota check against the live Google AI Studio console (not just
 * documentation) found this project's Gemini key capped at roughly 5
 * requests/minute and ~100/day (lib/ai/gemini.ts) — this page calls it
 * once per message in a batch, so a huge .txt export would mean a huge
 * number of sequential, increasingly throttled/backed-off requests. Cap
 * it to keep a demo upload from taking many minutes; the result panel
 * says plainly when this truncated something rather than silently
 * dropping the rest. `runIngest` below spaces each call out
 * (lib/ingestion/throttle.ts) so a batch this size stays under the
 * per-minute ceiling with a safety margin, on top of this cap.
 */
const MAX_BATCH_SIZE = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PendingRun {
  sourceType: IngestSourceType;
  sourceGroupName: string;
  messages: string[];
  foundCount: number;
  skippedSystemLines: number;
}

/**
 * The real, authenticated /student/ingest page — see page.tsx's doc
 * comment for how this supersedes app/(dev)/ingest-test. One page,
 * internal state (same consolidation pattern as /login and /student/
 * timetable): choose a source, fill in the matching form, watch a real
 * processing state, land on one of the 5 result states this pass builds
 * (see lib/ingestion/result-state.ts for why not all 9 of
 * docs/product-spec.md's listed states apply here).
 *
 * `runIngest` is the one place that actually calls the Server Action
 * (lib/ingestion/ingest.ts's `ingestRawText`, unchanged from
 * app/(dev)/ingest-test) — a single paste is just a batch of 1, so the
 * same loop/progress/partial-failure handling covers both the Bulk Paste
 * and WhatsApp Upload flows without duplicating the batching logic.
 */
export function IngestScreen({ studentId, now }: { studentId: string; now: Date }) {
  const [screen, setScreen] = useState<Screen>("choose");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);

  async function runIngest(run: PendingRun) {
    setPendingRun(run);
    setScreen("processing");
    setProgress(run.messages.length > 1 ? { current: 0, total: run.messages.length } : null);

    const extracted: IngestedAnnouncementSummary[] = [];
    let successCount = 0;
    let failureCount = 0;
    let firstErrorMessage: string | null = null;

    // Real quota check against the live Google AI Studio console: this
    // project's Gemini key is capped at roughly 5 requests/minute — tight
    // enough that a batch upload's own sequential calls (one per message)
    // can exhaust it in a single submission. Spacing them out keeps the
    // batch under that ceiling with a safety margin (lib/ingestion/
    // throttle.ts). A single one-off paste (run.messages.length === 1)
    // always gets an all-zero delay array, so this never slows down a
    // normal paste submission — only real batches wait.
    const delays = computeBatchDelays(run.messages.length);

    for (let i = 0; i < run.messages.length; i++) {
      // Progress advances BEFORE the throttle wait, not after — otherwise
      // the bar would sit frozen on the previous count for the whole
      // delay, which reads as a hang rather than a deliberate pause.
      if (run.messages.length > 1) {
        setProgress({ current: i + 1, total: run.messages.length });
      }
      if (delays[i] > 0) {
        await sleep(delays[i]);
      }
      try {
        const result = await ingestRawText(run.messages[i], {
          sourceType: run.sourceType,
          sourceGroupName: run.sourceGroupName.trim() || "Unnamed group",
          submittedBy: studentId,
        });
        successCount++;
        extracted.push(...result.announcements);
      } catch (err) {
        failureCount++;
        firstErrorMessage ??= err instanceof Error ? err.message : String(err);
      }
    }

    setOutcome({
      kind: "batch",
      data: {
        extracted,
        successCount,
        failureCount,
        processedCount: run.messages.length,
        foundCount: run.foundCount,
        skippedSystemLines: run.skippedSystemLines,
        firstErrorMessage,
      },
    });
    setScreen("result");
  }

  function handlePasteSubmit(text: string, sourceGroupName: string) {
    runIngest({
      sourceType: "paste",
      sourceGroupName,
      messages: [text],
      foundCount: 1,
      skippedSystemLines: 0,
    });
  }

  async function handleUploadSubmit(file: File, sourceGroupName: string) {
    const fileText = await file.text();
    const parsed = parseWhatsAppExport(fileText);

    if (!parsed) {
      setPendingRun(null);
      setOutcome({ kind: "unsupported_format" });
      setScreen("result");
      return;
    }

    runIngest({
      sourceType: "whatsapp_export",
      sourceGroupName,
      messages: parsed.messages.slice(0, MAX_BATCH_SIZE),
      foundCount: parsed.messages.length,
      skippedSystemLines: parsed.skippedSystemLines,
    });
  }

  function handleRetry() {
    if (pendingRun) runIngest(pendingRun);
  }

  function handleIngestMore() {
    setOutcome(null);
    setPendingRun(null);
    setScreen("choose");
  }

  return (
    <CanvasBackground>
      <div className={shellStyles.wrap}>
        <AppHeader now={now} heroCount={0} heroLabel="new ways to add messages" />

        <TabRow active="ingest" />

        <p className={shellStyles.sectionLabel}>
          <ChatBubbleIcon />
          Add messages
        </p>

        {screen === "choose" && (
          <SourceSelect onSelectPaste={() => setScreen("paste")} onSelectUpload={() => setScreen("upload")} />
        )}

        {screen === "paste" && <PasteForm onSubmit={handlePasteSubmit} onCancel={() => setScreen("choose")} />}

        {screen === "upload" && <UploadForm onSubmit={handleUploadSubmit} onCancel={() => setScreen("choose")} />}

        {screen === "processing" && (
          <div className={styles.processingCard}>
            <div className={styles.spinner} />
            <h2 className={styles.processingHeading}>Extracting entities &amp; checking clashes…</h2>
            {progress ? (
              <>
                <p className={styles.processingBody}>
                  Processing {progress.current} of {progress.total}…
                </p>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <p className={styles.processingBody}>This usually takes a few seconds.</p>
            )}
          </div>
        )}

        {screen === "result" && outcome && (
          <ResultPanel outcome={outcome} onIngestMore={handleIngestMore} onRetry={handleRetry} />
        )}
      </div>
    </CanvasBackground>
  );
}
