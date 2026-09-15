# Database Schema & Relational Specifications
## Campus Announcement Assistant: "What Actually Matters to Me?"

**Authoritative Source:** `supabase/schema.sql` (the live, already-applied schema)
**Database Engine:** PostgreSQL 15+ (Supabase) with Row-Level Security (RLS)
**Last Updated:** September 14, 2026

> [!IMPORTANT]
> This document previously described an 11-table schema (`users`, `timetable_entries`, `raw_messages`, `announcements`, ...) that was never applied to any database. That design is **superseded**. The tables below are the real, live schema — `supabase/schema.sql` in this repo is a verbatim copy of what's actually running in Supabase, and is the single source of truth. This file is a narrative walkthrough of that schema, not an independent spec — if the two ever disagree, `supabase/schema.sql` wins and this file needs to be updated to match.

---

## 1. Entity-Relationship Overview

```
┌──────────────────┐       1:N       ┌────────────────────────┐
│      profiles     ├─────────────────┤   timetable_entries    │
│ (extends           │                 └────────────────────────┘
│  auth.users)        │
└────────┬─────────┘
         │
         │ 1:N              ┌────────────────────┐
         ├──────────────────┤    admin_scopes     ├──── society_id ──► societies
         │                  └────────────────────┘
         │
         │ 1:N                       1:N  ┌────────────────────┐
         │                                │      messages       │
         │                                └─────────┬──────────┘
         │                                          │ 1:N (announcement_sources)
         │                                          ▼
         │                           ┌────────────────────────┐
         │                           │      announcements      │
         │                           └──────┬───────┬─────────┘
         │                                  │       │ 1:N
         │ 1:N                              │ 1:N   ▼
         ▼                                  │   ┌────────────────────┐
┌─────────────────────────────┐             │   │   contradictions   │
│ student_announcement_status │◄────────────┤   └────────────────────┘
└─────────────────────────────┘             │
         │ 1:N                              │ 1:N
         ▼                                  ▼
┌────────────────────────┐           ┌────────────────────────┐
│        clashes         │           │       free_slots       │
└────────────────────────┘           └────────────────────────┘

┌────────────────────────┐
│       last_seen        │  1:1 with profiles (student_id is PK)
└────────────────────────┘
```

---

## 2. Enums

| Enum | Values | Used by |
| :--- | :--- | :--- |
| `user_role` | `student`, `admin` | `profiles.role` |
| `announcement_category` | `deadline`, `cancellation`, `event`, `opportunity`, `registered_update`, `society_link`, `fyi`, `duplicate`, `uncategorized` | `announcements.category` |
| `confidence_level` | `clear`, `partial`, `unclear` | `announcements.confidence` |
| `interest_status` | `none`, `interested`, `not_interested`, `registered` | `student_announcement_status.status` |
| `clash_type` | `class_vs_class`, `class_vs_event`, `event_vs_event` | `clashes.clash_type` |
| `clash_severity` | `possible`, `confirmed` | `clashes.severity`, `free_slots.status` |
| `admin_scope_type` | `class`, `society` | `admin_scopes.scope_type` |
| `source_type` | `paste`, `whatsapp_export`, `admin_form` | `messages.source_type` |

> [!IMPORTANT]
> **Category naming has changed from earlier drafts.** The 9-category taxonomy in `docs/ai-contracts.md` and `docs/product-spec.md` used names like `cancellation_reschedule`, `limited_seat_opportunity`, `registered_event_update`, and `society_group_link`. The live enum uses shorter names: `cancellation`, `opportunity`, `registered_update`, `society_link`. Any code, prompt, or Zod schema producing a `category` value must use the **real enum values** listed above, not the earlier doc's longer names.

---

## 3. Tables

