/**
 * Pure parser for the official WhatsApp "Export chat" .txt format — no
 * network/DB access, so it's cheap to unit test (see
 * whatsapp-parser.test.ts) without any of this repo's usual Supabase/Gemini
 * mocking. Splits one exported chat file into one raw-text payload per
 * distinct message, each of which then goes through the exact same
 * lib/ai/extract.ts pipeline a single pasted message does — this file's
 * only job is the splitting/format-detection step, not extraction.
 *
 * WhatsApp's export line format (both iOS and Android use a close variant
 * of this): each new message starts a line with a date/time stamp, a
 * dash, then either "Sender Name: message text" for a real chat message or
 * a bare system notice with no "Name:" prefix (e.g. "Messages and calls are
 * end-to-end encrypted...", "X added Y"). A message can span multiple
 * lines (no timestamp prefix on the continuation lines) — e.g. a long
 * paste or a link on its own line.
 */

const TIMESTAMP_LINE =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:[APap]\.?[Mm]\.?)?)\s*[-–]\s(.*)$/;

// "Sender Name: message" — a plausible sender prefix (short, no colon
// inside the name itself). System notices ("X added Y", "Messages and
// calls are end-to-end encrypted...") never have this shape, which is how
// they get filtered out below rather than becoming their own announcement.
const SENDER_PREFIX = /^[^:\n]{1,60}:\s/;

// WhatsApp exports sometimes prefix the first line of a message with a
// left-to-right/right-to-left mark (U+200E/U+200F) — invisible, but breaks
// the timestamp regex if not stripped first.
const INVISIBLE_MARKS = /^[‎‏]+/;

export interface WhatsAppParseResult {
  /** One raw-text payload per real chat message, ready for extractAnnouncements(). */
  messages: string[];
  /** Count of timestamped lines recognized but dropped as system notices (no sender prefix). */
  skippedSystemLines: number;
}

/**
 * Returns `null` when the file doesn't look like a WhatsApp export at all
 * (zero lines matched the timestamp pattern) — the caller should show the
 * "Unsupported format" state rather than attempting to force-parse
 * whatever this is, per docs/product-spec.md's Ingestion States list.
 */
export function parseWhatsAppExport(rawFileText: string): WhatsAppParseResult | null {
  const lines = rawFileText.replace(/\r\n/g, "\n").split("\n");

  const messages: string[] = [];
  let currentLines: string[] | null = null;
  let currentIsRealMessage = false;
  let skippedSystemLines = 0;
  let matchedAnyTimestamp = false;

  function flush() {
    if (currentLines === null) return;
    if (currentIsRealMessage) {
      messages.push(currentLines.join("\n").trim());
    } else {
      skippedSystemLines++;
    }
    currentLines = null;
    currentIsRealMessage = false;
  }

  for (const line of lines) {
    const match = TIMESTAMP_LINE.exec(line.replace(INVISIBLE_MARKS, ""));
    if (match) {
      matchedAnyTimestamp = true;
      flush();
      const body = match[3];
      currentLines = [body];
      currentIsRealMessage = SENDER_PREFIX.test(body);
    } else if (currentLines) {
      // Continuation line of whatever message/notice is currently open.
      currentLines.push(line);
    }
    // Lines before the first timestamp match (e.g. a blank leading line)
    // are dropped — there's no message to attach them to yet.
  }
  flush();

  if (!matchedAnyTimestamp) {
    return null;
  }

  return {
    messages: messages.filter((m) => m.trim().length > 0),
    skippedSystemLines,
  };
}
