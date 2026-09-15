"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import uiStyles from "@/components/ui.module.css";
import styles from "./ingest.module.css";

/**
 * State 2 ("Bulk paste") — a real, styled textarea (not the bare HTML
 * default app/(dev)/ingest-test used) plus the same "source group name"
 * field that harness already had. Only client-side check is a minimum
 * length, matching lib/ingestion/ingest.ts's own `< 10 chars` guard, so the
 * error shows up before a wasted round-trip.
 */
export function PasteForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string, sourceGroupName: string) => void;
  onCancel: () => void;
}) {
  const [sourceGroupName, setSourceGroupName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length < 10) {
      setError("Paste at least 10 characters of message text.");
      return;
    }
    setError(null);
    onSubmit(text, sourceGroupName);
  }

  return (
    <div className={styles.formCard}>
      <h2 className={styles.formHeading}>Paste messages</h2>
      <p className={styles.formHint}>
        Paste any forwarded WhatsApp/chat text — one or many messages at once. Rescript pulls out deadlines,
        cancellations, events, and links automatically.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="source-group-name"
          label="Source group name (optional)"
          value={sourceGroupName}
          onChange={(e) => setSourceGroupName(e.target.value)}
          placeholder="e.g. CSE-2028-A"
        />
        <label className={uiStyles.field} htmlFor="raw-text">
          <span className={uiStyles.fieldLabel}>Message text</span>
          <textarea
            id="raw-text"
            className={`${uiStyles.fieldInput} ${styles.textarea}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste WhatsApp/forwarded messages here..."
            rows={10}
          />
          {error && <p className={uiStyles.fieldError}>{error}</p>}
        </label>
        <div className={styles.formActions}>
          <Button type="submit" className={styles.actionButton} disabled={text.trim().length < 10}>
            Extract announcements
          </Button>
          <Button type="button" variant="ghost" className={styles.actionButton} onClick={onCancel}>
            Back
          </Button>
        </div>
      </form>
    </div>
  );
}