### 3.1 `profiles`
Extends `auth.users` — Supabase Auth owns `auth.users` and this table is auto-populated by the `handle_new_user()` trigger on signup, reading `role` / `full_name` / `class_name` out of the signup call's `options.data` metadata.

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` PK | = `auth.users.id` |
| `role` | `user_role` | defaults `'student'` |
| `full_name` | `text` | |
| `class_name` | `text` | e.g. `"CSE-2028-A"` — relevant for students and CR (class-scoped) admins |
| `created_at` | `timestamptz` | |

RLS: a user can `select`/`update` only their own row (`auth.uid() = id`).

### 3.2 `admin_scopes`
An admin's scope is **assigned, never self-selected** (5.2). One admin may have one or more scope rows.

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK → `profiles` | |
| `scope_type` | `admin_scope_type` | `class` or `society` |
| `class_name` | `text` | set when `scope_type = 'class'` |
| `society_id` | `uuid` FK → `societies` | set when `scope_type = 'society'` |
| `created_at` | `timestamptz` | |

RLS is enabled on this table but no policy is defined in `supabase/schema.sql` yet — until one is added, only the service role can read/write it. Don't assume admins can read their own scope client-side; fetch it server-side.

### 3.3 `timetable_entries` (1.4)
Ground truth for a student's weekly schedule.

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` PK | |
| `student_id` | `uuid` FK → `profiles` | |
| `day_of_week` | `int` | `0`–`6`, configurable start day — **not hardcoded Mon–Sun** |
| `start_time` / `end_time` | `time` | |
| `course_name` | `text` | not null |
| `section` | `text` | |
| `teacher_name` | `text` | |
| `teacher_name_confirmed` | `boolean` | defaults `true`; `false` when AI-parsed and unclear (Phase 2 OCR path) |
| `created_at` | `timestamptz` | |

RLS: `student manages own timetable` — full access where `auth.uid() = student_id`.

### 3.4 `societies`
Simple lookup table: `id`, `name` (unique), `created_at`. `admin_scopes.society_id` FKs into it. No RLS policy is defined yet (RLS is **not** enabled on this table in the current schema — treat it as a small public reference table for now).

### 3.5 `messages` (raw ingestion, 1.1–1.3)
Verbatim source text. This is the privacy-sensitive table — see §4.

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` PK | |
| `raw_text` | `text` | not null |
| `source_group_name` | `text` | e.g. `"CSE-2028-A"`, `"Photography Society"` |
| `source_type` | `source_type` | `paste` \| `whatsapp_export` \| `admin_form` |
| `submitted_by` | `uuid` FK → `profiles` | set for `admin_form` submissions (5.1); null for anonymous/unauthenticated paste flows |
| `created_at` | `timestamptz` | |

RLS: `messages readable by authenticated users` (`select` only, `auth.role() = 'authenticated'`). **There is no INSERT policy** — writes go through the service-role client only (see §4).

### 3.6 `announcements` (AI-parsed structured items, 2.1–2.7)
The canonical entity every student-facing card renders from.

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` PK | |
| `category` | `announcement_category` | not null |
| `title` | `text` | not null |
| `why_it_matters` / `what_to_do_next` | `text` | (3.1) |
| `confidence` | `confidence_level` | not null, defaults `'unclear'` (2.7) |
| `confidence_note` | `text` | e.g. `"consequence unclear"` |
| `event_date` | `date` | |
| `start_time` / `end_time` | `time` | |
| `deadline_at` | `timestamptz` | |
| `linked_class_name` | `text` | for matching cancellations to a timetable entry; may be null/unconfirmed |
| `match_confidence` | `numeric` | fuzzy-match confidence for timetable linking |
| `seat_count` | `int` | null if "limited seats" mentioned with no number (4.3) |
| `seats_unclear` | `boolean` | not null, default `false` |
| `link_url` | `text` | (4.4) |
| `link_verified` | `boolean` | not null, default `true`; `false` if malformed/suspicious |
| `urgency_score` | `numeric` | **deterministic**, not AI judgment (2.2) |
| `consequence_weight` | `numeric` | from a hardcoded lookup table keyed by category |
| `priority_score` | `numeric`, **generated** | `coalesce(urgency_score,0) * coalesce(consequence_weight,1)`, stored — recomputes automatically whenever the two inputs change |
| `created_at` / `updated_at` | `timestamptz` | |

