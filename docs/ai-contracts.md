# AI Prompt Contracts & Schema Specifications
## Campus Announcement Assistant: "What Actually Matters to Me?"

**Authoritative Source:** `docs/product-spec.md` & `docs/architecture.md`  
**AI Role:** Information Extraction, Categorization, and Confidence Assessment Engine  
**Last Updated:** September 14, 2026  

---

## 1. Absolute No-Invention Directives (Zero-Hallucination Policy)

The AI model operates under strict constraints. It is an **information extraction engine**, not an autonomous agent or conversational chatbot.

The model is **programmatically forbidden** from fabricating or assuming:
1. **Dates & Deadlines:** Never guess an ambiguous date. If text states *"submit by tomorrow"*, the date must resolve strictly against the message's explicit timestamp or return `null`.
2. **Times:** Never fill in missing times (e.g. assuming morning or afternoon).
3. **Venues & Rooms:** Never guess room numbers from teacher identities or previous classes.
4. **Seat Counts:** If limited seats are mentioned without an exact number, output `seat_count: null` and set `seat_count_unclear: true`.
5. **Registration Links:** Never fabricate, shorten, or autocomplete URLs.
6. **Course & Section Codes:** Never guess official codes from colloquial names (e.g., *"DBMS class"* must not guess section unless stated).
7. **Registration Status:** Never assume a student has registered or is interested.

---

## 2. Confidence State Taxonomy

Every extracted announcement must be assigned an explicit `confidence_state`:

| State | Badge | Extraction Criteria | Downstream Action |
| :--- | :--- | :--- | :--- |
| `clear` | `✅ Clear` | All operational details (what, when, where/who, next step) are explicitly stated without ambiguity. | Directly published to matching student priority feeds. |
| `partially_clear` | `⚠️ Partially clear` | Core subject is identified, but secondary details (time, venue, deadline date) are missing or relative. | Published with an amber warning badge detailing missing fields in `confidence_notes`. |
| `unclear` | `❓ Unclear` | Crucial operational facts are missing, ambiguous, or the text is a disjointed forward fragment. | Published with a rose warning badge; student is prompted to confirm with Class Rep. |

---

## 3. Untrusted Input Validation Layer

All AI model output is treated as **untrusted structured input**. Before entering the database or deterministic engines, responses are validated against runtime Zod schemas:

```typescript
import { z } from 'zod';

export const ExtractedAnnouncementSchema = z.object({
  category: z.enum([
    'deadline',
    'cancellation_reschedule',
    'event',
    'limited_seat_opportunity',
    'registered_event_update',
    'society_group_link',
    'fyi',
    'duplicate',
    'uncategorized'
  ]),
  secondary_tags: z.array(z.string()).default([]),
  title: z.string().min(3).max(120),
  description: z.string().nullable().optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  deadline_timestamp: z.string().datetime().nullable(),
  location_room: z.string().nullable(),
  course_name: z.string().nullable(),
  course_code: z.string().nullable(),
  faculty_name: z.string().nullable(),
  target_section: z.string().nullable(),
  seat_count: z.number().int().positive().nullable(),
  seat_count_unclear: z.boolean().default(false),
  registration_link: z.string().url().nullable().optional(),
  confidence_state: z.enum(['clear', 'partially_clear', 'unclear']),
  confidence_notes: z.string().nullable(),
  why_it_matters: z.string().min(5).max(180),
  what_to_do_next: z.string().min(3).max(120),
  consequence_tier: z.enum(['critical', 'high', 'medium', 'low', 'unclear'])
});
```

---

## 4. Contract 1: Raw Announcement Stream Extraction

### 4.1 System Prompt
```text
You are the extraction engine for Campus Assistant.
Your task is to analyze unstructured campus messages (e.g. from WhatsApp groups) and extract structured announcements.

STRICT RULES:
1. Extract only facts directly stated in the text.
2. If any field (date, time, room, course code, seat count, link) is missing or unclear, output null.
3. NEVER guess or fabricate values.
4. Categorize each announcement into exactly one primary category:
   ['deadline', 'cancellation_reschedule', 'event', 'limited_seat_opportunity', 'registered_event_update', 'society_group_link', 'fyi', 'duplicate', 'uncategorized'].
5. For confidence_state:
   - 'clear': All necessary operational details are present.
   - 'partially_clear': What is happening is clear, but key operational details (exact time, date, or room) are missing.
   - 'unclear': Message is vague, incomplete, or ambiguous.
6. Provide a concise 1-sentence 'why_it_matters' (the consequence/impact).
7. Provide a single verb-led 'what_to_do_next' (e.g., 'Submit assignment on LMS', 'No action needed').
8. Output MUST strictly match the requested JSON schema.
```

### 4.2 JSON Output Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ExtractionBatchResult",
  "type": "object",
  "properties": {
    "announcements": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "raw_index": { "type": "integer" },
          "category": {
            "type": "string",
            "enum": [
              "deadline",
              "cancellation_reschedule",
              "event",
              "limited_seat_opportunity",
              "registered_event_update",
              "society_group_link",
              "fyi",
              "duplicate",
              "uncategorized"
            ]
          },
          "secondary_tags": {
            "type": "array",
            "items": { "type": "string" }
          },
          "title": { "type": "string" },
          "description": { "type": ["string", "null"] },
          "course_name": { "type": ["string", "null"] },
          "course_code": { "type": ["string", "null"] },
          "faculty_name": { "type": ["string", "null"] },
          "target_section": { "type": ["string", "null"] },
          "event_date": { "type": ["string", "null"] },
          "start_time": { "type": ["string", "null"] },
          "end_time": { "type": ["string", "null"] },
          "deadline_timestamp": { "type": ["string", "null"] },
          "location_room": { "type": ["string", "null"] },
          "seat_count": { "type": ["integer", "null"] },
          "seat_count_unclear": { "type": "boolean" },
          "registration_link": { "type": ["string", "null"] },
          "confidence_state": {
            "type": "string",
            "enum": ["clear", "partially_clear", "unclear"]
          },
          "confidence_notes": { "type": ["string", "null"] },
          "why_it_matters": { "type": "string" },
          "what_to_do_next": { "type": "string" },
          "consequence_tier": {
            "type": "string",
            "enum": ["critical", "high", "medium", "low", "unclear"]
          }
        },
        "required": [
          "category",
          "title",
          "confidence_state",
          "why_it_matters",
          "what_to_do_next",
          "consequence_tier"
        ]
      }
    }
  },
  "required": ["announcements"]
}
```

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
| `duplicate_input` | *"Notice already tracked: Confirmed by 1 additional source."* | Increments `source_count` without creating duplicate card. |
| `unsupported_format` | *"Unsupported file type. Please upload a plain text (.txt) WhatsApp export."* | Rejects upload gracefully. |
| `failed` | *"Extraction failed. Please check network connection and try again."* | Preserves raw text in box for one-click retry. |

---

## 6. Contract 3: Timetable Extraction (Phase 2 — Deferred but Committed)

When parsing schedule images or PDF syllabi:
* Every extracted slot must check for visual clarity.
* If a course name, section, or time is blurred or ambiguous, the entry must return `is_unconfirmed: true` and detail the issue in `unconfirmed_reason`.
* The client UI forces the student to confirm ambiguous entries before they become active ground truth.
