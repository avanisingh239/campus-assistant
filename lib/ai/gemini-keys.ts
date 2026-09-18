/**
 * Pure parsing/rotation logic for Gemini API key support — deliberately
 * split out of lib/ai/gemini.ts (which reads `process.env` and constructs
 * real SDK clients) so this half stays trivially unit-testable with no
 * env/network mocking, same "pure function + thin stateful wrapper"
 * pattern as lib/deterministic/ and lib/deduplication/.
 *
 * Why this exists at all: a real quota check against the live Google AI
 * Studio console (not just the SDK's own docs) showed this project's
 * Gemini key is capped at roughly 5 requests/minute and ~100/day — tight
 * enough that a single WhatsApp .txt batch upload can exhaust it in one
 * submission, and normal testing/demo usage hits it easily. Each
 * additional free-tier key adds its OWN independent 5 RPM / ~100 RPD
 * budget, so spreading a batch's calls across several keys meaningfully
 * raises the effective ceiling without paying for anything.
 */

export interface GeminiKeyEnv {
  GEMINI_API_KEYS?: string;
  GEMINI_API_KEY?: string;
}

/**
 * `GEMINI_API_KEYS` (comma-separated) wins when set — the newer, richer
 * variable. `GEMINI_API_KEY` (the original single-key variable) is read
 * only as a fallback, never combined with `GEMINI_API_KEYS`, so an
 * existing single-key deployment keeps working completely unchanged after
 * this pass with zero config changes required. Entries are trimmed and
 * blanks dropped — a trailing comma or an accidental double comma
 * shouldn't produce a `""` key that then fails the Gemini SDK with a
 * confusing auth error instead of a clear "no keys configured" one.
 */
export function parseGeminiApiKeys(env: GeminiKeyEnv): string[] {
  const raw = env.GEMINI_API_KEYS ?? env.GEMINI_API_KEY;
  if (!raw) return [];
  return raw
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

/**
 * The key index to use on the NEXT attempt after `currentIndex` hits a
 * 429 — wraps back to 0 after the last key, so repeated rotation (either
 * within one request's retry loop, or across a batch's sequential calls —
 * lib/ai/extract.ts persists this across calls rather than resetting to 0
 * every time) keeps cycling forward through every configured key instead
 * of piling every request onto whichever key happens to be first.
 */
export function nextKeyIndex(currentIndex: number, keyCount: number): number {
  if (keyCount <= 0) {
    throw new Error("nextKeyIndex requires at least one key.");
  }
  return (currentIndex + 1) % keyCount;
}