RLS: `select` was originally open to any `authenticated` user (a fully global shared feed) — a real cross-student privacy bug found in testing (a student could see every other class's cancellation/deadline announcements), fixed by scoping `select` to the viewing student's own class (matched via `messages.source_group_name` against `profiles.class_name`) plus a fixed set of inherently cross-class categories (`society_link`, `event`, `opportunity`, `registered_update`) — see CLAUDE.md's §Cross-student data isolation for the full reasoning and the exact policy. `insert` is restricted to rows where the caller's `profiles.role = 'admin'` — **note this only checks role, not scope**; scope-matching (does this admin's `class_name`/`society_id` match the announcement they're posting) is application-level, enforced in the code path that handles `admin_form` submissions, not in SQL.

### 3.7 `announcement_sources`
Junction table linking merged raw messages to one canonical announcement — powers trace-to-source (3.3) and deduplication (2.6).

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` PK | |
| `announcement_id` | `uuid` FK → `announcements` | cascade delete |
| `message_id` | `uuid` FK → `messages` | cascade delete |
| `extracted_fields` | `jsonb` | what *this* source said, e.g. `{"date": "2025-05-05"}` |
| `created_at` | `timestamptz` | |

RLS: `select` open to any `authenticated` user, added in the Student Dashboard pass (⚠️ pending a live migration — see `CLAUDE.md` §Student Dashboard for the exact SQL) — needed for the trace-to-source drawer and the "Confirmed by N sources" tag. No insert/update/delete policy; writes still go through the service-role client (the ingestion pipeline).

### 3.8 `contradictions` (3.2)
Never silently pick one version when merged sources disagree.

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` PK | |
| `announcement_id` | `uuid` FK → `announcements` | |
| `field_name` | `text` | e.g. `"deadline_at"` |
| `conflicting_values` | `jsonb` | `[{ "value": "2025-05-05", "source_message_id": "..." }, ...]` |
| `resolved` | `boolean` | default `false` |
| `created_at` | `timestamptz` | |

RLS: `select` open to any `authenticated` user, same addition and same reasoning as `announcement_sources` above — needed for the contradiction banner. No insert/update/delete policy.

### 3.9 `student_announcement_status` (4.1)
Per-student interest/registration state, one row per `(student_id, announcement_id)` pair (unique constraint).

RLS: `student manages own status` — full access where `auth.uid() = student_id`.

### 3.10 `clashes` (2.4) — deterministic, not AI
`clash_type` covers all three overlap kinds. `timetable_entry_id`, `announcement_id`, and `other_announcement_id` (for `event_vs_event`) are all nullable FKs depending on which two things are clashing. `severity` is `possible` or `confirmed`.

RLS: `student reads own clashes` — `select` only where `auth.uid() = student_id`. (No insert/update policy — clash rows are written by the deterministic engine via the service-role client.)

### 3.11 `free_slots` (2.5)
Opened when a `timetable_entries` row is cancelled; `matched_announcement_id` points at the opportunity that fits the freed gap. `status` reuses the `clash_severity` enum (`possible`/`confirmed`).

RLS: `student reads own free slots` — `select` only where `auth.uid() = student_id`.

### 3.12 `last_seen` (4.5 — "What Changed" diff)
One row per student (`student_id` is the PK), holding `last_seen_at`. This is the diff-banner watermark, replacing the earlier draft's `users.last_seen_at` column.

RLS: `student manages own last_seen` — full access where `auth.uid() = student_id`.

---

## 4. Privacy & Write-Access Model

The most important invariant in the whole schema:

- **`messages` has a `select` policy but no `insert` policy for the `authenticated` role.** Combined with the comment in `supabase/schema.sql` ("write access restricted to service role ... except admin_form submissions"), this means: **the ingestion pipeline (paste, chat-export, and non-admin-form flows) must write through a service-role Supabase client on the server**, never through the browser/anon client. See `lib/supabase/admin.ts`.
- Likewise, `announcements`, `announcement_sources`, `contradictions`, `clashes`, and `free_slots` either have no insert policy or only a role-gated one — the deterministic engine and the AI-extraction pipeline both need to run server-side with the service-role client, then let students read the results through the normal `select` policies.
- Everything under a student's own id (`timetable_entries`, `student_announcement_status`, `clashes`, `free_slots`, `last_seen`) is strictly private to `auth.uid()`.
- `admin_scopes` has RLS **enabled** but **no policy defined yet** in the live schema — until one is added, only the service role can touch it. Don't build a client-side feature that assumes an authenticated admin can read their own scope directly; go through a server action/route handler. `announcement_sources` and `contradictions` were in the same state until the Student Dashboard pass added a `select`-for-`authenticated` policy to both (⚠️ still pending a live migration — see `CLAUDE.md` §Student Dashboard) — they're metadata on already-public announcements, not private per-user data like `admin_scopes` is, so a broad read policy is the right shape for them, not a server-side-only pattern.

---

## 5. Deterministic vs. AI write boundaries (mirrors `supabase/schema.sql`'s closing notes)

The AI layer (currently Gemini, see `docs/ai-contracts.md` — this boundary held unchanged through the Claude→Gemini provider swap and would hold through another one) is only ever allowed to populate: `category`, `title`, `why_it_matters`, `what_to_do_next`, `confidence`, `confidence_note`, the extracted date/time fields (`event_date`, `start_time`, `end_time`, `deadline_at`), `linked_class_name`, `seat_count`/`seats_unclear`, `link_url`, and `match_confidence` (fuzzy timetable-linking confidence). It never writes `urgency_score`, `consequence_weight`, or decides `clashes`/`free_slots` rows — those come from the deterministic layer reading the AI's validated structured output. (Note: `supabase/schema.sql`'s own trailing comments still say "Claude" — that file is a verbatim copy of the applied migration and isn't rewritten for provider changes; this doc is the one kept in sync by hand.)

- **Clash detection** — **implemented**, `lib/deterministic/clashes.ts` + `lib/deterministic/sync.ts`: interval overlap on `start_time`/`end_time` (`start1 < end2 and start2 < end1`), covering all three clash types (class_vs_class, class_vs_event, event_vs_event) with the interest-gating and severity rules from `docs/requirements-traceability.md` Feature 2.4. Runs as plain TypeScript in `lib/`, not a Postgres function/Edge Function — see the note below.
- **Free-slot matching** — **implemented**, `lib/deterministic/free-slots.ts` + `lib/deterministic/sync.ts`: the same overlap check, against a slot opened by a `cancellation` announcement matched to a student's timetable by course name (respecting the AI's `match_confidence`, not treating a low-confidence match as certain).
- **Deduplication**: match on `(category + rough date + linked_class_name)`, not exact text. **Not implemented yet.**
- **`priority_score`**: already a generated column (`urgency_score * consequence_weight`); `consequence_weight` should come from a hardcoded lookup table keyed by `category` (fee deadline > exam > registration deadline > optional workshop), never from an AI call. **Not implemented yet.**
- **Time-decay re-ranking (2.3)**: a scheduled job recalculating `urgency_score` as deadlines approach; `priority_score` updates automatically since it's generated. **Not implemented yet.**

