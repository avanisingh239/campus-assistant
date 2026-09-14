import "server-only";
import { GoogleGenAI } from "@google/genai";

/**
 * Gemini API client for the extraction pipeline (docs/ai-contracts.md).
 * Resolves GEMINI_API_KEY from the environment — never hardcode a key.
 *
 * Provider: Google Gemini (`@google/genai`), not the Claude API. This is a
 * cost-driven choice, not a capability-driven one — see CLAUDE.md for the
 * hackathon free-tier rationale and the note that switching back to Claude
 * post-hackathon is a real option, not ruled out.
 *
 * Model: gemini-3.6-flash. The SDK's own README (as of the pinned
 * @google/genai version) uses `gemini-2.5-flash` as its example model, but
 * that model was retired for new API keys — Google's API itself returns a
 * 404 naming `gemini-3.6-flash` as the replacement, which also matches a
 * real entry in the installed SDK's model type union, so that's what's
 * pinned here instead. If this 404s again in the future (Gemini's lineup
 * moves fast), either re-check the live error message the same way, or
 * switch to the `gemini-flash-latest` alias, which always points at
 * whatever Google currently considers the standard flash model — trading
 * predictability (this repo could start behaving differently with no code
 * change) for never needing this fix again. If the free tier's ~10 req/min
 * cap turns out too tight even with the retry/backoff in lib/ai/extract.ts,
 * `gemini-3.1-flash-lite` is the lighter/cheaper alternative to try next.
 */
export const GEMINI_MODEL = "gemini-3.6-flash";

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "Missing GEMINI_API_KEY. Copy .env.example to .env.local and fill it " +
          "in with a free key from https://aistudio.google.com/apikey.",
      );
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}
