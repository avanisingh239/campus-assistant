# Technical Architecture & System Design
## Campus Announcement Assistant: "What Actually Matters to Me?"

**Authoritative Source:** `docs/feature-list (1).docx` & `docs/product-spec.md`  
**Document Status:** Approved Technical Architecture (Final Corrected)  
**Last Updated:** September 14, 2026  

---

## 1. High-Level Architectural Model

The architecture implements a **pipeline pattern** enforcing a strict boundary between probabilistic AI extraction and deterministic business logic:

```
                                  [ INGESTION CHANNELS ]
                      Bulk Paste Box  │  WhatsApp Export  │  Admin Form
                                      ▼
                      ┌────────────────────────────────────────┐
                      │        Payload Preprocessor            │
                      │  (Stripping noise, chunking messages)  │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │         AI Extraction Worker           │
                      │  • Narrow entity extraction            │
                      │  • Fixed categorization (9 categories) │
                      │  • Confidence rating (Clear/Part/Unc)  │
                      │  • Consequence & action one-liners     │
                      └──────────────────┬─────────────────────┘
                                         │ (UNTRUSTED JSON Output)
                                         ▼
                      ┌────────────────────────────────────────┐
                      │    Input Validation & Normalizer       │
                      │  (Zod Schema Guard & Date Sanitization)│
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │     Deterministic Processing Engine    │
                      │  • Clash Detector (Interval math)      │
                      │  • Free-Slot Matcher (Timetable gaps)  │
                      │  • Deduplication & Contradiction check │
                      │  • Priority Formula & Time-Decay Math  │
                      │  • "What Changed" Diff Generator       │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │         State & Persistence            │
                      │     Supabase PostgreSQL with RLS       │
                      └──────────────────┬─────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
         ┌─────────────────────┐                   ┌─────────────────────┐
         │  Student Experience │                   │   Admin Experience  │
         │ (Dashboard/Cards)   │                   │ (Scoped Forms/Log)  │
         └─────────────────────┘                   └─────────────────────┘
```

---

## 2. Route Tree & Separation of Concerns

The client is built on Next.js 15 App Router. Role separation is enforced at the network, route, and database levels:

```text
app/
├── (public)/
│   └── page.tsx                         # Public Landing & Overview
├── (auth)/
│   ├── login/page.tsx                   # Role Selection Entry (/login)
│   ├── student/login/page.tsx           # Student Authentication (/student/login)
│   └── admin/login/page.tsx             # Admin Authentication (/admin/login)
├── (student)/
│   ├── layout.tsx                       # Student Shell (PWA Nav, Offline Banner)
│   ├── dashboard/page.tsx               # Student Dashboard (Diff, Feeds, Lanes)
│   ├── timetable/page.tsx               # Weekly Timetable & Free-Slot Display
│   └── communities/page.tsx             # Society & Group Link Directory
└── (admin)/
    ├── layout.tsx                       # Scoped Admin Shell (Scope Badge Header)
    ├── dashboard/page.tsx               # Admin Overview & Status Counters
    ├── submit/
    │   ├── class/page.tsx               # CR Class Update Form
    │   └── society/page.tsx             # Society Coordinator Event Form
    └── history/page.tsx                 # Admin's Own Submission Log
```

### Contextual Drawers & Modals (Component Layer)
To prevent disorientation, the following live inside `components/` as modals or slide-overs rather than separate pages:
* `StudentIngestionDrawer`: Hosts Bulk Paste Box, Chat Export uploader, and Web Share Target receiver (Phase 2).
* `TraceToSourceDrawer`: Slide-over displaying original raw message, sender, and timestamp.
* `ContradictionCallout`: Card-level warning banner for conflicting sources.
* `OCRUploadModal`: Image/PDF syllabus uploader with ground-truth confirmation flags (Phase 2).
* `TimeTravelControl`: Evaluator toolbar for simulating time passing (+1d, +3d).

---

## 3. The AI vs. Deterministic Code Boundary

This system enforces an absolute separation:

### 3.1 AI Responsibilities (Probabilistic Extraction)
* **Categorization:** Classifies incoming text into our strict 9-category taxonomy.
* **Structured Fact Extraction:** Identifies entities (`course_name`, `date`, `start_time`, `end_time`, `room`, `seat_count`, `link`). If a field is not present, it **must output `null`**.
* **Self-Reported Confidence:** Determines `confidence_state` (`clear`, `partially_clear`, `unclear`) and provides an explanation in `confidence_notes`.
* **Action Generation:** Synthesizes a 1-sentence "Why It Matters" (consequence) and a 1-verb "What To Do Next" directive based strictly on context.

> [!IMPORTANT]
> **AI Output is Untrusted Input:** The JSON returned by the Gemini API is treated as untrusted user input. It is passed through a strict Zod runtime schema validation before being processed by backend business logic — this holds regardless of which model provider is behind the call; see `docs/ai-contracts.md` §4 for why it matters even more with Gemini, whose structured-output schema support is weaker than the Claude API's.

