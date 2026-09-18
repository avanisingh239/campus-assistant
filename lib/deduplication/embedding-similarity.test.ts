import { describe, expect, it } from "vitest";
import { cosineSimilarity, embeddingsIndicateMatch, EMBEDDING_SIMILARITY_THRESHOLD } from "./embedding-similarity";

describe("cosineSimilarity", () => {
  it("scores 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
  });

  it("scores 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("scores -1 for directly opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it("computes a known non-trivial similarity correctly", () => {
    // dot = 1, |a| = sqrt(2), |b| = 1 -> 1/sqrt(2)
    expect(cosineSimilarity([1, 1], [1, 0])).toBeCloseTo(1 / Math.sqrt(2), 10);
  });

  it("returns 0 for mismatched-length vectors rather than throwing", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it("returns 0 for an empty vector rather than throwing", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([], [1, 2])).toBe(0);
  });

  it("returns 0 for a zero-magnitude vector rather than producing NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe("embeddingsIndicateMatch", () => {
  // Unit vectors at known angles, so cosineSimilarity(base, x) === x[0]
  // directly — makes the fixtures easy to verify by inspection.
  const base = [1, 0];
  const closeParaphrase = [0.9, Math.sqrt(1 - 0.9 ** 2)]; // cosine sim 0.9, above threshold
  const rightAtThreshold = [
    EMBEDDING_SIMILARITY_THRESHOLD,
    Math.sqrt(1 - EMBEDDING_SIMILARITY_THRESHOLD ** 2),
  ];
  const topicallySimilarButDifferent = [0.5, Math.sqrt(1 - 0.5 ** 2)]; // cosine sim 0.5, below threshold

  it("matches two vectors above the similarity threshold (a real-notice paraphrase)", () => {
    expect(embeddingsIndicateMatch(base, closeParaphrase)).toBe(true);
  });

  it("matches at exactly the threshold (inclusive boundary)", () => {
    expect(embeddingsIndicateMatch(base, rightAtThreshold)).toBe(true);
  });

  it("does not match two merely topically-similar vectors below the threshold", () => {
    expect(embeddingsIndicateMatch(base, topicallySimilarButDifferent)).toBe(false);
  });

  it("never matches when either side has no embedding (the documented graceful-fallback case)", () => {
    expect(embeddingsIndicateMatch(null, closeParaphrase)).toBe(false);
    expect(embeddingsIndicateMatch(base, null)).toBe(false);
    expect(embeddingsIndicateMatch(null, null)).toBe(false);
  });
});
