import "server-only";
import { ApiError } from "@google/genai";
import { GEMINI_MODEL, getGeminiApiKeys, getGeminiClientForKey } from "./gemini";

/**
 * The synthesis half of "Ask Rescript" (see CLAUDE.md's own section for
 * the full feature) — the SECOND of exactly two Gemini calls that feature
 * budgets per question asked (the first is `lib/ai/embed.ts`'s
 * `embedText`, used to embed the question itself for retrieval). Kept
 * generic over a plain already-built context string rather than importing
 * anything from lib/ask/ — this file only knows how to ask Gemini a
 * question given some text to ground it in, the same "thin Gemini-calling
 * wrapper" role lib/ai/extract.ts and lib/ai/embed.ts already play; the
 * feature-specific part (which announcements are relevant, how to format
 * them) lives in lib/ask/ instead.
 */

export class AnswerError extends Error {}

/**
 * Same wording, same reasoning, as lib/ai/extract.ts's own
 * `RATE_LIMIT_MESSAGE` — a real capacity issue, not a broken app, so the
 * message a student sees should say so plainly rather than exposing a
 * technical status code.
 */
const RATE_LIMIT_ANSWER_MESSAGE = "We're getting a lot of requests right now — try again in a moment.";

const SYSTEM_INSTRUCTION = `You are "Ask Rescript," answering a student's question about their own campus announcements.

STRICT RULES:
1. Answer ONLY using the CONTEXT announcements provided in the user message. Never invent a date, detail, or fact that isn't stated in that context — this app never lets AI output override or embellish real extracted facts, and this answer is no exception.
2. If the context doesn't actually answer the question — even if something in it is topically related — say so honestly (e.g. "I found something related, but it doesn't say when...") instead of guessing or padding out an answer to sound complete.
3. Be concise: a few sentences, not an essay. Write directly to the student ("you"), matching the plain, direct voice the rest of this app uses.
4. You may refer to context items by their [N] number or by name if it reads naturally, but you don't need to enumerate every source — the app shows the actual source list separately, alongside your answer.`;

/**
 * Calls Gemini once to synthesize a final natural-language answer to
 * `question`, grounded strictly in `contextBlock` (built by
 * lib/ask/format-context.ts from the announcements
 * lib/ask/retrieval.ts already decided were relevant — never re-derived
 * or re-ranked here).
 *
 * Deliberately a SINGLE attempt — no retry loop, no key rotation, unlike
 * lib/ai/extract.ts's extraction calls. Ask Rescript's own design budgets
 * EXACTLY two Gemini calls per question, never more (see
 * lib/ask/actions.ts) — a retry loop here would itself blow that budget,
 * so on any failure this throws a real, user-facing `AnswerError` instead
 * of silently degrading (unlike `embedText`'s own null-on-failure
 * fallback, which is safe there because dedup always has a cheaper
 * fallback path to fall back to — this feature has no equivalent
 * fallback for a failed synthesis call, so failure has to be visible).
 */
export async function synthesizeAnswer(question: string, contextBlock: string): Promise<string> {
  const keys = getGeminiApiKeys();
  const client = getGeminiClientForKey(keys[0]);

  const prompt = `CONTEXT:\n${contextBlock}\n\nSTUDENT'S QUESTION: ${question}`;

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

    if (!response.text) {
      throw new AnswerError("Rescript couldn't come up with an answer for that just now — try again in a moment.");
    }
    return response.text.trim();
  } catch (err) {
    if (err instanceof AnswerError) throw err;
    if (err instanceof ApiError && (err.status === 429 || err.status === 503)) {
      throw new AnswerError(RATE_LIMIT_ANSWER_MESSAGE);
    }
    throw new AnswerError(`Couldn't generate an answer: ${(err as Error).message}`);
  }
}
