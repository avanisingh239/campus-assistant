import { describe, expect, it } from "vitest";
import { ASK_RELEVANCE_THRESHOLD, MAX_CONTEXT_ITEMS, rankBySimilarity, selectRelevantCandidates } from "./retrieval";
import type { AskCandidateRow } from "./types";

// Unit vectors at known angles, same fixture shape
// lib/deduplication/embedding-similarity.test.ts and lib/deduplication/
// match.test.ts already use — cosineSimilarity(QUESTION, x) is just x's
// first component, so scores below are easy to verify by inspection.
const QUESTION_EMBEDDING = [1, 0];
const HIGHLY_RELEVANT = [0.9, Math.sqrt(1 - 0.9 ** 2)]; // cosine sim 0.9
const AT_THRESHOLD = [ASK_RELEVANCE_THRESHOLD, Math.sqrt(1 - ASK_RELEVANCE_THRESHOLD ** 2)]; // exactly the threshold
const SOMEWHAT_RELEVANT = [0.8, Math.sqrt(1 - 0.8 ** 2)]; // cosine sim 0.8, above threshold but below HIGHLY_RELEVANT
const NOT_RELEVANT = [0.1, Math.sqrt(1 - 0.1 ** 2)]; // cosine sim 0.1, below threshold

function candidate(overrides: Partial<AskCandidateRow> = {}): AskCandidateRow {
  return {
    id: "a1",
    category: "deadline",
    title: "Test announcement",
    why_it_matters: null,
    what_to_do_next: null,
    confidence: "clear",
    event_date: null,
    start_time: null,
    end_time: null,
    deadline_at: null,
    title_embedding: null,
    ...overrides,
  };
}

describe("rankBySimilarity", () => {
  it("ranks candidates highest-similarity-first", () => {
    const low = candidate({ id: "low", title_embedding: NOT_RELEVANT });
    const high = candidate({ id: "high", title_embedding: HIGHLY_RELEVANT });
    const mid = candidate({ id: "mid", title_embedding: SOMEWHAT_RELEVANT });

    const ranked = rankBySimilarity(QUESTION_EMBEDDING, [low, high, mid]);

    expect(ranked.map((r) => r.candidate.id)).toEqual(["high", "mid", "low"]);
  });

  it("reports the correct cosine similarity score per candidate", () => {
    const ranked = rankBySimilarity(QUESTION_EMBEDDING, [candidate({ title_embedding: HIGHLY_RELEVANT })]);
    expect(ranked[0].score).toBeCloseTo(0.9, 10);
  });

  it("excludes candidates with no stored embedding entirely, rather than scoring them 0", () => {
    const noEmbedding = candidate({ id: "none", title_embedding: null });
    const withEmbedding = candidate({ id: "has-one", title_embedding: HIGHLY_RELEVANT });

    const ranked = rankBySimilarity(QUESTION_EMBEDDING, [noEmbedding, withEmbedding]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].candidate.id).toBe("has-one");
  });

  it("returns an empty array when nothing has a stored embedding", () => {
    expect(rankBySimilarity(QUESTION_EMBEDDING, [candidate({ title_embedding: null })])).toEqual([]);
  });

  it("returns an empty array for an empty candidate list", () => {
    expect(rankBySimilarity(QUESTION_EMBEDDING, [])).toEqual([]);
  });
});

describe("selectRelevantCandidates", () => {
  it("includes a highly relevant candidate", () => {
    const result = selectRelevantCandidates(QUESTION_EMBEDDING, [candidate({ title_embedding: HIGHLY_RELEVANT })]);
    expect(result).toHaveLength(1);
  });

  it("includes a candidate exactly at the threshold (inclusive boundary)", () => {
    const result = selectRelevantCandidates(QUESTION_EMBEDDING, [candidate({ title_embedding: AT_THRESHOLD })]);
    expect(result).toHaveLength(1);
  });

  it("excludes a candidate below the relevance threshold — the honest 'nothing found' case", () => {
    const result = selectRelevantCandidates(QUESTION_EMBEDDING, [candidate({ title_embedding: NOT_RELEVANT })]);
    expect(result).toEqual([]);
  });

  it("returns an empty array when every candidate is irrelevant, not a low-confidence guess", () => {
    const result = selectRelevantCandidates(QUESTION_EMBEDDING, [
      candidate({ id: "a", title_embedding: NOT_RELEVANT }),
      candidate({ id: "b", title_embedding: [0.05, Math.sqrt(1 - 0.05 ** 2)] }),
    ]);
    expect(result).toEqual([]);
  });

  it("excludes a candidate with no stored embedding, same as rankBySimilarity", () => {
    expect(selectRelevantCandidates(QUESTION_EMBEDDING, [candidate({ title_embedding: null })])).toEqual([]);
  });

  it("caps the result at MAX_CONTEXT_ITEMS even when more candidates clear the threshold", () => {
    const manyRelevant = Array.from({ length: MAX_CONTEXT_ITEMS + 3 }, (_, i) =>
      candidate({ id: `relevant-${i}`, title_embedding: HIGHLY_RELEVANT }),
    );

    const result = selectRelevantCandidates(QUESTION_EMBEDDING, manyRelevant);

    expect(result).toHaveLength(MAX_CONTEXT_ITEMS);
  });

  it("keeps the highest-scoring candidates when capping, not an arbitrary subset", () => {
    const candidates = [
      candidate({ id: "highest", title_embedding: HIGHLY_RELEVANT }),
      candidate({ id: "mid-1", title_embedding: SOMEWHAT_RELEVANT }),
      candidate({ id: "mid-2", title_embedding: SOMEWHAT_RELEVANT }),
      candidate({ id: "mid-3", title_embedding: SOMEWHAT_RELEVANT }),
      candidate({ id: "mid-4", title_embedding: SOMEWHAT_RELEVANT }),
      candidate({ id: "mid-5", title_embedding: SOMEWHAT_RELEVANT }),
    ];

    const result = selectRelevantCandidates(QUESTION_EMBEDDING, candidates);

    expect(result).toHaveLength(MAX_CONTEXT_ITEMS);
    expect(result[0].candidate.id).toBe("highest");
  });

  it("returns an empty array for an empty candidate list", () => {
    expect(selectRelevantCandidates(QUESTION_EMBEDDING, [])).toEqual([]);
  });
});
