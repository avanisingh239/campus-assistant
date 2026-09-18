"use client";

import { useState, type FormEvent } from "react";
import { askQuestion } from "@/lib/ask/actions";
import type { AskResult } from "@/lib/ask/types";
import { CATEGORY_LABELS } from "@/lib/dashboard/category-meta";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { CanvasBackground } from "@/components/canvas-background";
import { SearchIcon } from "@/components/icons";
import { AppHeader } from "../app-header";
import { TabRow } from "../tab-row";
import shellStyles from "../shell.module.css";
import ingestStyles from "../ingest/ingest.module.css";
import cardStyles from "../dashboard/dashboard.module.css";
import uiStyles from "@/components/ui.module.css";
import styles from "./ask.module.css";

type Screen = "idle" | "asking" | "answered" | "error";

/**
 * "Ask Rescript" — a simple question box over a student's own visible
 * announcements (see CLAUDE.md's own section, and lib/ask/actions.ts's
 * `askQuestion` for the real embed -> retrieve -> synthesize pipeline
 * this calls directly, same "Client Component calls a Server Action
 * directly" pattern as /student/ingest and /student/timetable).
 *
 * Reuses existing chrome/components rather than introducing new styling,
 * per the task's own explicit instruction: the header/tab row
 * (../shell.module.css via AppHeader/TabRow), the form/processing/result
 * card shapes (../ingest/ingest.module.css — this screen's own states map
 * onto that page's "form -> processing -> result" shape almost exactly),
 * and Button/TextField (components/ui/). ask.module.css adds only the one
 * thing nothing existing already provided: a link-reset so the reused
 * "extracted item" chip can double as a clickable source reference.
 *
 * Rate-limit safety: the question input and submit button are only ever
 * rendered while `screen` is "idle" or "error" — during "asking" (the
 * two Gemini calls in flight) this whole form unmounts in favor of the
 * processing card below, so there's no way to fire a second question
 * before the first finishes. Per the task's own framing, this alone is
 * reasonable protection here — unlike the WhatsApp batch upload, a
 * question is inherently one user-initiated action at a time, so no
 * separate throttling queue (lib/ingestion/throttle.ts's own job) is
 * needed for this feature.
 */
export function AskScreen({ now }: { now: Date }) {
  const [screen, setScreen] = useState<Screen>("idle");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 3) return;

    setScreen("asking");
    setErrorMessage(null);
    try {
      const askResult = await askQuestion(trimmed);
      setResult(askResult);
      setScreen("answered");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong asking that.");
      setScreen("error");
    }
  }

  function handleAskAnother() {
    setScreen("idle");
    setResult(null);
    setErrorMessage(null);
    setQuestion("");
  }

  return (
    <CanvasBackground>
      <div className={shellStyles.wrap}>
        <AppHeader now={now} heroCount={0} heroLabel="ask about your own announcements" />

        <TabRow active="ask" />

        <p className={shellStyles.sectionLabel}>
          <SearchIcon />
          Ask Rescript
        </p>

        {(screen === "idle" || screen === "error") && (
          <div className={ingestStyles.formCard}>
            <h2 className={ingestStyles.formHeading}>Ask a question</h2>
            <p className={ingestStyles.formHint}>
              Ask in plain language — e.g. &quot;when&apos;s my next exam&quot; or &quot;what did I miss last
              week&quot;. Rescript searches your own visible announcements and answers only from what it actually
              finds there — never a guess.
            </p>
            <form onSubmit={handleSubmit} noValidate>
              <TextField
                id="ask-question"
                label="Your question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. When's my next exam?"
              />
              {errorMessage && <p className={uiStyles.fieldError}>{errorMessage}</p>}
              <div className={ingestStyles.formActions}>
                <Button type="submit" className={ingestStyles.actionButton} disabled={question.trim().length < 3}>
                  Ask
                </Button>
              </div>
            </form>
          </div>
        )}

        {screen === "asking" && (
          <div className={ingestStyles.processingCard}>
            <div className={ingestStyles.spinner} />
            <h2 className={ingestStyles.processingHeading}>Searching your announcements…</h2>
            <p className={ingestStyles.processingBody}>Finding what&apos;s relevant, then writing an answer.</p>
          </div>
        )}

        {screen === "answered" && result && (
          <div className={ingestStyles.resultCard}>
            <p className={ingestStyles.resultBadge} data-tone={result.sources.length > 0 ? "success" : "unclear"}>
              {result.sources.length > 0 ? "Answer found" : "Nothing found"}
            </p>
            <p className={ingestStyles.resultBody}>{result.answer}</p>

            {result.sources.length > 0 && (
              <>
                <p className={styles.sourcesLabel}>From your announcements:</p>
                <ul className={ingestStyles.extractedList}>
                  {result.sources.map((source) => (
                    <li key={source.id} className={ingestStyles.extractedItem}>
                      <a href={`/student/dashboard#announcement-${source.id}`} className={styles.sourceLink}>
                        <span className={ingestStyles.extractedCategory}>{CATEGORY_LABELS[source.category]}</span>
                        <span className={ingestStyles.extractedTitle}>{source.title}</span>
                        <span className={cardStyles.srcLabel}>
                          FROM {(source.sourceGroupName ?? "UNKNOWN SOURCE").toUpperCase()}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className={ingestStyles.formActions}>
              <Button className={ingestStyles.actionButton} type="button" onClick={handleAskAnother}>
                Ask another question
              </Button>
            </div>
          </div>
        )}
      </div>
    </CanvasBackground>
  );
}
