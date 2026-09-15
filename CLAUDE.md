# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This is a Next.js 15 (App Router, TypeScript) + Supabase + Google Gemini project. The scaffold, auth/role routing skeleton, and one real end-to-end pipeline (paste text → Gemini extraction → validated data → database rows) exist and are wired up. **The actual student/admin dashboard UI does not exist yet** — every page under `app/student/*` and `app/admin/*` is a one-line placeholder, deliberately, because that UI is being designed separately and will replace these placeholders. Don't build real dashboard UI into those routes without being asked; do wire up data/logic that a future UI will need.

**AI provider note:** this project has used the Claude API, then Gemini, in the space of a few commits — that's not churn to "fix," it's a deliberate cost call. The extraction layer runs on **Google Gemini's free tier** (`gemini-3.6-flash`, `lib/ai/gemini.ts`) specifically because this is a hackathon project with no billing account attached: Gemini's free tier needs no credit card, where the Claude API does. The Zod-validation architecture is provider-agnostic by design (see below) precisely so this kind of swap stays cheap. If budget opens up post-hackathon, switching back to Claude (or any other provider) means touching `lib/ai/gemini.ts` and `lib/ai/extract.ts` only — `lib/ai/extraction-schema.ts` and `lib/ingestion/ingest.ts` shouldn't need to change for a provider swap alone, and didn't for either of the last two.

**Model name churn:** the model string in `lib/ai/gemini.ts` has already had to change once (`gemini-2.5-flash` → `gemini-3.6-flash`, retired for new API keys) — Gemini's model lineup moves fast. If `/ingest-test` starts 404ing on the model name again, the fix is the same: the error message itself names the current replacement model; trust that over anything cached here.

Before writing feature code, read the docs below — they are the **authoritative, approved spec** for what to build, with one correction: **`supabase/schema.sql` is the single source of truth for the database schema**, not `docs/data-model.md`'s prose (that file is now a walkthrough of the real schema, kept in sync by hand — if they disagree, the SQL file wins). Where a doc marks something `Unresolved` or `Deferred but Committed`, treat it as explicitly out of scope until the user says otherwise.

## Commands

```bash
npm install        # first-time setup
npm run dev         # dev server, http://localhost:3000
npm run build       # production build — also does the App Router route-collision /
                    # type check that `tsc` alone won't catch
npm run lint        # eslint .
npm run typecheck   # tsc --noEmit
npm run test        # vitest run (unit tests only — no integration/E2E suite yet)
```

Run a single test file: `npx vitest run lib/ai/extraction-schema.test.ts`. Tests are colocated as `*.test.ts` next to the code they cover (`lib/ai/extraction-schema.test.ts`, `lib/ingestion/map-to-announcement.test.ts`) — they're pure unit tests with no network/DB access, so they run without any env vars set.

**Before every commit that touches `app/**`, run `npm run build`, not just `npm run typecheck`.** The App Router's route-collision check (two pages resolving to the same URL, a Server Action exported from a bad location, etc.) only runs during `next build` / `next dev`, not `tsc --noEmit` — this bit the initial scaffold (`(student)/dashboard` and `(admin)/dashboard` both resolved to `/dashboard` because route groups don't add a URL segment; see §Route tree below for why `student/` and `admin/` are real folders, not groups).

### Environment variables

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project API settings.
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never exposed to the browser. Required because `messages` and `announcements` have no INSERT policy for `authenticated` (see §Data model below) — the ingestion pipeline writes through `lib/supabase/admin.ts` instead.
- `GEMINI_API_KEY` — for `lib/ai/gemini.ts`. Free key, no billing account: https://aistudio.google.com/apikey.

Nothing in this repo talks to a live Supabase project or the Gemini API without these set. `npm run build`/`lint`/`typecheck`/`test` all succeed with no env vars at all (verified) — only `npm run dev` and actually running the ingestion pipeline need them.

## Authoritative docs (read in this order)

