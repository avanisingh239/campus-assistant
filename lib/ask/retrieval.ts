import { cosineSimilarity } from "@/lib/deduplication/embedding-similarity";
import type { AskCandidateRow } from "./types";

/**
 * Pure retrieval logic for "Ask Rescript" — no network access, same shape
 * as lib/deduplication/embedding-similarity.ts, which this file directly
 * reuses `cosineSimilarity` from rather than re-implementing. The one real
 * Gemini call this feature's retrieval step depends on (embedding the
 * question itself) happens once, in lib/ask/actions.ts, before any of the
 * functions here run — comparing that single embedding against every
 * candidate's already-stored `title_embedding` is plain code, exactly the
 * "embeddings computed once and compared cheaply" principle the dedup
 * pass already established.
 */

/**
 * How relevant a candidate announcement's title embedding must be to the
 * student's QUESTION to count as real context for the synthesis call,
 * rather than noise. Deliberately a DIFFERENT, lower number than
 * lib/deduplication/embedding-similarity.ts's `EMBEDDING_SIMILARITY_THRESHOLD`
 * (0.85) — that threshold answers "are these two TITLES paraphrases of the
 * same real-world notice," a near-duplicate bar between two similarly-
 * shaped declarative strings. This one answers a genuinely different
 * question: "is this announcement's title topically relevant to a
 * differently-shaped piece of text (a natural-language QUESTION)." A
 * question like "when's my next exam" and a title like "Midterm Exam
 * Schedule Posted" describe the same topic without being anywhere near
 * paraphrases of each other, so reusing the dedup threshold here would
 * reject almost everything relevant. 0.5 is a documented, revisitable
 * starting point — the same honesty this codebase's other hand-picked
 * thresholds (the old Jaccard 0.6, dedup's own 0.85) carry when they're a
 * judgment call rather than a derivation: no live Gemini embeddings were
 * available in this sandbox to calibrate against real question/title
 * pairs (see lib/ai/embed.ts's own doc comment on why the network call
 * itself can't be exercised here), so this is the first number to
 * re-tune once real usage data exists.
 */
export const ASK_RELEVANCE_THRESHOLD = 0.5;

/**
 * At most this many retrieved announcements are ever handed to the
 * synthesis call as context. Keeps the prompt small and, more importantly,
 * keeps the answer honest — once there are dozens of candidates clearing
 * the relevance bar, the least-relevant ones at the tail would only dilute
 * the model's grounding in the genuinely best matches at the top.
 */
export const MAX_CONTEXT_ITEMS = 5;

export interface RankedCandidate {
  candidate: AskCandidateRow;
  score: number;
}

/**
 * Ranks every candidate that HAS a stored embedding by cosine similarity
 * to the question's own embedding, highest first. Candidates with no
 * stored `title_embedding` — an older announcement ingested before the
 * dedup pass added this column, or one whose own embed call
 * failed/rate-limited at ingestion time (lib/ai/embed.ts's documented,
 * graceful `null` result) — are excluded rather than scored. There's
 * nothing to compare, and scoring them 0 would be indistinguishable from
 * "definitely not relevant" versus "we simply don't know" — excluding
 * them keeps that distinction honest, even though the practical effect
 * (never appearing in the ranked list) ends up the same either way.
 */
export function rankBySimilarity(
  questionEmbedding: number[],
  candidates: AskCandidateRow[],
): RankedCandidate[] {
  const withEmbeddings = candidates.filter(
    (c): c is AskCandidateRow & { title_embedding: number[] } => c.title_embedding !== null,
  );

  return withEmbeddings
    .map((candidate) => ({
      candidate,
      score: cosineSimilarity(questionEmbedding, candidate.title_embedding),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * The actual retrieval decision `lib/ask/actions.ts` calls: every
 * candidate clearing `ASK_RELEVANCE_THRESHOLD`, ranked highest-first,
 * capped at `MAX_CONTEXT_ITEMS`. An EMPTY result is the deterministic
 * trigger for the honest "I don't have anything matching that yet"
 * response — the caller skips the synthesis call entirely in that case
 * (a real rate-limit win, not just a correctness one — see
 * lib/ask/actions.ts's own doc comment) rather than asking Gemini to
 * produce that same honesty on its own from no real context.
 */
export function selectRelevantCandidates(
  questionEmbedding: number[],
  candidates: AskCandidateRow[],
): RankedCandidate[] {
  return rankBySimilarity(questionEmbedding, candidates)
    .filter((ranked) => ranked.score >= ASK_RELEVANCE_THRESHOLD)
    .slice(0, MAX_CONTEXT_ITEMS);
}
