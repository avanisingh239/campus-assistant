# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This repository currently contains **specifications only — no application code has been written yet**. There is no `package.json`, no Next.js project, no Supabase migrations, and no tests. `README.md`, `GEMINI.md`, `.env.example`, and `supabase/seed.sql` all exist but are empty placeholders. Git history is three "docs:" commits.

Before writing any code, read the docs below — they are the **authoritative, approved spec** for what to build. Do not invent features, routes, or schema fields that aren't described in them; where a doc marks something `Unresolved` or `Deferred but Committed`, treat it as explicitly out of scope until the user says otherwise.

Because there is no scaffold yet, **there are no build/lint/test commands to run**. The first implementation task will be scaffolding the Next.js 15 (App Router) + TypeScript + Supabase project described in `docs/architecture.md`. Once that scaffold exists, update this file with the real build/lint/test/dev commands.

## Authoritative docs (read in this order)

- `docs/product-spec.md` — product philosophy, full screen/feature breakdown for Student and Admin experiences, MVP vs. Phase 2 vs. Stretch phasing table, and the list of **Unresolved Product Decisions** (enrollment verification, cross-section cancellations, raw-message retention policy) that must not be implemented until resolved.
- `docs/architecture.md` — the system diagram, Next.js route tree, component/drawer layer, and the strict AI/deterministic boundary (see below).
- `docs/data-model.md` — full Postgres DDL for all 11 tables plus RLS policies. This is the canonical schema; implement it as-is rather than re-deriving it.
- `docs/ai-contracts.md` — the exact system prompt, Zod schema, and JSON schema the extraction AI must conform to, plus the 9 ingestion UI states and their user-facing copy.
- `docs/requirements-traceability.md` — maps every feature ID to its screen, DB impact, AI vs. deterministic responsibility, and acceptance criteria. Useful as a checklist when implementing a feature.
- `docs/figma-screen-inventory.md` — per-screen component inventory tagged `Requirement` / `Approved Product Decision` / `Proposed Addition — Requires Approval` / `Design Suggestion` / `Unresolved`. Only `Requirement` and `Approved Product Decision` items are committed; don't build `Proposed Addition` items without asking.
- `docs/feature-list (1).docx` — original source-of-truth feature list referenced by the other docs (binary; read via the docx skill if content is needed).

`docs/decision-log.md`, `docs/security-model.md`, and `docs/testing-strategy.md` are currently empty — check them for content before assuming there's no guidance there, since they may be filled in later.

## Core architectural rule: AI extracts, deterministic code decides

This is the single most important constraint in the whole system and governs how any backend code must be split:

- **AI (Gemini 1.5 Flash via a Next.js Server Action) is only allowed to:** classify text into the fixed 9-category taxonomy, extract entities (verbatim, `null` if absent — never fabricated), assign a `confidence_state` (`clear` / `partially_clear` / `unclear`), and generate the one-sentence `why_it_matters` / `what_to_do_next` strings.
- **Everything else is plain, deterministic TypeScript**, not AI: clash detection (class-vs-class, class-vs-event, event-vs-event via interval overlap), free-slot matching after a cancellation, deduplication/clustering ("Confirmed by N sources"), the Source Trust Hierarchy and contradiction detection (never silently overwrite conflicting fields — record them in `contradictions`), the priority formula (`Urgency(Δt) × Consequence(tier)`), and the "what changed since `last_seen_at`" diff.
- **AI output is untrusted input.** Every response from the model must pass through the Zod schema in `docs/ai-contracts.md` (`ExtractedAnnouncementSchema`) before it reaches business logic or the database.
- Zero-fabrication rule applies to dates, times, rooms, seat counts, links, course/section codes, and registration status — if it's not explicitly stated in the source text, the field must be `null` (or `seat_count_unclear: true` for seats), never guessed.

## Route tree & persona isolation

Student and Admin are **completely segregated** — separate route groups, separate layouts, separate RLS policies, never a shared shell:

```
app/
├── (public)/page.tsx
├── (auth)/login, student/login, admin/login
├── (student)/dashboard, timetable, communities   # layout.tsx = PWA shell + offline banner
└── (admin)/dashboard, submit/class, submit/society, history  # layout.tsx = scoped admin shell
```

Secondary features live as drawers/modals inside `components/`, not as separate routes: `StudentIngestionDrawer`, `TraceToSourceDrawer`, `ContradictionCallout`, `OCRUploadModal` (Phase 2), `TimeTravelControl`.

Middleware enforces role checks from the JWT (`users.role`): students hitting `/admin/*` get HTTP 403; unauthenticated users are redirected to `/login`. Admin accounts are **manually provisioned** in Supabase (no public admin signup) with `scoped_department` / `scoped_section` / `scoped_society`.

## Data & privacy model (Supabase/Postgres)

- Every table has RLS enabled; see `docs/data-model.md` §2 for exact policies. The one that matters most: **admins must never be able to read `raw_messages`** (students' pasted chat dumps) under any circumstances, even via direct API calls — this is enforced at the RLS level, not just hidden in the UI.
- `announcements.lifecycle_status` (`ingested → parsed → classified → needs_review → published → superseded → archived`) — `needs_review` is an **automated** state for incomplete/contradictory data, not a human moderation queue. There is no admin approval step in the MVP; flagged items publish directly with visible warning badges.
- `announcements.trust_tier` implements the Source Trust Hierarchy: `verified_admin` > `multi_source` > `single_source` > `unattributed`. Higher tier wins display precedence but never deletes/hides the conflicting value — that goes in `contradictions`.
- Offline/PWA caching may only ever cache the app shell and sanitized structured `announcements` — raw message text must never be cached in localStorage/CacheStorage.
- `student_engagements.status` (`interested` / `registered` / `not_interested`) gates clash notifications (only fires for `interested`/`registered` events) and suppresses feed visibility for `not_interested`, but must never delete the announcement or its audit trail.

## Explicitly out of scope (do not build without asking)

Phase 2 — deferred but committed (build the seams for these, not the features): PWA Web Share Target, AI OCR timetable image/PDF parsing, enhanced offline structured-data sync, automated time-decay cron re-ranking.

Stretch: WhatsApp Business Cloud API webhook bot.

Confirmed **not included** at all: open-ended conversational chatbot, admin moderation/approval queue, calendar (.ics) export, demo scenario switcher, haptic feedback, any role beyond Student/Admin (no Faculty/Dean/Superadmin).
