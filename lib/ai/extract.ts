import "server-only";
import { z } from "zod";
import { ApiError } from "@google/genai";
import { GEMINI_MODEL, getGeminiApiKeys, getGeminiClientForKey } from "./gemini";
import { nextKeyIndex } from "./gemini-keys";
import {
  ExtractionBatchSchema,
  type ExtractedAnnouncement,
} from "./extraction-schema";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Contract 4.2 in docs/ai-contracts.md — keep the two in sync.
 *
 * Takes `now` explicitly (called with `new Date()` below) rather than
 * reading the clock itself, matching this codebase's convention elsewhere
 * (lib/dashboard/format.ts etc.) of never reaching for Date.now() inside
 * logic that needs to be reasoned about deterministically.
 *
 * Built per-request, not module-level like the old static SYSTEM_PROMPT
 * was — a message like "submit by Friday" is otherwise unresolvable:
 * without today's date as an anchor, Gemini has no way to turn a relative
 * day reference into the concrete event_date/deadline_at the schema
 * requires, and rule 3 (never fabricate) correctly makes it emit null
 * instead of guessing. That was silently degrading every category that
 * uses relative dates, not just deadlines — this fixes all of them at
 * once by giving the model an anchor date to resolve against.
 */
function buildSystemPrompt(now: Date): string {
  const todayIso = now.toISOString().slice(0, 10);
  const weekday = WEEKDAYS[now.getUTCDay()];

  return `You are the extraction engine for Campus Assistant.
Your task is to analyze unstructured campus messages (e.g. from WhatsApp groups) and extract structured announcements.

CONTEXT:
Today's date is ${todayIso} (a ${weekday}). Use this to resolve relative day/time references in the text —
"today", "tomorrow", "Friday", "next Monday", "in 3 days", etc. — into concrete event_date (YYYY-MM-DD) and
deadline_at values. Resolving a clearly-stated relative reference this way is extraction, not guessing — rule 3
below only forbids inventing a date the text gives no basis for at all.

STRICT RULES:
1. Extract only facts directly stated in the text, resolving relative dates/times against today's date per CONTEXT above.
2. If any field (date, time, class/section match, seat count, link) is missing or cannot be resolved even with today's date, output null.
3. NEVER guess or fabricate a date or value the text gives no basis for.
4. Categorize each announcement into exactly one primary category:
   ['deadline', 'cancellation', 'event', 'opportunity', 'registered_update', 'society_link', 'fyi', 'duplicate', 'uncategorized'].
5. For confidence:
   - 'clear': All necessary operational details are present.
   - 'partial': What is happening is clear, but key operational details (exact time, date, or class match) are missing.
   - 'unclear': Message is vague, incomplete, or ambiguous.
6. Provide a concise 1-sentence 'why_it_matters' (the consequence/impact), or null if none applies.
7. Provide a single verb-led 'what_to_do_next' (e.g., 'Submit assignment on LMS', 'No action needed'), or null.
8. If the message names a class, course, or section that might match a student's timetable, set 'linked_class_name'
   to that name verbatim and 'match_confidence' to your confidence (0-1) that it identifies a specific class —
   do not guess a class that isn't named or clearly implied.
9. Output MUST strictly match the requested JSON schema. Respond with JSON only — no prose, no markdown fences.
10. A single raw_text payload may contain many forwarded messages concatenated together — extract one
    announcement per distinct notice, not one per input message; unrelated chatter and system lines produce no
    announcement at all.`;
}

/**
 * Best-effort JSON Schema for Gemini's `responseJsonSchema` config, derived
 * from the same Zod schema `lib/ingestion/ingest.ts` validates against —
 * generated once at module load, not per request.
 *
 * "Best-effort" because Gemini's `responseJsonSchema` only honors a subset
 * of JSON Schema (no `minLength`/`maxLength`/`pattern` — see the SDK's own
 * type docs for the full supported-keyword list). The extra keywords Zod
 * emits are harmless no-ops for Gemini, not errors. Either way, the Zod
 * schema itself is re-applied to the parsed response below (and again in
 * lib/ingestion/map-to-announcement.ts) — that's the actual safety net,
 * not this schema hint.
 */
const RESPONSE_JSON_SCHEMA = z.toJSONSchema(ExtractionBatchSchema);

export class ExtractionError extends Error {}

/** Thrown after every key + backoff attempt is exhausted on a 429/503. */
export class RateLimitError extends ExtractionError {}

/**
 * Real capacity issue, not a broken app — a rate-limit failure is treated
 * as an expected case (see CLAUDE.md's own note on the live quota check
 * that motivated this), so its message is deliberately specific and
 * reassuring rather than a generic error string. `app/student/ingest/
 * result-panel.tsx`'s Failed result state shows this `.message` directly,
 * distinct from an `ExtractionError`'s own more specific text for a
 * genuinely malformed message (e.g. "Gemini's response did not match the
 * expected extraction schema...") — a student or a judge watching a live
 * demo should be able to tell "temporary, try again" apart from "this
 * input has a real problem."
 */
const RATE_LIMIT_MESSAGE = "We're getting a lot of requests right now — try again in a moment.";

/** Backoff retries on the SAME key, once key rotation (below) has nothing left to try. */
const MAX_BACKOFF_ATTEMPTS_PER_KEY = 3;
const BASE_DELAY_MS = 3000;

