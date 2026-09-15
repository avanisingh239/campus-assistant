"use client";

/**
 * TEMPORARY dev harness for exercising the ingestion pipeline end-to-end
 * (paste text -> Claude extraction -> validated data -> `messages` +
 * `announcements` rows) without any dashboard UI. Requested explicitly as
 * the one thing this scaffolding pass needs to prove works.
 *
 * Delete this route (or gate it behind an admin-only check) before this
 * app is reachable by anyone other than developers — it calls
 * ingestRawText() with no auth check of its own, and that Server Action
 * writes through the service-role client (bypasses RLS by design, see
 * lib/supabase/admin.ts). middleware.ts does not protect /ingest-test since
 * it only matches /student/* and /admin/*.
 */

import { useState, type FormEvent } from "react";
import { ingestRawText } from "@/lib/ingestion/ingest";
import type { IngestResult } from "@/lib/ingestion/types";

export default function IngestTestPage() {
  const [rawText, setRawText] = useState("");
  const [sourceGroupName, setSourceGroupName] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await ingestRawText(rawText, {
        sourceType: "paste",
        sourceGroupName: sourceGroupName.trim() || "Test Group",
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Ingestion pipeline — dev harness</h1>
      <p className="muted">
        Not part of the product UI. Paste some forwarded messages below to
        run the real pipeline: stores a <code>messages</code> row, calls
        Gemini for extraction, validates the response, and inserts
        <code> announcements</code> + <code>announcement_sources</code>{" "}
        rows. Requires GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and
        SUPABASE_SERVICE_ROLE_KEY in your environment.
      </p>
      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="source-group-name">Source group name</label>
        <input
          id="source-group-name"
          type="text"
          value={sourceGroupName}
          onChange={(e) => setSourceGroupName(e.target.value)}
          placeholder="e.g. CSE-2028-A (defaults to &quot;Test Group&quot; if left blank)"
          style={{ display: "block", width: "100%", marginBlock: "0.5rem" }}
        />
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste WhatsApp/forwarded messages here..."
        />
        <div style={{ marginTop: "0.75rem" }}>
          <button type="submit" disabled={loading || rawText.trim().length < 10}>
            {loading ? "Extracting..." : "Run pipeline"}
          </button>
        </div>
      </form>

      {error && (
        <div className="card" style={{ borderColor: "#e5484d" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="card">
          <p>
            Stored message <code>{result.messageId}</code>
          </p>
          <p>
            Extracted {result.extractedCount} announcement
            {result.extractedCount === 1 ? "" : "s"}:
          </p>
          <ul>
            {result.announcementIds.map((id) => (
              <li key={id}>
                <code>{id}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
