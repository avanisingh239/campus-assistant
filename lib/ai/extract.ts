import "server-only";
import { z } from "zod";
import { ApiError } from "@google/genai";
import { GEMINI_MODEL, getGeminiClient } from "./gemini";
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

/** Thrown after retries are exhausted on a 429/503 from Gemini's free tier. */
export class RateLimitError extends ExtractionError {}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 3000;
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the Gemini API to extract structured announcements from a raw
 * pasted text payload, validated against ExtractionBatchSchema.
 *
 * Gemini's free tier caps requests at roughly 10/minute — a 429 (or a 503,
 * which the free tier also returns under load) gets up to MAX_ATTEMPTS-1
 * retries with exponential backoff before giving up with a RateLimitError
 * whose message is meant to be shown directly to the user (see
 * app/student/ingest/result-panel.tsx, which surfaces any thrown Error's
 * `.message` in the Failed result state).
 */
export async function extractAnnouncements(
  rawText: string,
): Promise<ExtractedAnnouncement[]> {
  const MAX_CHARS = 12000;
  const truncated = rawText.length > MAX_CHARS ? rawText.slice(0, MAX_CHARS) : rawText;

  const client = getGeminiClient();
  const systemInstruction = buildSystemPrompt(new Date());
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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

      return result.data.announcements;
    }     } catch (err) {
      if (err instanceof ApiError) {
        console.error("GEMINI_API_ERROR", err.status, JSON.stringify(err, null, 2));
      }
      const retryable = err instanceof ApiError && isRetryableStatus(err.status);
      if (retryable && attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }

      if (retryable) {
        throw new RateLimitError(
          "Gemini's free tier only allows a few requests per minute — please wait a moment and try again.",
        );
      }

      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError(`Extraction failed: ${(err as Error).message}`);
    }
  }

  // Unreachable — every loop iteration either returns or throws — but kept
  // so TypeScript can see every path returns/throws.
  throw new ExtractionError("Extraction failed after retries.");
}
