# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This is a Next.js 15 (App Router, TypeScript) + Supabase + Google Gemini project. The scaffold, auth/role routing skeleton, one real end-to-end ingestion pipeline (paste text → Gemini extraction → validated data → database rows), the clash/free-slot deterministic engine, and the real **Student Dashboard (Action Plan tab)** all exist and are wired up — see §Student Dashboard below for that one specifically. **Every other page is still a one-line placeholder** — `app/student/timetable`, `app/student/communities`, `app/student/dont-miss-this`, and everything under `app/admin/*` — because that UI is being designed separately, one screen at a time (the dashboard was the first), and will replace these placeholders as those prompts arrive. Don't build real UI into those *other* routes without being asked; do wire up data/logic that a future UI will need — same as `lib/timetable/actions.ts` and `lib/engagement/actions.ts` already did for the clash engine, and the dashboard's Server Actions now do for engagement.

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

`lib/ingestion/ingest.ts` (`ingestRawText`, a Server Action) is the real, tested path: raw pasted text → insert into `messages` (via the service-role client) → `lib/ai/extract.ts` calls Gemini → Zod-validated → one `announcements` + `announcement_sources` row per extracted item. `app/(dev)/ingest-test/page.tsx` exercises it manually at `/ingest-test`, with a "Source group name" input (defaults to "Test Group" if left blank) alongside the raw-text box — added after testing found every `/ingest-test`-submitted message had `source_group_name: null`, which the dashboard's trace-to-source drawer correctly renders as "Unknown source" (see `app/student/dashboard/card.tsx`'s `source.source_group_name ?? "UNKNOWN SOURCE"` fallback — that's genuinely missing test data, not a display bug).

`lib/ai/extract.ts`'s system prompt is built per-request by `buildSystemPrompt(now)`, not a static string — it includes a `CONTEXT` block with the extraction request's current date so Gemini can resolve relative day/time references ("tomorrow", "Friday", "next Monday") into concrete `event_date`/`deadline_at` values. Before this, the model had no anchor date at all, so any relative-only reference correctly (per its own "never guess" rule) came back `null` — this silently affected every category that uses dates, not just deadlines, until fixed. See `docs/ai-contracts.md` §1/§4.2, kept in sync with the actual prompt.

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

## Student Dashboard (Action Plan tab)

`app/student/dashboard/` is a real, data-wired implementation of a standalone HTML/CSS/JS prototype (`dashboard.html`, not checked into this repo — it lives in the chat history that produced this pass) rebuilt as React. **That prototype is the origin of this app's entire visual system** — forest green (`#0C3B2E`/`#082419`) + gold (`#FFBA00`), Baloo 2 (headings) + Inter (body), the pin/card motif. Before this pass, no such system existed anywhere in the codebase (plain generic dark-blue placeholders only) — `app/globals.css`'s tokens and `app/layout.tsx`'s fonts were rewritten around it site-wide, not scoped to just the dashboard, since every future screen is expected to match it.

- `app/globals.css` — the shared tokens (forest/sage/tan/gold, confidence colors, per-category tag colors, the `--bounce` easing) plus the handful of classes other still-placeholder pages already use (`.card`, `.muted`, `button`, `textarea`) restyled to match. Also the global `confettiFly` `@keyframes` — CSS Modules hash keyframe names, so this couldn't live in the dashboard's own module (see below) since the confetti spans are appended directly to `document.body`, outside that module's scoped tree.
- `app/student/dashboard/dashboard.module.css` — the dashboard's own bespoke visuals (pins, card caps, the grid, animations) ported near-verbatim from the prototype's `<style>` block, scoped via CSS Modules so it can't collide with the shared classes above.
- `lib/dashboard/` — pure, unit-tested logic (mirrors the `lib/deterministic/` / `lib/ingestion/map-to-announcement.ts` shape): `format.ts` (relative-day/time formatting, verb-splitting), `category-meta.ts` (category → label/icon/engagement-eligibility), `priority.ts` (which card gets the URGENT ribbon), `diff-summary.ts` (the "N updates since you last checked" text), `contradiction-summary.ts` (the contradiction banner text), `shape-announcements.ts` (joins the raw Supabase rows into one `DashboardAnnouncement` per card — same "flat queries, joined in JS" pattern as everywhere else in this codebase, no PostgREST embeds).
- `app/student/dashboard/page.tsx` — the Server Component that does the actual fetching, through the RLS-respecting client (`lib/supabase/server.ts`), never the admin client. `loading.tsx` is Next's own streaming-loading convention (shimmer cards), not client-side spinner state.
- `app/student/dashboard/dashboard-client.tsx` / `card.tsx` — the interactive Client Component tree: engagement pills (optimistic update + revert-on-failure), the trace-to-source toggle, the diff banner's dismiss button, the confetti burst (`confetti.ts`, ported as direct DOM manipulation on purpose — a 12-span fire-and-forget effect, not worth modeling as React state).
- `app/student/dashboard/icons.tsx` — every SVG ported directly from the prototype's inline markup, sized by the CSS Module's parent-selector rules (e.g. `.iconChip svg`), not by props.

