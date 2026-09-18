import "server-only";
import { getGeminiApiKeys, getGeminiClientForKey } from "./gemini";

/**
 * Embedding model for lib/deduplication/embedding-similarity.ts's semantic
 * dedup check. Checked against the installed `@google/genai` SDK's own
 * bundled code rather than trusted from memory, same practice
 * lib/ai/gemini.ts's own doc comment already establishes for the main
 * generation model: the SDK's `embedContent` JSDoc *examples* still show
 * the older `text-embedding-004`, but its actual (non-Vertex) runtime
 * logic special-cases `gemini-embedding-001` and the newer
 * `gemini-embedding-2*` family by name in real conditional branches, not
 * just a comment — stronger evidence of what the SDK currently treats as
 * "the" Gemini Developer API embedding model than a doc example. If this
 * 404s in the future (Gemini's model lineup moves fast, per
 * lib/ai/gemini.ts's own note), trust the live error message the same way
 * that file already does, not this comment.
 */
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Real regression found in testing, right after the sibling fix that
 * parallelized embedding calls across extracted items (CLAUDE.md's own
 * "single paste extracting several announcements" note): that fix only
 * helps when a paste extracts MORE THAN ONE item — for a single-item
 * paste, or the slowest call in a parallelized batch, there was still no
 * ceiling at all on how long one `embedContent` call could take, and a
 * live report showed a single paste taking ~13s post-fix against a usual
 * ~5s, meaning one embedding call alone was eating several extra seconds
 * of genuine (not artificial) API latency with nothing capping it.
 *
 * This function's own doc comment already establishes the governing
 * principle for a FAILED embedding call: it must never block ingestion,
 * because a cheaper, safe fallback (exact `linked_class_name` matching
 * only) already exists. A SLOW-but-eventually-successful call is the same
 * risk in a different shape — "chasing a signal that already has a
 * cheaper fallback, at the cost of the user's time" — so it gets the same
 * treatment: `embedText` races the real call against this timeout and
 * treats a timeout exactly like any other failure (log, return `null`,
 * let dedup fall back gracefully). 5s is a deliberate, documented,
 * revisitable starting point, not a derived value (same honest caveat as
 * every other hand-picked threshold in this codebase, e.g.
 * `EMBEDDING_SIMILARITY_THRESHOLD`/`ASK_RELEVANCE_THRESHOLD`) — long enough
 * that a normal-latency call essentially never gets cut off, short enough
 * to put a real ceiling on the worst case a student waits through.
 */
const EMBEDDING_TIMEOUT_MS = 5000;

/** Rejects after `ms` — paired with a `cancel()` so the timer doesn't keep firing after the real call already won the race. */
function timeoutAfter(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`embedText timed out after ${ms}ms`)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/**
 * Computes a semantic embedding vector for a short piece of text. Two
 * callers as of the "Ask Rescript" pass, both reusing this exact function
 * rather than either building a second embedding pipeline:
 *
 *   - `lib/ingestion/ingest.ts`, embedding an extracted announcement's
 *     `title` at ingestion time, for `lib/deduplication/`'s
 *     cosine-similarity dedup check.
 *   - `lib/ask/actions.ts`, embedding a student's own natural-language
 *     question, for `lib/ask/retrieval.ts`'s cosine-similarity retrieval
 *     step (semantic search over that student's own visible
 *     announcements — see CLAUDE.md's §"Ask Rescript").
 *
 * (Originally named `embedTitle` when dedup was its only caller — renamed
 * once a second, differently-shaped caller made that name misleading; the
 * function itself is, and always was, generic over any short input text.)
 *
 * Deliberately a SINGLE attempt — no retry loop, no key rotation, unlike
 * lib/ai/extract.ts's extraction calls. For dedup: an embedding failure
 * must never block ingestion (the whole point of computing it is to make
 * one comparison better, not to become a new point of failure), and
 * retrying/rotating here would just spend more of the same tight
 * ~5rpm/~100rpd budget (CLAUDE.md's §Gemini rate limits) chasing a signal
 * that already has a safe, cheaper fallback: the exact `linked_class_name`
 * match path in lib/deduplication/match.ts still runs either way. For Ask
 * Rescript: that feature's own explicit design budgets exactly two Gemini
 * calls per question, never more — a retry loop here would itself blow
 * that budget, so a single attempt is the only option that fits either
 * caller's constraints. On any failure — a thrown error, a rate limit, or
 * a response with no embedding values — this logs via `console.error` (so
 * the fallback is visible in server logs, not a silent degradation with no
 * trace) and returns `null`. Dedup treats a `null` embedding as "this item
 * can only be matched by exact class name, not by semantic similarity";
 * Ask Rescript has no such fallback for a failed *question* embedding (there's
 * nothing to retrieve without it), so it surfaces a real user-facing error
 * instead — see that feature's own doc comments for why.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const { promise: timeoutPromise, cancel } = timeoutAfter(EMBEDDING_TIMEOUT_MS);
  try {
    const keys = getGeminiApiKeys();
    const client = getGeminiClientForKey(keys[0]);
    const response = await Promise.race([
      client.models.embedContent({
        model: GEMINI_EMBEDDING_MODEL,
        contents: text,
      }),
      timeoutPromise,
    ]);
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      console.error("EMBEDDING_ERROR", "Gemini returned no embedding values for this title.");
      return null;
    }
    return values;
  } catch (err) {
    console.error("EMBEDDING_ERROR", err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    cancel();
  }
}
