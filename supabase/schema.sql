-- ============================================================
-- RESCRIPT — Supabase schema
-- Maps directly to the feature doc. Section numbers in comments
-- refer back to the original feature list.
--
-- This is the live, already-applied schema for this project. It supersedes
-- the 11-table design previously drafted in docs/data-model.md — see that
-- file for a narrative walkthrough of the tables below.
-- ============================================================

-- ---------- ENUMS ----------

create type user_role as enum ('student', 'admin');

create type announcement_category as enum (
  'deadline',
  'cancellation',
  'event',
  'opportunity',       -- Limited-Seat Opportunity
  'registered_update', -- Registered-Event Update
  'society_link',
  'fyi',
  'duplicate',
  'uncategorized'
);

create type confidence_level as enum ('clear', 'partial', 'unclear');

create type interest_status as enum ('none', 'interested', 'not_interested', 'registered');

create type clash_type as enum ('class_vs_class', 'class_vs_event', 'event_vs_event');

create type clash_severity as enum ('possible', 'confirmed');

create type admin_scope_type as enum ('class', 'society');

-- 'whatsapp_bot' added for app/api/whatsapp-webhook/route.ts (Meta Cloud API
-- inbound webhook) — a live 1:1 WhatsApp forward, distinct from
-- 'whatsapp_export' (a bulk .txt chat-history upload via /student/ingest).
-- ⚠️ This value did not exist when this schema was first applied — running
-- this file's `create type` again is a no-op against an existing type, so
-- the live project needs the ALTER TYPE migration noted in CLAUDE.md's
-- §WhatsApp webhook run against it directly.
create type source_type as enum ('paste', 'whatsapp_export', 'admin_form', 'whatsapp_bot');


-- ---------- PROFILES (extends auth.users) ----------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'student',
  full_name text,
  class_name text,       -- e.g. "CSE-2028-A", relevant for students and CR admins
  created_at timestamptz not null default now()
);

-- 5.2 Admin verification/scoping — an admin's scope is assigned, never self-selected
create table admin_scopes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  scope_type admin_scope_type not null,
  class_name text,        -- set when scope_type = 'class'
  society_id uuid,        -- set when scope_type = 'society', FK added after societies table
  created_at timestamptz not null default now()
);


-- ---------- TIMETABLE (1.4) ----------

create table timetable_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  day_of_week int not null,            -- 0-6, configurable start day, not hardcoded Mon-Sun
  start_time time not null,
  end_time time not null,
  course_name text not null,
  section text,
  teacher_name text,
  teacher_name_confirmed boolean not null default true, -- false if AI-parsed and unclear (1.4 exception handling)
  created_at timestamptz not null default now()
);


-- ---------- SOCIETIES ----------

create table societies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table admin_scopes
  add constraint admin_scopes_society_fk foreign key (society_id) references societies(id);


-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
-- Supabase Auth writes new users to auth.users, which we can't edit directly.
-- This trigger creates the matching profiles row automatically, reading
-- role/full_name/class_name from the signup call's metadata, e.g.:
--   supabase.auth.signUp({ email, password, options: { data: {
--     role: 'student', full_name: 'Asha', class_name: 'CSE-2028-A'
--   }}})

create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, class_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'student'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'class_name'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ---------- RAW MESSAGES (ingestion, 1.1-1.3) ----------

create table messages (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  source_group_name text,              -- free-text DISPLAY label only, e.g. "CSE 1A 🔥",
                                        -- "Photography Society" — whatever the student typed;
                                        -- never used for RLS matching (see submitted_by_class_name).
  submitted_by_class_name text,        -- the RLS MATCHING key for class-scoped categories (see the
                                        -- announcements policy below) — set server-side, automatically,
                                        -- from profiles.class_name of whoever's `submitted_by` id is
                                        -- below, at insert time (lib/ingestion/ingest.ts). Never typed
                                        -- by a user and never accepted as client input, unlike
                                        -- source_group_name above — a real class name ("CSE-2028-A")
                                        -- is a different shape of data than a free-text group label
                                        -- ("CSE 1A 🔥") and conflating the two broke class-scoping in
                                        -- normal use (see the migration note near the bottom of this
                                        -- file). Null for whatsapp_bot-sourced messages (no
                                        -- authenticated student session to derive it from) and for any
                                        -- message with no submitted_by at all.
  source_type source_type not null,
  submitted_by uuid references profiles(id), -- set for admin_form submissions (5.1)
  created_at timestamptz not null default now()
);


