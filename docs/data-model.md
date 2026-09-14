# Database Schema & Relational Specifications
## Campus Announcement Assistant: "What Actually Matters to Me?"

**Authoritative Source:** `docs/product-spec.md` & `docs/architecture.md`  
**Database Engine:** PostgreSQL 15+ (Supabase) with Row-Level Security (RLS)  
**Last Updated:** September 14, 2026  

---

## 1. Entity-Relationship Overview

```
┌──────────────────┐       1:N       ┌────────────────────────┐
│      users       ├─────────────────┤   timetable_entries    │
└────────┬─────────┘                 └────────────────────────┘
         │
         │ 1:N                       1:N  ┌────────────────────┐
         ├────────────────────────────────┤    raw_messages    │
         │                                └─────────┬──────────┘
         │ 1:N                                      │ M:N
         │                                          ▼
         │                           ┌────────────────────────┐
         │                           │      announcements     │
         │                           └──────┬───────┬─────────┘
         │                                  │       │ 1:N
         │ 1:N                              │ 1:N   ▼
         ▼                                  │   ┌────────────────────┐
┌────────────────────────┐                  │   │   contradictions   │
│  student_engagements   │◄─────────────────┤   └────────────────────┘
└────────────────────────┘                  │
         │ 1:N                              │ 1:N
         ▼                                  ▼
┌────────────────────────┐           ┌────────────────────────┐
│        clashes         │           │       free_slots       │
└────────────────────────┘           └────────────────────────┘
```

---

## 2. Table Schemas & Constraints

### 2.1 `users`
Manages identity, authentication roles, admin scoping, and session change-tracking.
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('student', 'admin')) NOT NULL DEFAULT 'student',
  
  -- Scoping fields for Admin role (CR / Society Coordinator)
  scoped_role TEXT CHECK (scoped_role IN ('cr', 'society_coordinator', NULL)),
  scoped_department TEXT,
  scoped_section TEXT,
  scoped_society TEXT,
  
  -- Student change-tracking timestamp
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view and update only their own profile
CREATE POLICY "Users can manage own profile"
  ON users FOR ALL
  USING (auth.uid() = id);
```

---

### 2.2 `timetable_entries`
The ground truth for class schedules; required for clash and free-slot detection.
```sql
CREATE TABLE timetable_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Monday, 7=Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL CHECK (start_time < end_time),
  course_code TEXT NOT NULL,
  course_name TEXT NOT NULL,
  section TEXT NOT NULL,
  faculty_name TEXT,
  room TEXT,
  
  -- Dynamic state managed by cancellation engine
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_announcement_id UUID,
  
  -- Ground-truth confirmation flag (for OCR-parsed entries in Phase 2)
  is_unconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Students can only read and write their own timetable
CREATE POLICY "Students manage their own timetable"
  ON timetable_entries FOR ALL
  USING (auth.uid() = user_id);
```

---

### 2.3 `raw_messages`
Stores verbatim source messages immutably for the **Trace-to-Source** audit feature.
```sql
CREATE TABLE raw_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Uploader ID
  batch_id UUID NOT NULL,
  source_channel TEXT CHECK (source_channel IN (
    'bulk_paste', 
    'chat_export', 
    'share_target', 
    'admin_form', 
    'whatsapp_bot'
  )) NOT NULL,
  raw_text TEXT NOT NULL,
  sender_name TEXT,
  raw_timestamp TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE raw_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Strict privacy isolation.
-- Students can ONLY view raw messages they personally uploaded.
-- Admins MUST NOT access student-submitted raw messages under any circumstances.
CREATE POLICY "Students view only their own raw uploads"
  ON raw_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Students insert raw messages"
  ON raw_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

### 2.4 `announcements`
The canonical entity produced by the AI extraction pipeline and ranked by the deterministic engine.
```sql
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Fixed Category Taxonomy
  category TEXT CHECK (category IN (
    'deadline',
    'cancellation_reschedule',
    'event',
    'limited_seat_opportunity',
    'registered_event_update',
    'society_group_link',
    'fyi',
    'duplicate',
    'uncategorized'
  )) NOT NULL,
  secondary_tags TEXT[] NOT NULL DEFAULT '{}',
  
  -- Lifecycle & Trust Hierarchy (Approved Product Decisions)
  -- Note: 'needs_review' is an automated state for incomplete/contradictory notices.
  -- It does NOT require a human admin moderation queue; notices are published with visible warning badges.
  lifecycle_status TEXT CHECK (lifecycle_status IN (
    'ingested',
    'parsed',
    'classified',
    'needs_review',
    'published',
    'superseded',
    'archived'
  )) NOT NULL DEFAULT 'published',
  
  trust_tier TEXT CHECK (trust_tier IN (
    'verified_admin',
    'multi_source',
    'single_source',
    'unattributed'
  )) NOT NULL DEFAULT 'single_source',

  -- Core Content
  title TEXT NOT NULL,
  description TEXT,
  
  -- Extracted Temporal & Spatial Fields
  event_date DATE,
  start_time TIME,
  end_time TIME,
  deadline_timestamp TIMESTAMPTZ,
  location_room TEXT,
  
  -- Academic & Administrative Scoping
  course_name TEXT,
  course_code TEXT,
  faculty_name TEXT,
  target_section TEXT,
  
  -- Opportunity Specifics
  seat_count INT,
  seat_count_unclear BOOLEAN NOT NULL DEFAULT FALSE,
  registration_link TEXT,
  is_verified_link BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Trust & Explainability Fields
  confidence_state TEXT CHECK (confidence_state IN ('clear', 'partially_clear', 'unclear')) NOT NULL,
  confidence_notes TEXT,
  why_it_matters TEXT NOT NULL,
  what_to_do_next TEXT NOT NULL,
  
  -- Deterministic Scoring
  urgency_score NUMERIC NOT NULL DEFAULT 0,
  consequence_weight NUMERIC NOT NULL DEFAULT 0,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  
  -- Deduplication Meta
  deduplication_cluster_id UUID,
  source_count INT NOT NULL DEFAULT 1,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read published and review-flagged announcements
CREATE POLICY "Authenticated users view announcements"
  ON announcements FOR SELECT
  USING (lifecycle_status IN ('published', 'needs_review'));

-- RLS Policy: Only scoped admins can directly insert canonical announcements
CREATE POLICY "Scoped admins can insert announcements"
  ON announcements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );
```

