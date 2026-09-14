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
 * Model: gemini-2.5-flash. The installed SDK's own README uses this as its
 * standard example model throughout (generateContent, streaming, function
 * calling, MCP) — it's Gemini's general-purpose, free-tier-friendly model as
 * of this SDK version. If the free tier's ~10 req/min cap turns out too
 * tight even with the retry/backoff in lib/ai/extract.ts, `gemini-2.5-flash-lite`
 * is the documented lighter/cheaper alternative to try next.
 */
export const GEMINI_MODEL = "gemini-2.5-flash";

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