**Where the implemented pieces live, and why not a Postgres function/Edge Function:** `supabase/schema.sql`'s own closing notes say this logic "belongs in Postgres functions or Supabase Edge Functions" — contrasting with putting it in an AI prompt, which is the point that actually matters, not a literal mandate for SQL/Deno over application code. This repo has no Postgres-function or Edge-Function infrastructure at all (no `supabase/functions/`, no migration tooling beyond the single `schema.sql` dump), and `docs/architecture.md`'s own MVP architecture line already calls for "In-memory/Node.js deterministic engines" — so clash detection and free-slot matching are plain TypeScript in `lib/deterministic/`, following the same pure-function-plus-thin-DB-wrapper-plus-colocated-tests shape as `lib/ingestion/map-to-announcement.ts`. `lib/deterministic/clashes.ts`/`free-slots.ts`/`overlap.ts` are pure (no DB access, fully unit-tested); `lib/deterministic/sync.ts` fetches/writes through whichever Supabase client its caller passes it (always the service-role client in practice — `clashes`/`free_slots` have no INSERT/UPDATE/DELETE policy for `authenticated`, see §4 above).

**Trigger points** (docs/requirements-traceability.md's "when does this run" isn't itself specified, so this is this implementation's own design): `syncFreeSlotsForCancellation`/`matchAnnouncementToOpenFreeSlots` run from `lib/ingestion/ingest.ts` right after a new `cancellation`/`event`/`opportunity` announcement is inserted. `syncClashesForStudent` recomputes *all* of one student's clashes from scratch (delete + reinsert) and runs from `lib/timetable/actions.ts` (after a timetable entry is added/edited/deleted) and `lib/engagement/actions.ts` (after an interest/registration status changes) — both new Server Actions with no UI calling them yet, since neither existed before this needed a real trigger point (see CLAUDE.md). It deliberately does **not** run from the ingestion pipeline: a brand-new announcement has zero `student_announcement_status` rows, so it cannot produce a class_vs_event/event_vs_event clash the instant it's created.

**One decision this implementation had to make that the spec left open:** `timetable_entries.day_of_week` is documented only as "0-6, configurable start day, not hardcoded Mon-Sun," but nothing anywhere configures it. `lib/deterministic/overlap.ts`'s `dayOfWeekFromDate` uses `Date.getUTCDay()`'s own numbering (0=Sunday) as the only unambiguous default available. If a configurable week start is ever added, that's the one function that needs to change.

Deduplication, priority scoring, and the time-decay cron are still just the notes above and in `supabase/schema.sql` — not implemented.