---

### 2.5 `announcement_sources` (Junction Table)
Connects canonical announcements to underlying raw messages for **Trace-to-Source**.
```sql
CREATE TABLE announcement_sources (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  raw_message_id UUID NOT NULL REFERENCES raw_messages(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, raw_message_id)
);

ALTER TABLE announcement_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view announcement sources"
  ON announcement_sources FOR SELECT
  USING (true);
```

---

### 2.6 `contradictions`
Captures conflicting details across merged sources for transparent display.
```sql
CREATE TABLE contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL, -- e.g. 'event_date', 'location_room'
  discrepancy_summary TEXT NOT NULL, -- e.g. "Source A says Room 201; Source B says Room 304"
  source_a_id UUID REFERENCES raw_messages(id),
  source_b_id UUID REFERENCES raw_messages(id),
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contradictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contradictions"
  ON contradictions FOR SELECT
  USING (true);
```

---

### 2.7 `student_engagements`
Tracks student interest toggles (`Interested`, `Registered`, `Not Interested`).
```sql
CREATE TABLE student_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('none', 'interested', 'not_interested', 'registered')) NOT NULL DEFAULT 'none',
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, announcement_id)
);

-- Note on 'not_interested':
-- Suppresses/reduces reminders and clash notifications for this student.
-- Does NOT delete the announcement or remove its historical audit trace.

ALTER TABLE student_engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own engagement status"
  ON student_engagements FOR ALL
  USING (auth.uid() = user_id);
```

---

### 2.8 `clashes`
Stores calculated schedule conflicts across all 3 clash types:
1. `class_vs_class`
2. `class_vs_event`
3. `event_vs_event`

Gated to notify student only if the conflicting event is `interested` or `registered`.
```sql
CREATE TABLE clashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  timetable_entry_id UUID REFERENCES timetable_entries(id) ON DELETE SET NULL,
  conflicting_announcement_id UUID REFERENCES announcements(id) ON DELETE SET NULL,
  clash_type TEXT CHECK (clash_type IN ('class_vs_event', 'class_vs_class', 'event_vs_event')) NOT NULL,
  severity TEXT CHECK (severity IN ('warning', 'critical')) NOT NULL,
  is_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clashes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own clashes"
  ON clashes FOR ALL
  USING (auth.uid() = user_id);
```

---

### 2.9 `free_slots`
Opened timetable slots from cancelled lectures, linked to matching extracurricular events.
```sql
CREATE TABLE free_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timetable_entry_id UUID NOT NULL REFERENCES timetable_entries(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE free_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own free slots"
  ON free_slots FOR ALL
  USING (auth.uid() = user_id);
```

---

### 2.10 `communities`
Maintains the Society and Group Link Directory.
```sql
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_name TEXT UNIQUE NOT NULL,
  description TEXT,
  invite_link TEXT NOT NULL,
  is_verified_link BOOLEAN NOT NULL DEFAULT TRUE,
  group_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Communities are readable by all authenticated users"
  ON communities FOR SELECT
  USING (true);
```

---

### 2.11 `admin_submissions`
Audit log of updates submitted by verified Class Representatives and Society Coordinators.
```sql
CREATE TABLE admin_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_type TEXT CHECK (submission_type IN ('class_update', 'society_event')) NOT NULL,
  
  -- Structured Class Update Payload
  course_name TEXT,
  course_code TEXT,
  target_section TEXT,
  action_status TEXT CHECK (action_status IN ('cancelled', 'rescheduled', 'room_shift', 'urgent_notice', NULL)),
  event_date DATE,
  start_time TIME,
  end_time TIME,
  
  -- Structured Society Event Payload
  society_name TEXT,
  event_title TEXT,
  location_room TEXT,
  seat_count INT,
  registration_deadline TIMESTAMPTZ,
  registration_link TEXT,
  
  -- Optional Verification Attachment
  supporting_message TEXT,
  
  delivery_status TEXT CHECK (delivery_status IN ('published', 'flagged_review')) NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_submissions ENABLE ROW LEVEL SECURITY;

-- Admins view and manage their own submissions only
CREATE POLICY "Admins view and manage their own submissions"
  ON admin_submissions FOR ALL
  USING (auth.uid() = admin_user_id);
```