**⚠️ Requires a schema migration that hasn't been applied to the live project yet.** `announcement_sources` and `contradictions` both had RLS enabled with *no* SELECT policy at all — the RLS client always got an empty result from both, silently breaking trace-to-source, the source-count tag, and the contradiction banner. `supabase/schema.sql` now includes the fix (mirroring the existing `announcements`/`messages` "readable by authenticated users" policies — these are metadata on already-public announcements, not private data), but it must actually be run against the live Supabase project:
```sql
create policy "announcement_sources readable by authenticated users" on announcement_sources
  for select using (auth.role() = 'authenticated');
create policy "contradictions readable by authenticated users" on contradictions
  for select using (auth.role() = 'authenticated');
```
Without this, the dashboard still renders — it just shows every card with `sourceCount: 1`, no trace-to-source drawer, and no contradiction banners, degrading silently rather than erroring.

**Design decisions the prototype's static HTML didn't fully specify, resolved here:**
- **Engagement pills:** the prototype's hardcoded example cards only ever show *either* a single pre-activated "Registered" pill *or* an Interested/Not-interested pair — never all three at once. The task's own wording ("tapping Interested/Not Interested/Registered should upsert") is explicit that all three must be tappable, so every card (except `society_link`, which the prototype itself shows with no pills) renders all three, highlighting whichever matches current status.
- **`event` category:** the prototype never demonstrates a plain `event` card (only `opportunity`) — it shares `opportunity`'s tag color family in CSS (no dedicated family exists) but gets its own icon (calendar, reused from the prototype's own Timetable tab/background symbol) so the two stay visually distinct.
- **`fyi` icon:** reuses the prototype's decorative "chat bubble" background symbol — never used for a category before, but fits "a note" well and stays within the prototype's existing icon set rather than inventing a new shape.
- **`uncategorized`/`duplicate`:** reuse card 6's warning-triangle icon and the `duplicate` tag color family — card 6 in the prototype is actually demonstrating the *contradiction* treatment (see next point), not literally `category: 'duplicate'`, but no other icon/color pairing exists for these two real categories, and "we don't know what this is" fits the triangle well enough.
- **"Merged · N sources" tag:** shown whenever an announcement has an *unresolved* `contradictions` row — independent of its actual `category` (a `deadline` with a contradiction still shows its normal deadline icon/cap color, just with the tag text swapped and the contradiction banner added below). Matches the task's literal wording ("presence of a row in contradictions → show the contradiction banner and 'merged · N sources' tag") rather than the prototype's example, which happens to combine it with the uncategorized/duplicate treatment.
- **URGENT ribbon:** goes on the single highest-`priority_score` item (ties broken by soonest upcoming deadline/event), restricted to categories where urgency is meaningful. Since nothing sets `urgency_score`/`consequence_weight` yet (the priority-scoring half of the deterministic engine doesn't exist — see §Data model), every `priority_score` is currently 0 — the tie-break on soonest date is what actually picks something in practice today, and `pickUrgentAnnouncementId` returns `null` (no ribbon at all) rather than an arbitrary pick when there's truly no signal either way.
- **Diff banner:** three states (`first_visit`/`no_changes`/`updates`), not two — a returning student with nothing new gets no banner at all, matching product-spec.md's "welcome" framing for first-time-only. `last_seen_at` updates *only* on explicit "Got it" dismissal, never automatically on page load or on a timer, so the banner can't disappear before it's been read. The diff text is scoped to what's actually derivable (new/updated announcements since `last_seen_at`, grouped by category) — it deliberately does not include a "clash resolved" phrase like the prototype's hardcoded example, since nothing tracks clash state *history* to detect a resolution, only current state.
- **Hero stat ("N things need a decision from you"):** counts engagement-eligible announcements still at `status: 'none'`, not literally "due today" — the dashboard itself is inherently "today's view," and a strict due-today filter would often just show 0.

## Login / role selection (/login)

**`/login` is one consolidated route with internal UI state, not three separate routes.** `docs/product-spec.md`/`docs/figma-screen-inventory.md`/`docs/requirements-traceability.md` describe (and originally this file did too) a `/student/login` and `/admin/login` as their own screens — that's now superseded the same way `docs/architecture.md`'s original route tree was superseded for `student/`/`admin/` (see below): those docs are still right about the *content* of each state, just not about it being a separate URL. `app/(auth)/login/login-screen.tsx` is a client-side state machine over three states, all rendered from the one `/login` page:

- **`role`** (default, landing state for an unauthenticated visitor) — `role-select.tsx`: two large tappable tiles, "I'm a student" / "I'm an admin".
- **`student`** — `student-auth-form.tsx`: login is the default view within this state; a toggle link switches to a signup form (`full_name`, `class_name`, email, password). Signup calls `supabase.auth.signUp()` passing `role: 'student'`, `full_name`, `class_name` as `options.data` metadata — `handle_new_user()` in `supabase/schema.sql` reads exactly those three keys and creates the `profiles` row itself; this form never inserts into `profiles` directly. If the Supabase project has email confirmation turned on, `signUp()` returns no session and the form shows a "check your email" message instead of redirecting — there was no way to know from this sandbox whether confirmation is on for the live project, so both paths are handled.
- **`admin`** — `admin-auth-form.tsx`: login only, no signup UI, since an admin's scope is assigned, never self-selected (accounts are provisioned manually — see `scripts/create-test-admin.mjs` below). After a successful `signInWithPassword()`, it calls the `checkAdminAccess()` Server Action (`check-admin-access.ts`), which re-checks `profiles.role === 'admin'` (via the RLS client) and looks up a matching `admin_scopes` row (via the service-role client, since `admin_scopes` has RLS enabled with no policy yet — see §Data model below). No match on either → the form signs the session back out and shows an "Access Restricted" sub-state in place of redirecting, rather than leaving the visitor silently authenticated on the login screen.

All three states share `components/canvas-background.tsx` (the gradient/floating-symbol backdrop) and the `components/ui/` primitives (`PinCard`, `Button`, `TextField`) — pulled out of the Student Dashboard pass specifically so this screen wouldn't duplicate its visual language; see `components/icons.tsx` for the same move applied to the base icon set (dashboard's own `app/student/dashboard/icons.tsx` now only holds the dashboard-specific `CategoryIcon` mapping). The dashboard's own `Card` component was deliberately *not* generalized onto `PinCard` — its category-driven, animated, multi-state behavior is real complexity specific to that screen, and the login tiles/form container don't need any of it.

