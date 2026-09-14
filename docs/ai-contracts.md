# AI Prompt Contracts & Schema Specifications
## Campus Announcement Assistant: "What Actually Matters to Me?"

**Authoritative Source:** `docs/product-spec.md`, `docs/architecture.md` & `supabase/schema.sql`
**AI Provider:** Claude API (Anthropic) — see `lib/ai/claude.ts`
**AI Role:** Information Extraction, Categorization, and Confidence Assessment Engine
**Last Updated:** September 14, 2026

> [!IMPORTANT]
> This document previously specified Google Gemini 1.5 Flash as the extraction model, and a field set (`course_code`, `faculty_name`, `target_section`, `location_room`, `registration_link`, `confidence_state: 'partially_clear'`, `consequence_tier`) that doesn't match any column in the live database. Both are now corrected: **the extraction model is the Claude API**, and **the schema below matches `supabase/schema.sql`'s `announcements` table exactly** — see the callout in §3 for what changed and why.

---

## 1. Absolute No-Invention Directives (Zero-Hallucination Policy)

The AI model operates under strict constraints. It is an **information extraction engine**, not an autonomous agent or conversational chatbot.

The model is **programmatically forbidden** from fabricating or assuming:
1. **Dates & Deadlines:** Never guess an ambiguous date. If text states *"submit by tomorrow"*, the date must resolve strictly against the message's explicit timestamp or return `null`.
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

## 4. Contract 1: Raw Announcement Stream Extraction (Claude API)

### 4.1 Model & call shape

Implemented in `lib/ai/extract.ts` via `client.messages.parse()` with `zodOutputFormat(ExtractionBatchSchema)` (Anthropic TypeScript SDK) — the SDK validates Claude's JSON against the Zod schema before your code ever sees it; `lib/ingestion/ingest.ts` re-validates each item before insert as a second, independent guard rail (defense in depth, not redundant plumbing — the two live in different modules and either one failing closed is enough to stop bad data).

### 4.2 System Prompt
```text
You are the extraction engine for Campus Assistant.
Your task is to analyze unstructured campus messages (e.g. from WhatsApp groups) and extract structured announcements.

STRICT RULES:
1. Extract only facts directly stated in the text.
2. If any field (date, time, class/section match, seat count, link) is missing or unclear, output null.
3. NEVER guess or fabricate values.
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
9. Output MUST strictly match the requested JSON schema.
```

### 4.3 Output shape
The batch response is `{ announcements: ExtractedAnnouncement[] }`, where each item matches §3's `ExtractedAnnouncementSchema`. See `lib/ai/extraction-schema.ts` for the exact Zod definition and `lib/ai/extract.ts` for the Claude call.

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
| `failed` | *"Extraction failed. Please check network connection and try again."* | Preserves raw text in box for one-click retry. |

The scaffolded pipeline (`lib/ingestion/ingest.ts`) currently implements `empty`/`ready` → `processing` → `successfully_parsed`/`partially_parsed`/`failed`. Deduplication (`duplicate_input`) and the `needs_clarification` catch-all UI are not wired yet — see `docs/data-model.md` §5 for what deduplication needs (it's a deterministic-layer feature, not an AI one).

---

## 6. Contract 3: Timetable Extraction (Phase 2 — Deferred but Committed)

When parsing schedule images or PDF syllabi:
* Every extracted slot must check for visual clarity.
* If a course name, section, or time is blurred or ambiguous, the entry must return `teacher_name_confirmed: false` (matches the real `timetable_entries.teacher_name_confirmed` column) and detail the issue in an accompanying note.
* The client UI forces the student to confirm ambiguous entries before they become active ground truth.

Still deferred — no OCR call is implemented in this pass.
