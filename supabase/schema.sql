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
  source_group_name text,              -- e.g. "CSE-2028-A", "Photography Society"
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

-- announcements: readable by every authenticated student (shared feed)
create policy "announcements readable by authenticated users" on announcements
  for select using (auth.role() = 'authenticated');

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