### 3.2 Deterministic Code Responsibilities (Mathematical Certainty)
* **Clash Detection:** Pure interval comparison against confirmed timetable entries, covering all three clash types:
  1. **Class vs. Class:** Overlapping lectures/labs $(\text{Start}_A < \text{End}_B \land \text{Start}_B < \text{End}_A)$.
  2. **Class vs. Event:** Extracurricular workshops overlapping regular class slots.
  3. **Event vs. Event:** Overlapping commitments between two registered/interested events.
* **Free-Slot Matching:** When a class cancellation is confirmed, plain TypeScript calculates the open slot $[\text{Start}_{\text{class}}, \text{End}_{\text{class}}]$ and queries active events occurring within that time bracket.
* **Deduplication:** Normalizes text, computes similarity hashes across course code + date + category, clusters duplicate cards, and tallies `source_count` (*"Confirmed by N sources"*).
* **Contradiction Detection & Trust Hierarchy:**
  * Uses the Source Trust Hierarchy (Verified Admin > Consensus > Single Forward > Unattributed) to rank evidence.
  * **Never silently overwrites or erases conflicting details.** Conflicting fields are preserved in `contradictions` and displayed visibly on the card.
* **Priority Calculation:** Computes the mathematical score:
  $$\text{Priority Score} = \text{Urgency Weight}(\Delta t) \times \text{Consequence Lookup}(\text{Tier})$$
* **Change Tracking (Diff View):** Queries database records where `created_at > last_seen_at` or `updated_at > last_seen_at` without invoking AI.
* **Alert Gating & Suppression:**
  * Clash notifications are only emitted if `student_engagement.status IN ('interested', 'registered')`.
  * Marking `Not Interested` suppresses the notice from top priority feeds and daily digests, but **does not delete the announcement from the database** or erase its historical audit trail.

---

## 4. Platform & Security Architecture

### 4.1 Supabase Authentication & Admin Provisioning
* **Authentication:** Supabase Auth manages JWT sessions.
* **Role Separation:** Stored in `users.role` (`'student' | 'admin'`).
* **Admin Provisioning Model [Approved Product Decision]:**
  * In the MVP, public admin registration is disabled.
  * Admin accounts are **manually provisioned** in the Supabase database by the system owner with their scoped assignments (`scoped_department`, `scoped_section`, `scoped_society`).
* **Route Protection:** Next.js middleware verifies JWT claims. Students attempting to access `/admin/*` are blocked with HTTP 403; unauthenticated users are redirected to `/login`.

### 4.2 Row-Level Security (RLS) & Admin Data Access Boundaries
Data privacy is guaranteed at the database engine level through Supabase RLS:
1. **Admin Data Access Restriction:**
   * Admins have read and write access **only** to their own submissions (`admin_submissions.admin_user_id = auth.uid()`) and read access to published structured outputs (`announcements`).
   * **Admins MUST NOT access private student raw-message pastes or private student ingestion batches.**
   * Enforced via RLS on `raw_messages`, ensuring that an admin cannot query any student's raw chat dump even via direct API calls.
2. `raw_messages`:
   * **Insert:** Authenticated students insert their own raw messages.
   * **Select:** Students can **only** read messages where `raw_messages.user_id = auth.uid()`.
3. `timetable_entries`:
   * Students can only read and write their own timetable entries (`user_id = auth.uid()`).
4. `student_engagements`:
   * Strictly isolated to the individual user (`user_id = auth.uid()`).
5. `announcements`:
   * **Select:** Read-access granted to authenticated students whose section/department matches `target_section` or is universal.
   * **Insert / Update:** Restricted to authenticated admins whose `scoped_section` or `scoped_society` matches the announcement payload.

### 4.3 PWA & Offline Caching Boundaries
* **Service Worker Strategy:**
  * Cache the PWA Application Shell (HTML, CSS, JS bundles, icons) for instant offline startup.
  * Network-first with local IndexedDB fallback for structured `announcements`.
* **Privacy Boundary for Offline Storage [Approved Product Decision]:**
  * Sensitive raw message dumps are **never stored offline in unencrypted CacheStorage or localStorage**.
  * Only sanitized, structured cards are cached offline.

---

## 5. Technical Phasing Architecture

* **MVP Architecture:**
  * Ingestion: Client-side Bulk Paste & Chat Export parsing.
  * AI: Server Action calling the Google Gemini API (`gemini-3.6-flash`, free tier — see CLAUDE.md) with best-effort JSON schema-constrained output, backstopped by Zod validation.
  * Logic: In-memory/Node.js deterministic engines for all 3 clash types, free slots, and deduplication.
  * Database: Supabase PostgreSQL with core RLS policies enforcing raw message privacy.
* **Phase 2 Architecture — Deferred but Committed:**
  * **PWA Web Share Target API [1.1]:** Deferred due to iOS Safari share sheet limitations; Bulk Paste provides universal MVP support.
  * **AI Timetable Image/PDF Parsing (OCR) [1.4]:** Deferred to Phase 2 to tune vision OCR models for diverse schedule templates; manual entry handles MVP ground truth.
  * **Enhanced Offline Caching:** Offline structured-data sync via Service Worker.
  * **Automated Time-Decay Crons:** Background workers for automatic urgency re-ranking.
* **Stretch Architecture:**
  * Meta Cloud API Webhook receiver for WhatsApp Business Sandbox.
