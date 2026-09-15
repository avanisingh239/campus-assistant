"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import uiStyles from "@/components/ui.module.css";
import styles from "./ingest.module.css";

/**
 * State 3 ("WhatsApp .txt upload"). Accepts the standard WhatsApp "Export
 * chat" file — parsing/splitting it into individual messages happens in
 * ingest-screen.tsx via lib/ingestion/whatsapp-parser.ts, not here; this
 * component's only job is picking the file and the (optional) source group
 * name. `.txt` extension is checked client-side as a quick sanity filter —
 * the real "does this actually look like a WhatsApp export" check is the
 * parser's own timestamp-pattern detection, which drives the Unsupported
 * Format result state if it fails.
 */
export function UploadForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (file: File, sourceGroupName: string) => void;
  onCancel: () => void;
}) {
  const [sourceGroupName, setSourceGroupName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && !selected.name.toLowerCase().endsWith(".txt")) {
      setError('Please choose the .txt file from WhatsApp\'s "Export chat" option.');
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a .txt file first.");
      return;
    }
    onSubmit(file, sourceGroupName);
  }

  return (
    <div className={styles.formCard}>
      <h2 className={styles.formHeading}>Upload WhatsApp .txt</h2>
      <p className={styles.formHint}>
        In WhatsApp: open the group chat → ⋮ menu → More → Export chat → Without media. Upload the resulting .txt
        file here — each message gets extracted separately.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="source-group-name-upload"
          label="Source group name (optional)"
          value={sourceGroupName}
          onChange={(e) => setSourceGroupName(e.target.value)}
          placeholder="e.g. CSE-2028-A"
        />
        <label className={uiStyles.field} htmlFor="whatsapp-file">
          <span className={uiStyles.fieldLabel}>WhatsApp export (.txt)</span>
          <input
            id="whatsapp-file"
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileChange}
            className={styles.fileInput}
          />
          {file && <p className={styles.fileName}>{file.name}</p>}
          {error && <p className={uiStyles.fieldError}>{error}</p>}
        </label>
        <div className={styles.formActions}>
          <Button type="submit" className={styles.actionButton} disabled={!file}>
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
