"use server";

import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/ai/embed";
import { synthesizeAnswer, AnswerError } from "@/lib/ai/answer";
import { rankBySimilarity, selectRelevantCandidates } from "./retrieval";
import { buildContextBlock } from "./format-context";
import { resolveEarliestSourceGroupNames } from "./source-group-names";
import type { AskCandidateRow, AskResult } from "./types";

/**
 * "Ask Rescript" — a natural-language question box over a student's own
 * visible announcements, using real semantic retrieval (embeddings), not
 * keyword search and not a single ungrounded prompt to Gemini. See
 * CLAUDE.md's own "Ask Rescript" section for the full design.
 *
 * EXACTLY two Gemini API calls per question, never more, and never
 * proportional to how many announcements exist — the tight ~5rpm/~100rpd
 * budget (CLAUDE.md's §Gemini rate limits) makes that a hard design
 * constraint, not a nice-to-have:
 *   1. `embedText` (lib/ai/embed.ts) — embeds the question itself. The
 *      SAME embedding call lib/ingestion/ingest.ts already uses for
 *      announcement titles, reused directly rather than a second,
 *      parallel embedding pipeline.
 *   2. `synthesizeAnswer` (lib/ai/answer.ts) — synthesizes the final
 *      answer from whatever relevant context retrieval below found.
 * The retrieval step IN BETWEEN (lib/ask/retrieval.ts's cosine-similarity
 * ranking against every candidate's already-stored `title_embedding`) is
 * plain code — no API call at all, regardless of how many announcements a
 * student has.
 */
export async function askQuestion(question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (trimmed.length < 3) {
    throw new Error("Ask a real question — at least a few characters.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // Privacy: this is deliberately the EXACT SAME RLS-respecting client and
  // unfiltered `announcements` query app/student/dashboard/page.tsx uses
  // (just a narrower column list — see lib/ask/types.ts). Whatever comes
  // back here is, by construction, exactly what this student is allowed
  // to see, enforced by supabase/schema.sql's "announcements readable by
  // own class or shared category" policy at the DATABASE level — not by
  // any filter added in this file, and never the service-role client
  // (unlike the ingestion pipeline). A student's question can never
  // surface an announcement from a class they can't already see on their
  // own dashboard, because this route to the data is the same route.
  const { data: rows, error } = await supabase
    .from("announcements")
    .select(
      "id, category, title, why_it_matters, what_to_do_next, confidence, event_date, start_time, end_time, deadline_at, title_embedding",
    );
  if (error) throw new Error(`Failed to load announcements: ${error.message}`);

  const candidates = (rows ?? []) as AskCandidateRow[];

  // Call 1 of exactly 2.
  const questionEmbedding = await embedText(trimmed);
  if (!questionEmbedding) {
    // Unlike dedup's use of embedText, there's no cheaper fallback path
    // available here — without an embedding for the question itself,
    // there is nothing to retrieve against, so this has to be a real,
    // visible failure rather than a silent degradation.
    throw new AnswerError("Couldn't process that question right now — try again in a moment.");
  }

  // Retrieval: plain code, zero API calls, no matter how many
  // announcements this student has.
  //
  // Real bug found in testing, once the feature actually went live: the
  // relevance threshold (see lib/ask/retrieval.ts's own doc comment) was
  // originally a pure guess, since no live Gemini embeddings were ever
  // available to calibrate it against real question/title pairs before
  // this feature shipped. This log is the calibration mechanism for
  // everything after that: it prints every real candidate's actual
  // cosine-similarity score against every real question asked, in
  // production, going forward — genuinely relevant and clearly irrelevant
  // candidates alike, not just the ones that clear the current threshold
  // (`selectRelevantCandidates` below still makes the real decision; this
  // is read-only diagnostics, not a second, competing decision path). If
  // `ASK_RELEVANCE_THRESHOLD` (currently 0.7) ever needs re-tuning again,
  // the real numbers to tune it against are right here in the server
  // logs, not another guess.
  const ranked = rankBySimilarity(questionEmbedding, candidates);
  console.log(
    "ASK_RETRIEVAL_SCORES",
    JSON.stringify({ question: trimmed, ranked: ranked.map((r) => ({ title: r.candidate.title, score: r.score })) }),
  );
  const relevant = selectRelevantCandidates(questionEmbedding, candidates);

  if (relevant.length === 0) {
    // Deliberately skips the synthesis call entirely — there's nothing
    // relevant to synthesize FROM, so spending the second call anyway
    // would either waste it on a context-free answer or risk Gemini
    // padding out something not actually grounded in this student's real
    // announcements. This keeps the total at ONE call for this outcome,
    // not two — strictly inside the "never more than two" budget, not
    // just at its edge.
    return {
      answer:
        "I don't have anything matching that yet — nothing in your visible announcements looks related to this question.",
      sources: [],
    };
  }

  // Call 2 of exactly 2 — synthesizes the answer from ONLY the retrieved
  // context above. No retry loop, no key rotation (unlike lib/ai/
  // extract.ts's extraction calls): retrying here would itself blow the
  // two-call budget this whole feature is designed around.
  const contextBlock = buildContextBlock(relevant.map((r) => r.candidate));
  const answer = await synthesizeAnswer(trimmed, contextBlock);

  // Which group each cited announcement came from — the same
  // announcement_sources -> messages join app/student/dashboard/page.tsx
  // already does for its own trace-to-source section, scoped down to just
  // the (at most MAX_CONTEXT_ITEMS) announcements actually being cited
  // here, not every announcement this student can see. Two plain Supabase
  // queries through the same RLS client already in scope above — no
  // Gemini call, so this doesn't touch the two-call budget at all.
  // Deliberately degrades gracefully rather than throwing on failure: a
  // missing group-name label is a much smaller loss than losing the
  // synthesized answer this call already paid for.
  const relevantIds = relevant.map((r) => r.candidate.id);
  let sourceGroupNames = new Map<string, string | null>();
  const { data: sourceLinks, error: sourceLinksError } = await supabase
    .from("announcement_sources")
    .select("announcement_id, message_id, created_at")
    .in("announcement_id", relevantIds);

  if (sourceLinksError) {
    console.error("ASK_SOURCE_GROUP_NAME_ERROR", sourceLinksError.message);
  } else {
    const messageIds = [...new Set((sourceLinks ?? []).map((s) => s.message_id as string))];
    const { data: messageRows, error: messagesError } =
      messageIds.length > 0
        ? await supabase.from("messages").select("id, source_group_name").in("id", messageIds)
        : { data: [], error: null };

    if (messagesError) {
      console.error("ASK_SOURCE_GROUP_NAME_ERROR", messagesError.message);
    } else {
      sourceGroupNames = resolveEarliestSourceGroupNames(sourceLinks ?? [], messageRows ?? []);
    }
  }

  return {
    answer,
    sources: relevant.map((r) => ({
      id: r.candidate.id,
      title: r.candidate.title,
      category: r.candidate.category,
      sourceGroupName: sourceGroupNames.get(r.candidate.id) ?? null,
    })),
  };
}
