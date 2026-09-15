# AI Prompt Contracts & Schema Specifications
## Campus Announcement Assistant: "What Actually Matters to Me?"

**Authoritative Source:** `docs/product-spec.md`, `docs/architecture.md` & `supabase/schema.sql`
**AI Provider:** Google Gemini (`@google/genai`) — see `lib/ai/gemini.ts`
**AI Role:** Information Extraction, Categorization, and Confidence Assessment Engine
**Last Updated:** September 14, 2026

> [!IMPORTANT]
> This document has gone through two provider changes. It originally specified Google Gemini 1.5 Flash with a field set (`course_code`, `faculty_name`, `target_section`, `location_room`, `registration_link`, `confidence_state: 'partially_clear'`, `consequence_tier`) that doesn't match any column in the live database — that field set was corrected in §3 (see its callout for exactly what changed) when the provider was briefly switched to the Claude API. **The provider is now Gemini again** — a deliberate, cost-driven choice to stay on Gemini's free tier during a hackathon (see `CLAUDE.md`), not a reversion of the §3 field-set fix, which still stands. The Zod schema in §3 is unchanged by either provider swap; only §4 (the model call itself) differs.

---

## 1. Absolute No-Invention Directives (Zero-Hallucination Policy)

The AI model operates under strict constraints. It is an **information extraction engine**, not an autonomous agent or conversational chatbot.