-- ---------- ANNOUNCEMENTS (AI-parsed structured items, 2.1-2.7) ----------

create table announcements (
  id uuid primary key default gen_random_uuid(),
  category announcement_category not null,
  title text not null,
  why_it_matters text,                 -- 3.1
  what_to_do_next text,                -- 3.1
  confidence confidence_level not null default 'unclear', -- 2.7
  confidence_note text,                -- e.g. "consequence unclear" per 2.2 exception handling

  event_date date,
  start_time time,
  end_time time,
  deadline_at timestamptz,

  linked_class_name text,              -- for matching cancellations to timetable, may be null/unconfirmed
  match_confidence numeric,            -- fuzzy-match confidence score for timetable linking (7.3)

  seat_count int,                      -- null if "limited seats" mentioned but no number given (4.3)
  seats_unclear boolean not null default false,

  link_url text,                       -- 4.4
  link_verified boolean not null default true, -- false if malformed/suspicious pattern

  urgency_score numeric,               -- 2.2 deterministic scoring, not AI judgment
  consequence_weight numeric,          -- from a hardcoded lookup table (7.2)
  priority_score numeric generated always as (coalesce(urgency_score,0) * coalesce(consequence_weight,1)) stored,

  -- 2.6 dedup, ML upgrade: a plain-array Gemini embedding of `title` (see
  -- lib/ai/embed.ts / lib/deduplication/embedding-similarity.ts), computed
  -- once at ingestion time and used as a cosine-similarity alternative to
  -- the exact linked_class_name match path when neither side has one. jsonb
  -- (a plain numeric array), not a pgvector column — deliberately, per the
  -- task that added this: at this project's scale, comparing a small set
  -- of same-category candidate rows in application code is simpler and
  -- sufficient, and doesn't need a new Postgres extension dependency.
  -- Nullable, and expected to genuinely be null sometimes: every
  -- pre-existing row from before this column existed, and any row whose
  -- embedding call failed/rate-limited at ingestion time (embed.ts's own
  -- graceful-fallback doc comment) — lib/deduplication/embedding-similarity.ts's
  -- `embeddingsIndicateMatch` always treats a null on either side as "can't
  -- compare," never as "assume similar."
  title_embedding jsonb,

  -- Advance-fee scam detection (see CLAUDE.md's own section on this and
  -- lib/ingestion/verify-link.ts's `detectPaymentRiskPattern`) — true only
  -- when the source message's raw text contains BOTH an "already decided
  -- positive outcome" phrase ("congratulations", "you've been selected")
  -- AND a "pay to release/claim/unlock it" phrase, the actual advance-fee
  -- scam structure, not payment language alone (a normal application fee
  -- never trips this). Deterministic content check, computed at ingestion
  -- time, same architectural shape as link_verified above but independent
  -- of it — this fires regardless of domain or which pipeline (student
  -- paste, WhatsApp export/bot, admin form) the message came through.
  payment_risk boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- links merged raw messages to a single announcement, powers trace-to-source (3.3) and dedup (2.6)
create table announcement_sources (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  extracted_fields jsonb,               -- what THIS source said, e.g. {"date": "2025-05-05"}
  created_at timestamptz not null default now()
);

-- 3.2 transparent contradiction handling — never silently pick one version
create table contradictions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  field_name text not null,             -- e.g. "deadline_at"
  conflicting_values jsonb not null,     -- [{ "value": "2025-05-05", "source_message_id": "..." }, ...]
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);


-- ---------- STUDENT INTERACTION (4.1) ----------

create table student_announcement_status (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  announcement_id uuid not null references announcements(id) on delete cascade,
  status interest_status not null default 'none',
  updated_at timestamptz not null default now(),
  unique (student_id, announcement_id)
);


-- ---------- CLASH & FREE-SLOT DETECTION (2.4, 2.5) — deterministic, not AI ----------

create table clashes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  clash_type clash_type not null,
  timetable_entry_id uuid references timetable_entries(id) on delete cascade,
  announcement_id uuid references announcements(id) on delete cascade,
  other_announcement_id uuid references announcements(id) on delete cascade, -- for event_vs_event
  severity clash_severity not null default 'possible',
  created_at timestamptz not null default now()
);

