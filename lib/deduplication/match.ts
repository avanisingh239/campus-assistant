import type { AnnouncementCategory } from "@/lib/dashboard/types";
import { classNameTextConfidence } from "@/lib/deterministic/free-slots";
import type { DedupCandidate, DedupFields } from "./types";

/**
 * Feature 2.6, never built until this pass (supabase/schema.sql's own
 * closing notes only ever sketched it as a comment: "deduplication: match
 * on (category + rough date + linked_class_name), not exact text").
 * Deterministic, not AI-judged — Gemini already extracted the candidate
 * fields; everything from here on is plain TypeScript, same
 * pure-function-plus-thin-DB-wrapper shape as lib/deterministic/.
 *
 * A false merge (treating two genuinely different things as the same) is
 * worse than missing a real duplicate — every threshold below is picked to
 * fail toward "create a new announcement," not toward "merge."
 */

/**
 * How far back (in days) `lib/deduplication/sync.ts`'s candidate query
 * looks for a merge target. This is a scale/performance bound only, not a
 * correctness one — the actual "is this the same real-world thing" answer
 * comes entirely from `datesAreClose`/`classOrTitleMatch` below, which
 * already require the two dates to be genuinely close regardless of how far
 * apart the two *messages* were sent. 60 days comfortably covers a
 * semester's worth of the kind of deadline that gets re-announced closer to
 * its due date, without scanning years of history on every ingest.
 */
export const DEDUP_LOOKBACK_DAYS = 60;

/**
 * Categories that are already campus-wide/cross-class by design (the exact
 * set `supabase/schema.sql`'s `"announcements readable by own class or
 * shared category"` RLS policy treats as inherently shared — see that
 * policy's own comment for the full reasoning). Merging two messages from
 * different classes is fine, arguably correct, for these: they were already
 * visible to every student regardless of class before dedup existed, so
 * merging across classes doesn't create a new privacy issue.
 *
 * For every other category (`deadline`, `cancellation`, and the catch-all
 * `fyi`/`duplicate`/`uncategorized`), merging across classes WOULD create
 * one — the RLS policy shows an announcement to a class if ANY linked
 * source's class matches theirs, so a merge that mixes two different
 * classes' sources into one row would make it visible to both, even though
 * the policy itself never changed and is working exactly as designed. This
 * constant must stay in sync with the category list in that RLS policy —
 * if that list ever changes, update this one too.
 */
export const ALWAYS_SHARED_CATEGORIES: ReadonlySet<AnnouncementCategory> = new Set([
  "society_link",
  "event",
  "opportunity",
  "registered_update",
]);

/**
 * `deadline_at` tolerance: two deadlines within 24h of each other are
 * treated as "the same date" for matching purposes, since a real deadline
 * often gets extracted with slightly different rounding depending on how
 * each source phrased it ("end of Friday" vs. "start of Saturday", "by
 * 11:59pm" vs. "by midnight" vs. no time at all defaulting to a boundary).
 * This is a MATCHING tolerance only — it decides "is this plausibly the
 * same deadline," not "do the two sources agree exactly." Even a
 * within-tolerance difference still produces a contradiction (see
 * contradictions.ts) if the two values aren't byte-for-byte the same
 * instant — never silently treating "close enough to merge" as "close
 * enough to agree."
 */
const DEADLINE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * `event_date` (a plain calendar date, no time-of-day ambiguity) requires
 * an exact match — unlike `deadline_at`, there's no rounding/boundary
 * question for "which day is this," so a different day is a genuinely
 * different day, not extraction noise.
 */
function datesAreClose(a: DedupFields, b: DedupFields): boolean {
  if (a.deadline_at && b.deadline_at) {
    const diffMs = Math.abs(new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime());
    return diffMs <= DEADLINE_TOLERANCE_MS;
  }
  if (a.event_date && b.event_date) {
    return a.event_date === b.event_date;
  }
  // Neither side has a comparable date field in common (or one/both are
  // entirely dateless) — conservatively, not close enough to merge. An
  // undated item merging with anything on date grounds alone would be a
  // false-merge risk with no real signal behind it.
  return false;
}

/** Common English function words, stripped before computing title overlap so two titles don't "match" purely on shared filler words. */
const TITLE_STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "for",
  "to", "in", "on", "at", "by", "and", "or", "with", "this", "that", "your",
  "you", "will", "due", "please", "note", "update", "class", "today",
  "tomorrow",
]);

function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !TITLE_STOPWORDS.has(w)),
  );
}

/**
 * Word-overlap similarity, 0-1: plain Jaccard index (`intersection / union`)
 * over each title's stopword-stripped distinct words — a reasonable,
 * deterministic, no-AI-call heuristic per the task's own explicit
 * instruction. An earlier version of this function divided by the SHORTER
 * title's word count instead (to avoid penalizing one title simply being
 * more verbose than the other), but that scored "Library fee deadline" vs.
 * "Hostel fee deadline" — two different fees, one word apart — at 0.67,
 * above the threshold below: a real false-merge risk, and exactly the
 * failure mode the task's own "be conservative" instruction warns about.
 * Standard Jaccard scores that same pair at 0.5 (2 shared words over a
 * 4-word union), correctly below threshold, while still scoring a genuine
 * same-notice paraphrase like "DBMS Assignment 3 Deadline" vs. "DBMS
 * Assignment 3 Deadline Extended to Friday" at 0.6 (3 shared words over a
 * 5-word union) — right at the line, not below it. Union-based scoring
 * naturally penalizes a one-word swap between otherwise-short titles more
 * than it penalizes extra trailing words on an otherwise-fully-contained
 * title, which is the correct asymmetry for this task.
 */
