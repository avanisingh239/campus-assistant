"use client";

import { useState } from "react";
import { ingestRawText } from "@/lib/ingestion/ingest";
import { parseWhatsAppExport } from "@/lib/ingestion/whatsapp-parser";
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
 * Gemini's free tier caps at roughly 10 requests/minute
 * (lib/ai/extract.ts), and this page calls it once per message in a batch
 * — a huge .txt export would mean a huge number of sequential, increasingly
 * backed-off requests. Cap it to keep a demo upload from taking minutes;
 * the result panel says plainly when this truncated something rather than
 * silently dropping the rest.
 */
const MAX_BATCH_SIZE = 25;

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

    for (let i = 0; i < run.messages.length; i++) {
      if (run.messages.length > 1) {
        setProgress({ current: i + 1, total: run.messages.length });
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