create table free_slots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  timetable_entry_id uuid not null references timetable_entries(id) on delete cascade,
  cancellation_announcement_id uuid not null references announcements(id) on delete cascade,
  matched_announcement_id uuid references announcements(id), -- the opportunity that fits the freed slot
  status clash_severity not null default 'possible',          -- reuse possible/confirmed
  created_at timestamptz not null default now()
);


-- ---------- "WHAT CHANGED" DIFF VIEW (4.5) ----------

create table last_seen (
  student_id uuid primary key references profiles(id) on delete cascade,
  last_seen_at timestamptz
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table timetable_entries enable row level security;
alter table admin_scopes enable row level security;
alter table messages enable row level security;
alter table announcements enable row level security;
alter table announcement_sources enable row level security;
alter table contradictions enable row level security;
alter table student_announcement_status enable row level security;
alter table clashes enable row level security;
alter table free_slots enable row level security;
alter table last_seen enable row level security;

-- profiles: a user can read/update only their own row
create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);

-- timetable: strictly private to the owning student
create policy "student manages own timetable" on timetable_entries
  for all using (auth.uid() = student_id);

-- announcements: scoped to the viewing student's own class, not a fully
-- global feed — see CLAUDE.md's §Cross-student data isolation for the real
-- bug this fixes (a second real student account could see every other
-- class's cancellation/deadline announcements) and why the fix lives here,
-- in the policy itself, rather than as a filter added to each page's query:
-- RLS is enforced at the database level regardless of what query code
-- does, so this one policy change is what actually makes app/student/
-- dashboard, dont-miss-this, AND communities all correctly scoped — none
-- of their queries needed to change.
--
-- A student sees an announcement if EITHER:
--   - its category is inherently cross-class ('society_link', 'event',
--     'opportunity', 'registered_update' — see below for why exactly
--     these four, not just society_link); OR
--   - the message it was extracted from has a `submitted_by_class_name`
--     that matches the viewing student's own `profiles.class_name` (case/
--     whitespace-insensitive — two independently-set fields matching by
--     exact case would be a near-certain real-world footgun).
-- `deadline`/`cancellation` (the task's own explicit examples of what must
-- NOT be shared) and the catch-all `fyi`/`duplicate`/`uncategorized` stay
-- class-scoped by default — administrative/schedule data specific to one
-- class, not campus-wide by nature.
--
-- Matches against `submitted_by_class_name`, NOT `source_group_name` — see
-- messages' own column comment above and the "class-scoping / display-label
-- split" migration note near the bottom of this file for why. In short:
-- this policy used to match `source_group_name` (a free-text label a
-- student types, e.g. a WhatsApp group's own display name like "CSE 1A 🔥")
-- against `profiles.class_name` (an official class name like
-- "CSE-2028-A") — two fields that were never the same shape of data, so a
-- legitimate class's own messages routinely failed to match their own
-- class and became silently invisible. `submitted_by_class_name` is a
-- second, purpose-built column: the submitting student's real
-- `profiles.class_name`, copied in server-side at insert time
-- (lib/ingestion/ingest.ts) and never accepted as user input, so it's
-- always in the same shape/format as the `profiles.class_name` it's
-- compared against here. `source_group_name` keeps its original free-text
-- display purpose (trace-to-source, the communities directory) untouched.
--
-- Why 'event'/'opportunity'/'registered_update' join 'society_link' as
-- cross-class, beyond the task's one explicit example: they're exactly
-- `lib/deterministic/clashes.ts`'s own `CLASH_ELIGIBLE_CATEGORIES` — the
-- categories the deterministic engine already treats as matchable to ANY
-- student's timetable regardless of which class reported them (a
-- cancellation opens a free slot that gets matched against opportunities
-- by time-fit alone, never by class; docs/product-spec.md's own problem
-- statement frames "rare extracurricular opportunities are missed" as
-- something explicitly cross-class). Scoping these three by class as well
-- would have silently broken that matching: `lib/deterministic/sync.ts`
-- runs through the service-role client and bypasses RLS entirely to do
-- the matching, so a `free_slots.matched_announcement_id` could end up
-- pointing at an announcement from a different class than the student who
-- has the free slot — the RLS-respecting reads in
-- app/student/dashboard/page.tsx and app/student/timetable/page.tsx that
-- resolve that id back into a title would then come back empty. Keeping
-- these four categories campus-wide keeps that path (and the "Don't Miss
-- This" feed's whole reason for existing) internally consistent.
--
-- The subquery below is safe under RLS composition: `announcement_sources`
-- and `messages` both already have a blanket "readable by authenticated
-- users" policy (no restriction to work around), and the `profiles` join
-- only ever touches the querying user's own row (`p.id = auth.uid()`),
-- which is exactly what "read own profile" already allows.
create policy "announcements readable by own class or shared category" on announcements
  for select using (
    category in ('society_link', 'event', 'opportunity', 'registered_update')
    or exists (
      select 1
      from announcement_sources asrc
      join messages m on m.id = asrc.message_id
      join profiles p on p.id = auth.uid()
      where asrc.announcement_id = announcements.id
        and m.submitted_by_class_name is not null
        and p.class_name is not null
        and lower(trim(m.submitted_by_class_name)) = lower(trim(p.class_name))
    )
  );

-- announcements: only admins can insert/update, and only within their assigned scope
create policy "admins insert within scope" on announcements
  for insert with check (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );
  -- NOTE: scope-matching (class/society) is enforced in the edge function that
  -- writes admin_form submissions, not purely in SQL, since it needs to compare
  -- submitted class/section against admin_scopes — see edge-functions notes below.

-- student_announcement_status: private per student
create policy "student manages own status" on student_announcement_status
  for all using (auth.uid() = student_id);

-- clashes / free_slots / last_seen: private per student
create policy "student reads own clashes" on clashes for select using (auth.uid() = student_id);
create policy "student reads own free slots" on free_slots for select using (auth.uid() = student_id);
create policy "student manages own last_seen" on last_seen for all using (auth.uid() = student_id);

-- messages: raw source text — readable by authenticated users (needed for trace-to-source),
-- write access restricted to service role (the ingestion pipeline) except admin_form submissions
create policy "messages readable by authenticated users" on messages
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- ADDED — Student Dashboard pass (see CLAUDE.md). NOT part of the
-- originally-applied migration this file was a verbatim copy of; these two
-- policies are new and, as of this commit, still need to be run against
-- the live project (see CLAUDE.md for the exact command). Both tables had
-- RLS enabled with no SELECT policy at all, meaning the RLS-respecting
-- client always got an empty result from them regardless of who was
-- asking — same "readable by authenticated users" shape as announcements/
-- messages above, since both are metadata on already-public announcements
-- (who reported them, what disagreed), not private per-student data.
-- ============================================================

create policy "announcement_sources readable by authenticated users" on announcement_sources
  for select using (auth.role() = 'authenticated');

create policy "contradictions readable by authenticated users" on contradictions
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- ADDED — Cross-student data isolation fix (see CLAUDE.md's §Cross-student
-- data isolation). Replaces the old blanket "announcements readable by
-- authenticated users" policy above with a class-scoped one. This is a
-- POLICY CHANGE on an already-applied policy, not a fresh create — the
-- live Supabase project needs the drop-then-create below run against it
-- directly (Postgres has no "create or replace policy"):
--
--   drop policy "announcements readable by authenticated users" on announcements;
--
--   create policy "announcements readable by own class or shared category" on announcements
--     for select using (
--       category in ('society_link', 'event', 'opportunity', 'registered_update')
--       or exists (
--         select 1
--         from announcement_sources asrc
--         join messages m on m.id = asrc.message_id
--         join profiles p on p.id = auth.uid()
--         where asrc.announcement_id = announcements.id
--           and m.source_group_name is not null
--           and p.class_name is not null
--           and lower(trim(m.source_group_name)) = lower(trim(p.class_name))
--       )
--     );
--
-- Until this runs, the live project still has the old global policy in
-- place — every student can still see every other class's announcements,
-- exactly the bug this fix addresses — even though this file's own
-- `create policy` above already shows the corrected, intended state.
-- ============================================================

-- ============================================================
-- ADDED — Admin Dashboard pass (see CLAUDE.md's §Admin Dashboard).
-- `admin_scopes` had RLS enabled with NO select policy at all — flagged
-- during the login pass (see check-admin-access.ts's own doc comment) but
-- never addressed since nothing needed to read it through the RLS client
-- until now: /admin/dashboard reads its own admin's scope_type/class_name/
-- society_id directly (to decide CR vs Society flow and pre-fill/lock the
-- scoped value) through the request-scoped client, the same way a student
-- reads their own profile/timetable — same "own row only" shape as
-- "read own profile"/"student manages own timetable" above, scoped to
-- `profile_id = auth.uid()` rather than every row in the table.
-- ============================================================

create policy "admin reads own scope" on admin_scopes
  for select using (auth.uid() = profile_id);

-- ============================================================
-- ADDED — Class-scoping / display-label split (see CLAUDE.md's §Admin
-- Dashboard section list — search for "submitted_by_class_name"). A real
-- design flaw found in testing: the announcements policy above used to
-- match `messages.source_group_name` (whatever free text a student typed
-- for a WhatsApp group's display name, e.g. "CSE 1A 🔥") against the
-- viewer's `profiles.class_name` (an official class name, e.g.
-- "CSE-2028-A") — two fields that are never reliably the same shape of
-- data in normal use, so a class's own legitimate messages routinely
-- failed to match and silently became invisible to that very class.
--
-- The fix: `messages` gets a new column, `submitted_by_class_name`, that is
-- NEVER user-typed — it's copied server-side from the submitting student's
-- own `profiles.class_name` at insert time (lib/ingestion/ingest.ts, keyed
-- off the already-trusted `submitted_by` id), so it's always in the same
-- format as the `profiles.class_name` this policy compares it against.
-- `source_group_name` is untouched and keeps its original free-text
-- display/trace-to-source purpose — it was never wrong for THAT job, only
-- overloaded into a second, incompatible one.
--
-- This is a NEW COLUMN plus a POLICY CHANGE. The `drop policy if exists`
-- pair below is deliberately defensive about which of the two prior
-- policies (the original global one, or the source_group_name-based
-- class-scoped one from the Cross-student data isolation fix above) is
-- still live on your project — at most one of the two exists at any time,
-- and `if exists` makes this block safe to run regardless of which:
--
--   alter table messages add column submitted_by_class_name text;
--
--   drop policy if exists "announcements readable by authenticated users" on announcements;
--   drop policy if exists "announcements readable by own class or shared category" on announcements;
--
--   create policy "announcements readable by own class or shared category" on announcements
--     for select using (
--       category in ('society_link', 'event', 'opportunity', 'registered_update')
--       or exists (
--         select 1
--         from announcement_sources asrc
--         join messages m on m.id = asrc.message_id
--         join profiles p on p.id = auth.uid()
--         where asrc.announcement_id = announcements.id
--           and m.submitted_by_class_name is not null
--           and p.class_name is not null
--           and lower(trim(m.submitted_by_class_name)) = lower(trim(p.class_name))
--       )
--     );
--
-- Existing `messages` rows all get `submitted_by_class_name = null` after
-- the `alter table` above (there's no way to backfill it retroactively —
-- the original submitting student's class at submission time isn't
-- recoverable from `source_group_name` alone, since that's exactly the
-- mismatched field this migration exists to stop relying on). A null
-- never matches any real class name, so old class-scoped test
-- announcements become invisible to everyone rather than incorrectly
-- visible to everyone — the safe direction to fail in. Old test data is
-- effectively retired, not migrated; submit fresh data after this runs to
-- test class-scoping again (see CLAUDE.md for the exact steps).
-- ============================================================


-- ============================================================
-- ADDED — Embedding-based semantic dedup matching (see CLAUDE.md's
-- §Deduplication engine section, "real ML upgrade" note). The dedup
-- engine's fallback match path (when neither side has a `linked_class_name`)
-- used to be plain Jaccard word-overlap over each title's stopword-stripped
-- words — replaced with real Gemini semantic embeddings, compared by
-- cosine similarity in application code (lib/deduplication/
-- embedding-similarity.ts), so two genuinely-paraphrased titles with zero
-- shared words can still be recognized as the same notice.
--
-- This is a NEW COLUMN only — no policy change, since it's read/written
-- through the exact same service-role client every other `announcements`
-- column already goes through:
--
--   alter table announcements add column title_embedding jsonb;
--
-- Deliberately jsonb (a plain numeric array), not a `pgvector` column —
-- no new Postgres extension dependency for a project this size, where
-- comparing a small set of same-category candidate rows in application
-- code is simpler and just as correct. Every pre-existing `announcements`
-- row gets `title_embedding = null` after this runs (there's no text left
-- to retroactively embed against a specific historical moment, and
-- there's no need to — a null is a real, handled value throughout this
-- feature, not an error state: `embeddingsIndicateMatch` always treats it
-- as "can't compare," so an old row just falls back to being matchable
-- only via the exact `linked_class_name` path, same as it always was
-- before this column existed).
-- ============================================================


-- ============================================================
-- ADDED — Advance-fee scam detection (see CLAUDE.md's own section and
-- lib/ingestion/verify-link.ts's `detectPaymentRiskPattern`). Extends the
-- existing deterministic link-verification system with a second rule of
-- the same shape: a message claiming an already-decided positive outcome
-- ("congratulations", "you've been selected") co-occurring with a pay-to-
-- claim/release/unlock ask — the real advance-fee scam structure, not
-- payment language in isolation (a normal application/registration fee
-- correctly never trips this).
--
-- This is a NEW COLUMN only — no policy change, same reasoning as
-- title_embedding above (read/written through the exact same client every
-- other `announcements` column already goes through):
--
--   alter table announcements add column payment_risk boolean not null default false;
--
-- Every pre-existing row gets `payment_risk = false` after this runs — a
-- safe default (no old row retroactively flagged), matching the "old data
-- doesn't survive a schema-shape migration, treat it as retired" precedent
-- already established for the submitted_by_class_name migration above.
-- ============================================================


-- ============================================================
-- NOTES FOR NEXT STEPS (not SQL — read before wiring the app)
-- ============================================================
-- 1. Deterministic logic (per Section 7 of the feature doc) belongs in
--    Postgres functions or Supabase Edge Functions, NOT in Claude prompts:
--      - clash detection: compare start_time/end_time ranges (start1 < end2 and start2 < end1)
--      - free-slot matching: same overlap check against a slot marked cancelled
--      - deduplication: match on (category + rough date + linked_class_name), not exact text
--      - priority_score: already computed as urgency_score * consequence_weight (see column above);
--        consequence_weight should come from a hardcoded lookup table keyed by category
--        (fee deadline > exam > registration deadline > optional workshop), not an AI call
--
-- 2. Time-decay re-ranking (2.3): a scheduled Supabase cron job that recalculates
--    urgency_score as deadlines approach, which flows into priority_score automatically
--    since it's a generated column.
--
-- 3. Claude (the AI layer) only ever WRITES to: category, title, why_it_matters,
--    what_to_do_next, confidence, confidence_note, extracted date/time fields, and
--    match_confidence for fuzzy timetable matching. It never writes urgency_score,
--    consequence_weight, or decides clash/free-slot rows directly — that's the
--    deterministic layer reading Claude's structured output.