export function titleSimilarity(a: string, b: string): number {
  const wordsA = titleWords(a);
  const wordsB = titleWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

/**
 * 0.6: picked, like the priority-scoring pass's consequence-weight table,
 * as a deliberate product judgment call rather than derived from anything.
 * `titleSimilarity`'s own doc comment walks through the two examples this
 * exact number sits between: low enough to still catch a real
 * same-notice paraphrase with extra trailing words (0.6, right at the
 * line), high enough that two merely-topically-similar titles naming two
 * different actual things, one word apart ("Library fee deadline" vs.
 * "Hostel fee deadline", 0.5), don't clear it. Combined with the
 * date-closeness gate above, which already has to match first — this
 * threshold only has to disambiguate among same-category, same-date
 * candidates, not the whole announcements table.
 */
const TITLE_SIMILARITY_THRESHOLD = 0.6;

/**
 * `linked_class_name` comparison for merge purposes reuses
 * `classNameTextConfidence` (lib/deterministic/free-slots.ts) — the same
 * normalized-text-match function the free-slot engine already uses to
 * decide "is this the same course," rather than a second implementation.
 * Requires an exact match (score 1) here, not the looser "one contains the
 * other" (0.5) the free-slot engine also accepts — a false merge is worse
 * than missing a real duplicate, so this stays on the strict side.
 */
function linkedClassNameMatches(a: DedupFields, b: DedupFields): boolean {
  if (!a.linked_class_name || !b.linked_class_name) return false;
  return classNameTextConfidence(a.linked_class_name, b.linked_class_name) === 1;
}

/**
 * The task's third condition: same `linked_class_name` when both sides
 * have one, OR sufficiently similar title text when they don't (e.g. a
 * campus-wide `event` with no specific course attached). `linked_class_name`
 * is checked first and, if both sides have one, is the ONLY signal used —
 * two announcements about the same course with wildly different titles
 * (e.g. one paraphrased far more than the other) should still be allowed to
 * merge, and requiring title similarity on top would defeat the point of
 * having a more reliable structured signal available.
 */
function classOrTitleMatches(a: DedupFields, b: DedupFields): boolean {
  if (a.linked_class_name && b.linked_class_name) {
    return linkedClassNameMatches(a, b);
  }
  return titleSimilarity(a.title, b.title) >= TITLE_SIMILARITY_THRESHOLD;
}

/**
 * Exact-match normalization for the PRIVACY-critical `submitted_by_class_name`
 * comparison — deliberately NOT `classNameTextConfidence`'s fuzzy
 * substring-aware normalization (that's for matching a free-text course
 * name to a timetable entry, a different field with a different job).
 * This has to mirror the RLS policy's own comparison exactly
 * (`lower(trim(...))`, supabase/schema.sql) — the whole point of this check
 * is "would the RLS policy actually treat these as the same class," so
 * using a looser or stricter normalization here would let this check
 * silently disagree with the policy it exists to protect.
 */
function normalizeClassLabel(label: string): string {
  return label.toLowerCase().trim();
}

/**
 * The privacy guard this pass adds: for any category that isn't in
 * `ALWAYS_SHARED_CATEGORIES`, two candidates may only merge if they also
 * came from the SAME submitting class. Without this, two same-sounding
 * `deadline` announcements from two different classes could merge into one
 * `announcements` row with sources from both classes attached — and the
 * RLS policy's "visible if ANY linked source's class matches" logic would
 * then show it to both classes, correctly per its own logic but wrongly in
 * effect, since the policy was written assuming a class-scoped
 * announcement's sources all belong to one class.
 *
 * Conservative on missing data: if either side has no
 * `submittedByClassName` at all (the null-safe default, and the documented
 * reality for e.g. a `whatsapp_bot` source with no authenticated student to
 * derive a class from), this refuses to merge rather than guessing — same
 * "prefer a new announcement over an incorrect merge" principle as
 * everything else in this file.
 */
function sameSubmittingClass(classA: string | null, classB: string | null): boolean {
  if (!classA || !classB) return false;
  return normalizeClassLabel(classA) === normalizeClassLabel(classB);
}

/**
 * Decides whether `newItem` (with the submitting class it was resolved
 * from, if any — lib/ingestion/ingest.ts already looks this up server-side)
 * is a likely duplicate of any of `candidates`, returning the first match
 * or `null`. Callers (lib/deduplication/sync.ts) are expected to have
 * already scoped `candidates` to the same category and the lookback
 * window — this function re-checks category defensively but does the real
 * date/class-or-title/class-scope decision.
 */
export function findDuplicateMatch(
  newItem: DedupFields,
  newSubmittedByClassName: string | null,
  candidates: DedupCandidate[],
): DedupCandidate | null {
  for (const candidate of candidates) {
    if (candidate.category !== newItem.category) continue;
    if (!datesAreClose(newItem, candidate)) continue;
    if (!classOrTitleMatches(newItem, candidate)) continue;

    if (!ALWAYS_SHARED_CATEGORIES.has(newItem.category)) {
      if (!sameSubmittingClass(newSubmittedByClassName, candidate.submittedByClassName)) continue;
    }

    return candidate;
  }
  return null;
}