Validation uses `zod` (already a dependency, see `lib/ai/extraction-schema.ts`) rather than a new form library — plain controlled inputs plus the schemas in `app/(auth)/login/validation.ts`. Auth calls go through the browser client (`lib/supabase/client.ts`) only; nothing in `app/(auth)/login/` touches the server or admin client except `check-admin-access.ts`'s Server Action.

## Route tree & persona isolation

```
app/
├── (public)/page.tsx                    # "/" — public landing
├── (auth)/login/                        # "/login" — ONE route, internal state, see above
│   ├── page.tsx, login-screen.tsx, role-select.tsx
│   ├── student-auth-form.tsx, admin-auth-form.tsx
│   ├── check-admin-access.ts            # Server Action
│   ├── validation.ts (+.test.ts), login.module.css
├── (dev)/ingest-test/page.tsx           # "/ingest-test" — TEMPORARY, see above
├── (dev)/clash-test/page.tsx            # "/clash-test" — TEMPORARY, see §Deterministic engine
├── student/                             # REAL folder — see note below
│   ├── layout.tsx                       # nav + sign-out, force-dynamic
│   ├── dashboard/                       # REAL — see §Student Dashboard above
│   ├── timetable/, communities/, dont-miss-this/page.tsx   # still placeholders
├── admin/                               # REAL folder — see note below
│   ├── layout.tsx                       # nav + sign-out, force-dynamic
│   └── dashboard/, submit/class/, submit/society/, history/page.tsx  # all placeholders
├── layout.tsx, globals.css, register-service-worker.tsx, sign-out-button.tsx
```

