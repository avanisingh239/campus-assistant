/**
 * Real semantic-similarity upgrade to the dedup engine (see match.ts's own
 * doc comment for where this plugs in). Before this pass, the "no exact
 * `linked_class_name` on both sides" fallback path was plain Jaccard
 * word-overlap over each title's stopword-stripped words — deterministic
 * string math, not actually machine learning, even though it was the one
 * piece of this pipeline that could genuinely benefit from (and honestly
 * be described as) it. This file is pure and unit-tested, no network
 * access — same "pure function, no API call" shape as everything else in
 * lib/deduplication/; the one real API call this upgrade needs
 * (lib/ai/embed.ts's `embedText`) happens once per extracted item at
 * ingestion time, never here.
 */

/**
 * Standard cosine similarity between two equal-length embedding vectors,
 * in [-1, 1] (in practice, close to [0, 1] for Gemini's embedding space,
 * where two unrelated texts rarely produce a strongly negative dot
 * product). Returns 0 for a zero-length or mismatched-length pair rather
 * than throwing or producing `NaN` (a `0/0` from a zero-magnitude
 * vector) — a defensive floor for malformed/missing data, not a case this
 * codebase's own embedding calls are expected to ever produce.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * 0.85: the task's own suggested starting point for "same topic" at the
 * sentence-embedding level, checked against this file's own test fixtures
 * rather than trusted blindly (see embedding-similarity.test.ts) — a
 * same-notice paraphrase pair (e.g. "DBMS Assignment 3 Deadline" vs. "The
 * DBMS Assignment 3 deadline has been extended to Friday") built as
 * genuinely close-but-not-identical fixture vectors scores comfortably
 * above this, while a topically-similar-but-different-thing pair (the
 * exact false-merge case that shaped the OLD Jaccard threshold too —
 * "Library fee deadline" vs. "Hostel fee deadline") scores below it as a
 * distinctly different vector. Real Gemini embeddings weren't available to
 * calibrate against in this sandbox (no live API access — see
 * lib/ai/embed.ts's own doc comment on why the network call itself can't
 * be exercised here either), so this number is a documented, revisitable
 * starting point, not a value tuned against production data — the same
 * honest caveat this codebase's other hand-picked thresholds (the old
 * Jaccard 0.6, the priority-scoring urgency window) already carry when
 * they're a judgment call rather than a derivation.
 */
export const EMBEDDING_SIMILARITY_THRESHOLD = 0.85;

/**
 * The actual decision `match.ts` calls: do these two titles' embeddings
 * indicate the same real-world notice? A `null` on either side — the
 * documented, graceful result of `embedText` failing or hitting a rate
 * limit for that item (lib/ai/embed.ts), or an older announcement ingested
 * before this pass existed and so never got an embedding stored at all —
 * always returns `false` rather than guessing. This is deliberate, not an
 * oversight: it's what makes the "fall back to the exact linked_class_name
 * match path only" behavior the task asks for actually happen, since a
 * `false` here means `match.ts`'s embedding-or-exact-class-name check can
 * only succeed via the class-name side for that item — never a silent
 * "treat missing data as similar enough."
 */
export function embeddingsIndicateMatch(a: number[] | null, b: number[] | null): boolean {
  if (!a || !b) return false;
  return cosineSimilarity(a, b) >= EMBEDDING_SIMILARITY_THRESHOLD;
}