function isServiceOverloadedStatus(status: number): boolean {
  return status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Which key index to start from — persisted across calls (module-level,
 * not reset per-request) rather than always starting at 0, so a batch's
 * sequential extraction calls (app/student/ingest's runIngest loop, one
 * call per message) keep rotating forward through every configured key
 * instead of re-hitting whichever key happens to be first — and likely
 * still exhausted — on every single call. Safe as plain module state: this
 * file is only ever exercised by one Node.js process's sequential batch
 * loop (each call is awaited before the next one starts), never
 * concurrent requests racing to mutate it.
 */
let sharedKeyIndex = 0;

/**
 * Calls the Gemini API to extract structured announcements from a raw
 * pasted text payload, validated against ExtractionBatchSchema.
 *
 * Real quota check against the live Google AI Studio console (not just
 * documentation): this project's key is capped at roughly 5 requests/
 * minute and ~100/day. Two independent mitigations, both real fixes for a
 * real limit rather than papering over it:
 *
 *   - **Key rotation on 429**: if more than one key is configured
 *     (`GEMINI_API_KEYS`, lib/ai/gemini.ts), a 429 immediately retries the
 *     same request on the next key — no backoff wait, since a fresh key
 *     has its own fresh quota and waiting on the exhausted one wouldn't
 *     help. Every configured key gets tried at least once before this
 *     falls back to the second mitigation below. A single-key setup (the
 *     backward-compatible default) has no second key to rotate to, so it
 *     skips straight to that fallback on its very first 429 — this
 *     preserves the exact retry behavior a single-key deployment had
 *     before key rotation existed.
 *   - **Exponential backoff on the current key**: for a 503 (Gemini's
 *     free tier also returns this under general load, unrelated to any
 *     one key's quota — rotating keys wouldn't plausibly help, so this
 *     path doesn't try), or once every key has already 429'd once, up to
 *     `MAX_BACKOFF_ATTEMPTS_PER_KEY` retries with exponential backoff on
 *     whichever key is current before finally giving up.
 *
 * Either path exhausting gives up with a `RateLimitError` whose message is
 * meant to be shown directly to the user (see
 * app/student/ingest/result-panel.tsx, which surfaces any thrown Error's
 * `.message` in the Failed result state) — see `RATE_LIMIT_MESSAGE`'s own
 * doc comment for why that text is deliberately specific to this case.
 */
export async function extractAnnouncements(
  rawText: string,
): Promise<ExtractedAnnouncement[]> {
  const MAX_CHARS = 12000;
  const truncated = rawText.length > MAX_CHARS ? rawText.slice(0, MAX_CHARS) : rawText;

  const keys = getGeminiApiKeys();
  const systemInstruction = buildSystemPrompt(new Date());

  let keyIndex = sharedKeyIndex % keys.length;
  let keysRotatedThrough = 0;
  let backoffAttempt = 1;

  while (true) {
    const client = getGeminiClientForKey(keys[keyIndex]);

    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: truncated,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
        },
      });

      if (!response.text) {
        const blockReason = response.promptFeedback?.blockReason;
        throw new ExtractionError(
          blockReason
            ? `Gemini declined to process this input (${blockReason}). Try rephrasing or removing sensitive content.`
            : "Gemini returned no output for this input.",
        );
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(response.text);
      } catch {
        throw new ExtractionError("Gemini's response was not valid JSON.");
      }

      const result = ExtractionBatchSchema.safeParse(parsedJson);
      if (!result.success) {
        throw new ExtractionError(
          `Gemini's response did not match the expected extraction schema: ${result.error.message}`,
        );
      }

      sharedKeyIndex = keyIndex;
      return result.data.announcements;
    } catch (err) {
      if (err instanceof ApiError) {
        console.error("GEMINI_API_ERROR", err.status, JSON.stringify(err, null, 2));
      }

      if (err instanceof ApiError && err.status === 429) {
        const hasUntriedKey = keysRotatedThrough < keys.length - 1;
        if (hasUntriedKey) {
          keysRotatedThrough++;
          keyIndex = nextKeyIndex(keyIndex, keys.length);
          sharedKeyIndex = keyIndex;
          continue; // immediate retry on the next key, no sleep
        }
        // Every key has now 429'd at least once this request — fall back
        // to backing off on whichever key we're currently on.
        if (backoffAttempt < MAX_BACKOFF_ATTEMPTS_PER_KEY) {
          await sleep(BASE_DELAY_MS * 2 ** (backoffAttempt - 1));
          backoffAttempt++;
          continue;
        }
        sharedKeyIndex = keyIndex;
        throw new RateLimitError(RATE_LIMIT_MESSAGE);
      }

      if (err instanceof ApiError && isServiceOverloadedStatus(err.status)) {
        if (backoffAttempt < MAX_BACKOFF_ATTEMPTS_PER_KEY) {
          await sleep(BASE_DELAY_MS * 2 ** (backoffAttempt - 1));
          backoffAttempt++;
          continue;
        }
        throw new RateLimitError(RATE_LIMIT_MESSAGE);
      }

      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError(`Extraction failed: ${(err as Error).message}`);
    }
  }
}