- `docs/product-spec.md` — product philosophy, full screen/feature breakdown for Student and Admin experiences, MVP vs. Phase 2 vs. Stretch phasing table, and the list of **Unresolved Product Decisions** that must not be implemented until resolved.
- `docs/architecture.md` — system diagram, route tree, component/drawer layer, the AI/deterministic boundary (see below). Its "AI:" line now says Gemini again (it briefly said Claude API); everything else is still accurate design reference.
- `supabase/schema.sql` — the live, applied Postgres schema (enums, tables, RLS policies) with closing notes on what the deterministic engine still needs to do. **Canonical.**
- `docs/data-model.md` — narrative walkthrough of `supabase/schema.sql`, including a callout of every field name that changed from the original (superseded) 11-table draft. Read this to understand *why* a table looks the way it does; read the SQL file for the literal truth.
- `docs/ai-contracts.md` — the Gemini system prompt, the Zod extraction schema (mirrors `announcements` column-for-column — see its §3 callout for the fields that were removed because no matching column exists, like `course_code`/`location_room`), the note in §4 on why Gemini's structured-output support is weaker than the Claude API's (and why that's fine — the Zod layer is the real guarantee either way), and the 9 ingestion UI states.
- `docs/requirements-traceability.md` — maps every feature ID to its screen, DB impact, AI vs. deterministic responsibility, and acceptance criteria.
- `docs/figma-screen-inventory.md` — per-screen component inventory tagged `Requirement` / `Approved Product Decision` / `Proposed Addition — Requires Approval` / `Design Suggestion` / `Unresolved`. Only the first two are committed.

`docs/decision-log.md`, `docs/security-model.md`, and `docs/testing-strategy.md` are currently empty — check them for content before assuming there's no guidance there.

## Core architectural rule: AI extracts, deterministic code decides

- **Gemini (`gemini-3.6-flash`, via `lib/ai/gemini.ts` / `lib/ai/extract.ts`) is only allowed to write**: `category`, `title`, `why_it_matters`, `what_to_do_next`, `confidence`, `confidence_note`, the extracted date/time fields, `linked_class_name`, `match_confidence`, `seat_count`/`seats_unclear`, and `link_url`. It never computes `urgency_score`, `consequence_weight`, or `priority_score` (a generated column), and it never decides `clashes`/`free_slots` rows.
- **Gemini's output is untrusted input**, validated twice: once explicitly in `lib/ai/extract.ts` (`JSON.parse()` + `ExtractionBatchSchema.safeParse()` — Gemini's own `responseJsonSchema` is only a best-effort hint, see `docs/ai-contracts.md` §4, so this app-level parse is the real gate, unlike the Claude API's `messages.parse()` which validated inline), and again by `lib/ingestion/map-to-announcement.ts`'s pure transform before the row is inserted.
- **Part of the deterministic engine is implemented**: clash detection (class-vs-class, class-vs-event, event-vs-event) and free-slot matching live in `lib/deterministic/` — see §Deterministic engine below. Deduplication ("Confirmed by N sources"), the priority formula, and the time-decay cron are still just comments/notes in `supabase/schema.sql` and `docs/data-model.md` §5. `lib/ingestion/ingest.ts` currently inserts a new `announcements` row per extracted item unconditionally — no dedup check yet.

## The one working pipeline

`lib/ingestion/ingest.ts` (`ingestRawText`, a Server Action) is the real, tested path: raw pasted text → insert into `messages` (via the service-role client) → `lib/ai/extract.ts` calls Gemini → Zod-validated → one `announcements` + `announcement_sources` row per extracted item. `app/(dev)/ingest-test/page.tsx` exercises it manually at `/ingest-test`.

Gemini's free tier is rate-limited to roughly 10 requests/minute — `extractAnnouncements()` retries a 429/503 with backoff (1s, 2s) before throwing `RateLimitError`, which `/ingest-test` surfaces as a plain error message rather than a crash.

**That dev route is a temporary, unauthenticated harness — delete it or gate it behind an admin check before this app is reachable by anyone but developers.** It calls a Server Action that writes through the service-role client with no auth check of its own, and `middleware.ts` doesn't protect `/ingest-test` (it only matches `/student/*` and `/admin/*`). Same warning applies to `/clash-test` below.

## Deterministic engine (clashes & free slots)

`lib/deterministic/` implements clash detection and free-slot matching (docs/requirements-traceability.md Features 2.4/2.5) as plain TypeScript — not a Postgres function or Edge Function, even though `supabase/schema.sql`'s own closing notes mention those; see `docs/data-model.md` §5 for why (no such infrastructure exists in this repo, and `docs/architecture.md`'s MVP line already calls for "In-memory/Node.js deterministic engines"). Same pure-function-plus-thin-DB-wrapper-plus-colocated-tests shape as `lib/ingestion/map-to-announcement.ts`:
- `overlap.ts`, `clashes.ts`, `free-slots.ts` — pure, fully unit-tested (61 tests total across these plus the AI/ingestion tests), no DB access.
- `sync.ts` — the DB-fetching/writing wrappers (`syncClashesForStudent`, `syncFreeSlotsForCancellation`, `matchAnnouncementToOpenFreeSlots`). Always called with the service-role client — `clashes`/`free_slots` have no write policy for `authenticated` (§Data model below).
- `types.ts` — the narrow row shapes these functions read; not tied to any generated Supabase DB types (this project doesn't generate any).

**Trigger points** — three, per the exact rules this engine implements:
1. New `cancellation`/`event`/`opportunity` announcement → `lib/ingestion/ingest.ts` calls `syncFreeSlotsForCancellation`/`matchAnnouncementToOpenFreeSlots`. Clash detection deliberately does *not* run here — a brand-new announcement has no engagement rows yet, so it can't produce a class_vs_event/event_vs_event clash the instant it's created.
2. Timetable entry added/edited/deleted → `lib/timetable/actions.ts` (`addTimetableEntry`/`updateTimetableEntry`/`deleteTimetableEntry`) calls `syncClashesForStudent`.
3. Interest/registration status changes → `lib/engagement/actions.ts` (`setAnnouncementStatus`) calls `syncClashesForStudent`.

`syncClashesForStudent` recomputes *all* of one student's clashes from scratch (delete + reinsert) rather than incrementally patching — simpler to keep correct across three independent call sites, and cheap at one-student scale.

**lib/timetable/actions.ts and lib/engagement/actions.ts are new Server Actions with no UI calling them yet** (same situation as the ingestion pipeline before `/ingest-test`) — a future timetable/card UI should call these directly rather than writing to `timetable_entries`/`student_announcement_status` on its own, or the clash-resync won't fire. Unlike the ingestion pipeline, these write through the RLS-respecting client (`lib/supabase/server.ts`) for the actual table write — students own both tables directly per `supabase/schema.sql` — and only reach for the service-role client for the `clashes` resync step.

**`app/(dev)/clash-test`** is the manual-verification harness for this engine, same temporary/unauthenticated pattern as `/ingest-test` (see `app/(dev)/clash-test/actions.ts`'s doc comment for why it bypasses `lib/timetable/actions.ts`/`lib/engagement/actions.ts` rather than reusing them: no real signed-in student session exists to test with yet).

**One assumption this engine had to make that the spec left open:** `timetable_entries.day_of_week` is documented only as "0-6, configurable start day, not hardcoded Mon-Sun" with nothing anywhere actually configuring it. `dayOfWeekFromDate` in `overlap.ts` uses `Date.getUTCDay()`'s own numbering (0=Sunday) as the one unambiguous default available — see that function's doc comment before changing it.

## Route tree & persona isolation

```
app/
├── (public)/page.tsx                    # "/" — public landing
├── (auth)/
│   ├── login/page.tsx                   # "/login" — role selector
│   ├── student/login/page.tsx           # "/student/login"
│   ├── admin/login/page.tsx             # "/admin/login"
│   └── login-form.tsx                   # shared client form (not a route)
├── (dev)/ingest-test/page.tsx           # "/ingest-test" — TEMPORARY, see above
├── (dev)/clash-test/page.tsx            # "/clash-test" — TEMPORARY, see §Deterministic engine
├── student/                             # REAL folder — see note below
│   ├── layout.tsx                       # nav + sign-out, force-dynamic
│   ├── dashboard/, timetable/, communities/page.tsx   # all placeholders
├── admin/                               # REAL folder — see note below
│   ├── layout.tsx                       # nav + sign-out, force-dynamic
│   └── dashboard/, submit/class/, submit/society/, history/page.tsx  # all placeholders
├── layout.tsx, globals.css, register-service-worker.tsx, sign-out-button.tsx
```

**`student/` and `admin/` are real path segments, not `(student)`/`(admin)` route groups.** `docs/architecture.md`'s original route-tree diagram wrote them as groups, but a parenthesized segment is stripped from the URL — `(student)/dashboard/page.tsx` and `(admin)/dashboard/page.tsx` both resolved to `/dashboard` and collided (caught by `next build`, not `tsc`). They need to be real folders both because the URLs must actually start with `/student`/`/admin` (that's what `middleware.ts` pattern-matches on) and because the dashboards need distinct URLs from each other. `(auth)`, `(public)`, and `(dev)` are legitimately route groups — those are cases where the group name should *not* appear in the URL.

`middleware.ts` (via `lib/supabase/middleware.ts`) refreshes the Supabase session on every request and enforces role separation from `profiles.role`: unauthenticated → redirect to `/login`; wrong role on `/student/*` or `/admin/*` → HTTP 403. `/student/login` and `/admin/login` are explicitly excluded from that check (they share the URL prefix with the protected dashboards but must stay reachable while signed out).

Admin accounts are **manually provisioned** — there's no signup flow for the `admin` role; `handle_new_user()` in `supabase/schema.sql` defaults every new signup to `role = 'student'`.

## Data & privacy model (Supabase/Postgres)

See `docs/data-model.md` for the full walkthrough; the two things every change needs to respect:
- **`messages` has a SELECT policy but no INSERT policy for `authenticated`** — same for `announcements`' full write path, `announcement_sources`, `contradictions`, `clashes`, and `free_slots`. Any code writing to these must go through `lib/supabase/admin.ts` (service-role, bypasses RLS) on the server — never the anon/browser client. `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (request-scoped, respects RLS) are for everything a signed-in user should only see/touch as themselves: `timetable_entries`, `student_announcement_status`, `clashes`/`free_slots` reads, `last_seen`, their own `profiles` row.
- **`admin_scopes` has RLS enabled but no policy defined yet** — don't build a client-side feature assuming an admin can read their own scope directly; it needs a server-side/service-role read (or a new policy) first.