`components/` (new as of the login pass) holds cross-screen UI: `icons.tsx` (base SVG shapes + `LogoMark`, `CategoryIcon` stays in `app/student/dashboard/icons.tsx` since it's dashboard-specific), `canvas-background.tsx` (the gradient/floating-symbol backdrop, `.site`/`.bgSym` moved here from `app/student/dashboard/dashboard.module.css`), `ui.module.css` + `ui/pin-card.tsx`/`ui/button.tsx`/`ui/text-field.tsx` (the generic card/button/field shapes both `/login` and the dashboard's chrome are built from).

**`student/` and `admin/` are real path segments, not `(student)`/`(admin)` route groups.** `docs/architecture.md`'s original route-tree diagram wrote them as groups, but a parenthesized segment is stripped from the URL — `(student)/dashboard/page.tsx` and `(admin)/dashboard/page.tsx` both resolved to `/dashboard` and collided (caught by `next build`, not `tsc`). They need to be real folders both because the URLs must actually start with `/student`/`/admin` (that's what `middleware.ts` pattern-matches on) and because the dashboards need distinct URLs from each other. `(auth)`, `(public)`, and `(dev)` are legitimately route groups — those are cases where the group name should *not* appear in the URL.

`middleware.ts` (via `lib/supabase/middleware.ts`) refreshes the Supabase session on every request and enforces role separation from `profiles.role`: unauthenticated → redirect to `/login`; wrong role on `/student/*` or `/admin/*` → HTTP 403. `/login` needs no exclusion from that check — it lives under `(auth)`, a route group, so its URL is just `/login` and was never matched by the `/student`/`/admin` prefix check in the first place.

Admin accounts are **manually provisioned** — there's no signup flow for the `admin` role; `handle_new_user()` in `supabase/schema.sql` defaults every new signup to `role = 'student'`. `scripts/create-test-admin.mjs` creates one via `supabase.auth.admin.createUser()` (service-role) for local testing.

## Data & privacy model (Supabase/Postgres)

See `docs/data-model.md` for the full walkthrough; the two things every change needs to respect:
- **`messages` has a SELECT policy but no INSERT policy for `authenticated`** — same for `announcements`' full write path, `clashes`, and `free_slots`. Any code writing to these must go through `lib/supabase/admin.ts` (service-role, bypasses RLS) on the server — never the anon/browser client. `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (request-scoped, respects RLS) are for everything a signed-in user should only see/touch as themselves: `timetable_entries`, `student_announcement_status`, `clashes`/`free_slots` reads, `last_seen`, their own `profiles` row — and, as of the Student Dashboard pass, *reading* `announcement_sources`/`contradictions`, both now `select`-able by any `authenticated` user (⚠️ pending a live migration — see §Student Dashboard above).
- **`admin_scopes` has RLS enabled but no policy defined yet** — don't build a client-side feature assuming an admin can read their own scope directly; it needs a server-side/service-role read (or a new policy) first.