The model is **programmatically forbidden** from fabricating or assuming:
1. **Dates & Deadlines:** Never guess an ambiguous date. If text states *"submit by tomorrow"* or *"due Friday"*, the date must resolve against a real anchor — the message's own explicit timestamp if it states one, otherwise the extraction request's current date (see §4.2's `CONTEXT` block, added after a real extraction silently dropped a "submit by Friday" deadline: with no anchor date at all, the model correctly had nothing to resolve "Friday" against and emitted `null` instead of guessing, exactly as this rule requires — the fix was giving it an anchor, not relaxing the rule). If neither anchor makes the reference resolvable, return `null`.
2. **Times:** Never fill in missing times (e.g. assuming morning or afternoon).
3. **Seat Counts:** If limited seats are mentioned without an exact number, output `seat_count: null` and set `seats_unclear: true`.
4. **Links:** Never fabricate, shorten, or autocomplete URLs. Extract `link_url` only if a literal URL string appears in the source text.
5. **Class/Section Matching:** `linked_class_name` and `match_confidence` describe the model's best-effort *candidate* string for matching this announcement to a `timetable_entries.course_name` — never invent a course/section that isn't named or clearly implied in the text (e.g. by a colloquial teacher nickname the message itself supplies). The deterministic layer, not the model, decides whether the match is used.
6. **Registration Status:** Never assume a student has registered or is interested.

> **Known schema gap — room/venue text:** the live `announcements` table has **no dedicated room/location column** (see `docs/data-model.md` §3.6). If the source text names a room or venue, do not invent a field for it — fold it into `title` (if central to the headline, e.g. *"Guest Lecture — Room 204"*) or `confidence_note` (if it's a supporting detail), and never drop it silently. Flag to the user if this matters for your use case — a future schema migration may add a structured column.

---

## 2. Confidence State Taxonomy

Every extracted announcement must be assigned an explicit `confidence`, matching the `confidence_level` enum in `supabase/schema.sql`:

| State | Badge | Extraction Criteria | Downstream Action |
| :--- | :--- | :--- | :--- |
| `clear` | `✅ Clear` | All operational details (what, when, where/who, next step) are explicitly stated without ambiguity. | Directly published to matching student priority feeds. |
| `partial` | `⚠️ Partially clear` | Core subject is identified, but secondary details (time, date, class match) are missing or relative. | Published with an amber warning badge; `confidence_note` explains what's missing. |
| `unclear` | `❓ Unclear` | Crucial operational facts are missing, ambiguous, or the text is a disjointed forward fragment. | Published with a rose warning badge; student is prompted to confirm with Class Rep. |

---

## 3. Untrusted Input Validation Layer

All AI model output is treated as **untrusted structured input**. Before entering the database or deterministic engines, responses are validated against a runtime Zod schema. This schema (implemented in `lib/ai/extraction-schema.ts`) mirrors the `announcements` table column-for-column:

```typescript
import { z } from "zod";

export const ExtractedAnnouncementSchema = z.object({
  // matches announcement_category enum in supabase/schema.sql
  category: z.enum([
    "deadline",
    "cancellation",
    "event",
    "opportunity",
    "registered_update",
    "society_link",
    "fyi",
    "duplicate",
    "uncategorized",
  ]),
  title: z.string().min(3).max(120),
  why_it_matters: z.string().min(5).max(180).nullable(),
  what_to_do_next: z.string().min(3).max(120).nullable(),

  // matches confidence_level enum
  confidence: z.enum(["clear", "partial", "unclear"]),
  confidence_note: z.string().nullable(),

  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  deadline_at: z.string().datetime().nullable(),

  linked_class_name: z.string().nullable(),
  match_confidence: z.number().min(0).max(1).nullable(),

  seat_count: z.number().int().positive().nullable(),
  seats_unclear: z.boolean().default(false),

  link_url: z.string().url().nullable(),
});
```

**What changed from the earlier draft of this doc**, so nobody re-introduces it by accident:
- Removed `course_code`, `faculty_name`, `target_section`, `location_room`, `registration_link`, `seat_count_unclear`, `consequence_tier` — none of these are columns on the live `announcements` table. `registration_link` → `link_url`; `seat_count_unclear` → `seats_unclear`.
- `confidence_state` → `confidence`; its `partially_clear` value → `partial` (matches the real `confidence_level` enum).
- `confidence_notes` → `confidence_note` (singular, matches the real column).
- The 9-category enum values are shorter in the real schema: `cancellation_reschedule` → `cancellation`, `limited_seat_opportunity` → `opportunity`, `registered_event_update` → `registered_update`, `society_group_link` → `society_link`.
- `deadline_timestamp` → `deadline_at`.
- `consequence_tier` is gone from the AI contract entirely — `urgency_score`/`consequence_weight`/`priority_score` are deterministic-engine-only fields (see `docs/data-model.md` §5); the AI never estimates a consequence tier.

---

## 4. Contract 1: Raw Announcement Stream Extraction (Google Gemini)

### 4.1 Model & call shape

Implemented in `lib/ai/extract.ts` via `client.models.generateContent()` (the `@google/genai` SDK, model `gemini-3.6-flash` — see `lib/ai/gemini.ts` for why it's not `gemini-2.5-flash`, the SDK's own README example model, which Google retired for new API keys shortly after this pipeline was first wired up), with `config.responseMimeType: "application/json"` and `config.responseJsonSchema` set to a JSON Schema generated from `ExtractionBatchSchema` via Zod's own `z.toJSONSchema()`.

**This is a best-effort schema hint, not a guarantee** — Gemini's `responseJsonSchema` only honors a subset of JSON Schema (no `minLength`/`maxLength`/`pattern`; see the SDK's own type comments for the exact supported-keyword list). The response is still parsed as JSON and re-validated against the full `ExtractionBatchSchema` in `lib/ai/extract.ts` before it's returned, and `lib/ingestion/ingest.ts` re-validates each item again before insert — that Zod validation, not Gemini's schema support, is the actual safety net (same defense-in-depth principle as before, just with the schema-conformance work shifted more onto the Zod layer since the model-side guarantee is weaker than the Claude API's `messages.parse()` gave).

**Rate limits:** Gemini's free tier caps requests at roughly 10/minute. `lib/ai/extract.ts` retries a 429 or 503 response up to twice with exponential backoff (1s, 2s) before throwing a `RateLimitError` whose message is meant to be shown to the user directly (see `app/(dev)/ingest-test/page.tsx`).

### 4.2 System Prompt
Built per-request by `buildSystemPrompt(now)` in `lib/ai/extract.ts` (not a static string) so the `CONTEXT` block below always carries the real date of the extraction request — see that function's doc comment for why: without an anchor date, Gemini has no basis for resolving a relative reference like "Friday" into the concrete `event_date`/`deadline_at` the schema requires, and rule 3 correctly makes it emit `null` rather than guess. Shown here with a placeholder date/weekday:
```text
You are the extraction engine for Campus Assistant.
Your task is to analyze unstructured campus messages (e.g. from WhatsApp groups) and extract structured announcements.

CONTEXT:
Today's date is 2026-09-15 (a Tuesday). Use this to resolve relative day/time references in the text —
"today", "tomorrow", "Friday", "next Monday", "in 3 days", etc. — into concrete event_date (YYYY-MM-DD) and
deadline_at values. Resolving a clearly-stated relative reference this way is extraction, not guessing — rule 3
below only forbids inventing a date the text gives no basis for at all.

STRICT RULES:
1. Extract only facts directly stated in the text, resolving relative dates/times against today's date per CONTEXT above.
2. If any field (date, time, class/section match, seat count, link) is missing or cannot be resolved even with today's date, output null.
3. NEVER guess or fabricate a date or value the text gives no basis for.
4. Categorize each announcement into exactly one primary category:
   ['deadline', 'cancellation', 'event', 'opportunity', 'registered_update', 'society_link', 'fyi', 'duplicate', 'uncategorized'].
5. For confidence:
   - 'clear': All necessary operational details are present.
   - 'partial': What is happening is clear, but key operational details (exact time, date, or class match) are missing.
   - 'unclear': Message is vague, incomplete, or ambiguous.
6. Provide a concise 1-sentence 'why_it_matters' (the consequence/impact), or null if none applies.
7. Provide a single verb-led 'what_to_do_next' (e.g., 'Submit assignment on LMS', 'No action needed'), or null.
8. If the message names a class, course, or section that might match a student's timetable, set 'linked_class_name'
   to that name verbatim and 'match_confidence' to your confidence (0-1) that it identifies a specific class —
   do not guess a class that isn't named or clearly implied.
9. Output MUST strictly match the requested JSON schema. Respond with JSON only — no prose, no markdown fences.
10. A single raw_text payload may contain many forwarded messages concatenated together — extract one
    announcement per distinct notice, not one per input message; unrelated chatter and system lines produce no
    announcement at all.
```

### 4.3 Output shape
The batch response is `{ announcements: ExtractedAnnouncement[] }`, where each item matches §3's `ExtractedAnnouncementSchema`. See `lib/ai/extraction-schema.ts` for the exact Zod definition and `lib/ai/extract.ts` for the Gemini call.

---

## 5. Contract 2: Ingestion States & User Feedback

The ingestion pipeline surfaces standardized user-visible states:

| Ingestion State | User-Facing Display Message | System Action |
| :--- | :--- | :--- |
| `empty` | *"Paste a batch of forwarded messages or upload a WhatsApp chat export to organize."* | Text area ready for input. |
| `ready` | *"Payload detected (1,420 characters). Click Parse."* | Parse button enabled. |
| `processing` | *"Extracting entities, checking confidence, and detecting clashes..."* | Shimmer loading indicator active. |
| `successfully_parsed` | *"Successfully extracted 4 clear announcements."* | Render cards directly into preview feed. |
| `partially_parsed` | *"Extracted 3 announcements. 1 notice has missing details (marked Partially Clear)."* | Highlights confidence badge on affected card. |
| `needs_clarification` | *"1 message could not be categorized. Saved to Uncategorized."* | Renders catch-all card with manual edit option. |
| `duplicate_input` | *"Notice already tracked: Confirmed by 1 additional source."* | Links a new `announcement_sources` row to the existing announcement instead of creating a duplicate card. |
| `unsupported_format` | *"Unsupported file type. Please upload a plain text (.txt) WhatsApp export."* | Rejects upload gracefully. |
| `failed` | *"Extraction failed. Please check network connection and try again."* / *"Gemini's free tier only allows a few requests per minute — please wait a moment and try again."* | Preserves raw text in box for one-click retry. |

The scaffolded pipeline (`lib/ingestion/ingest.ts`) currently implements `empty`/`ready` → `processing` → `successfully_parsed`/`partially_parsed`/`failed`. Deduplication (`duplicate_input`) and the `needs_clarification` catch-all UI are not wired yet — see `docs/data-model.md` §5 for what deduplication needs (it's a deterministic-layer feature, not an AI one). The second `failed` message above is Gemini-specific (`RateLimitError` from `lib/ai/extract.ts`, after retries are exhausted) — worth a distinct message since it's an expected, recoverable condition on the free tier, not a bug.

---

## 6. Contract 3: Timetable Extraction (Phase 2 — Deferred but Committed)

When parsing schedule images or PDF syllabi:
* Every extracted slot must check for visual clarity.
* If a course name, section, or time is blurred or ambiguous, the entry must return `teacher_name_confirmed: false` (matches the real `timetable_entries.teacher_name_confirmed` column) and detail the issue in an accompanying note.
* The client UI forces the student to confirm ambiguous entries before they become active ground truth.

Still deferred — no OCR call is implemented in this pass.
