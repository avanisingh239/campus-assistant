# Figma Screen & State Inventory
## Campus Announcement Assistant: "What Actually Matters to Me?"

**Authoritative Source:** Approved Product Architecture & `docs/requirements-traceability.md`  
**Document Status:** Approved Design Inventory (Revised & Formally Tagged)  
**Last Updated:** September 14, 2026  

---

## Legend of Classification Tags
Every element in this inventory is categorized into one of five statuses:
* **`Requirement`**: Direct, explicit requirement derived from the authoritative feature list.
* **`Approved Product Decision`**: Agreed-upon architectural or UX decision clarifying the baseline.
* **`Proposed Addition — Requires Approval`**: Sensible enhancement not yet approved; must not be treated as committed.
* **`Design Suggestion`**: Recommended aesthetic, icon, color, or layout detail for Figma designers; not a rigid functional rule.
* **`Unresolved`**: Open product question subject to a future decision policy.

---

## 1. Student Experience Screens & Components

### 1.1 Student Login
* **Purpose:** Authenticate students securely into their personal dashboard.
* **User Role:** Student
* **Entry Point:** `/login` (Role Selection) $\rightarrow$ the student state of `/login` — implemented as one consolidated route with internal UI state rather than a separate `/student/login` URL; see CLAUDE.md §Login / role selection.
* **Main Components:**
  * Campus Assistant branding (`Requirement`)
  * "Student Portal" heading/label (`Requirement`)
  * Email and Password input fields (`Requirement`)
  * "Sign In" primary button (`Requirement`)
  * Link to Admin portal (`Requirement`)
  * Magic Link login option (`Proposed Addition — Requires Approval`)
* **Primary Action:** Submit credentials to sign in.
* **Secondary Actions:**
  * "Back to Role Selection" (`Requirement`)
  * "Use Magic Link" (`Proposed Addition — Requires Approval`)
* **Required Data:** Student credentials (email, password).
* **Loading/Empty/Error Behavior:**
  * Loading indicator on submit (`Design Suggestion: Spinner`)
  * Validation errors for empty inputs (`Requirement`)
  * Error alert banner on invalid credentials or network failure (`Requirement`)
* **Traceability IDs:** `6.2`, `Platform`
* **Classification:** `Requirement`

---

### 1.2 Student Dashboard
* **Purpose:** The primary operational screen displaying prioritized action items, change diffs, and unexpected opportunity lanes.
* **User Role:** Student
* **Entry Point:** `/student/dashboard`
* **Main Components:**
  * Top navigation header (`Requirement`)
  * "What Changed Since Last Checked" Diff Banner (`Requirement`)
  * Priority Action Plan Feed sorted by Urgency × Consequence (`Requirement`)
  * "Don't Miss This" Discovery Feed (`Requirement`) — built as its own tab/route (`/student/dont-miss-this`), not a lane inside this screen; see CLAUDE.md's §"Don't Miss This" discovery feed for why (matches the tab-based navigation the Student Dashboard pass itself established for Communities/Timetable).
  * Ingestion Drawer trigger button (`Requirement`)
  * Time-Travel Demo control bar (`Requirement`)
  * Visual styling: Card elevation, borders, padding (`Design Suggestion`)
* **Primary Action:** Review urgent items and act on priorities.
* **Secondary Actions:**
  * Open Ingestion Drawer (`Requirement`)
  * Simulate time passing (+1d, +3d) via demo bar (`Requirement`)
  * Dismiss diff banner (`Requirement`)
  * Filter feed by category (`Requirement`)
* **Required Data:** Active `announcements`, user `last_seen_at`, `student_engagements`, active `clashes`.
* **Loading/Empty/Error Behavior:**
  * Loading state: Shimmer placeholder cards (`Design Suggestion`)
  * Empty state: Friendly onboarding guide if 0 notices exist (`Requirement`)
  * Error state: Retry callout if notices fail to load (`Requirement`)
* **Traceability IDs:** `2.1`, `2.2`, `2.3`, `4.3`, `4.5`
* **Classification:** `Requirement`

---

### 1.3 Timetable
* **As built (this MVP pass):** the weekly grid, manual add/edit/delete form, empty state, and clash/cancellation visualization (clash badge with tap-to-expand detail, cancelled-class strikethrough + matched-opportunity note) are all real — see CLAUDE.md's §Timetable. Not built: the configurable week-display setting below (the task explicitly called this out of scope for the hackathon — `day_of_week` defaults to a fixed Monday–Saturday view, still showing any entry outside that range rather than dropping it) and a dedicated "Free Slot" card UI beyond the inline note. Image/PDF upload is a disabled "coming soon" button — see CLAUDE.md for why that one's explicitly deferred rather than attempted.
* **Purpose:** Weekly ground-truth schedule repository for classes, clash visualization, and free-slot discovery.
* **User Role:** Student
* **Entry Point:** `/student/timetable`
* **Main Components:**
  * Configurable weekly schedule grid (`Requirement` — Configurable week display: Monday–Friday, Monday–Saturday, or Monday–Sunday depending on institution schedule)
  * Manual course entry form modal trigger (`Requirement`)
  * Cancelled class indicator (`Requirement` — `Design Suggestion: Strikethrough style`)
  * Free-slot indicator card (`Requirement` — `Design Suggestion: Emerald accent`)
  * Clash visualization indicators (`Requirement`)
* **Primary Action:** View weekly schedule and add/edit class slots.
* **Secondary Actions:**
  * Open manual entry form (`Requirement`)
  * Tap free slot to view matching events (`Requirement`)
  * Configure visible days / week view (`Approved Product Decision`)
* **Required Data:** `timetable_entries`, active cancellations, linked `free_slots`.
* **Loading/Empty/Error Behavior:**
  * Loading state: Grid skeleton (`Design Suggestion`)
  * Empty state: "No classes added yet" with "Add First Class" CTA (`Requirement`)
  * Error state: Save failure alert toast (`Requirement`)
* **Traceability IDs:** `1.4`, `2.4`, `2.5`
* **Classification:** `Requirement`

---

### 1.4 Communities
* **As built (this MVP pass):** society/group name, description, link chip (not clickable — text display, matching the dashboard card's existing link-chip treatment), unverified-link warning, trace-to-source, and de-dupe by exact `link_url`. Search, category filter pills, a group-count badge, and a "Join Community" button are not built yet — see CLAUDE.md's §Communities directory for the exact scope this pass covered.
* **Purpose:** Searchable reference directory of campus societies, clubs, and group join links without scrollback noise.
* **User Role:** Student
* **Entry Point:** `/student/communities`
* **Main Components:**
  * Search bar (`Requirement`)
  * Society cards displaying club name, description, group count badge (`Requirement`)
  * "Join Community" button opening verified link (`Requirement`)
  * `⚠️ Unverified link` warning badge (`Requirement`)
  * Category filter pills: `Tech`, `Cultural`, `Sports`, `Academic` (`Proposed Addition — Requires Approval: Proposed Taxonomy`)
* **Primary Action:** Tap "Join Community" to navigate to verified WhatsApp/Telegram invite URL.
* **Secondary Actions:**
  * Search societies by keyword (`Requirement`)
  * Filter by category (`Proposed Addition — Requires Approval`)
  * Report broken or expired link (`Proposed Addition — Requires Approval`)
* **Required Data:** `communities` records, group counts, URL verification flags.
* **Loading/Empty/Error Behavior:**
  * Loading state: Card shimmer grid (`Design Suggestion`)
  * Empty state: "No societies found" on zero search results (`Requirement`)
* **Traceability IDs:** `4.4`
* **Classification:** `Requirement`

---

### 1.5 Announcement Detail (Contextual Panel)
* **Purpose:** Slide-over drawer or modal displaying complete structured details for a specific notice without losing dashboard scroll position.
* **User Role:** Student
* **Entry Point:** Tapping any card on `/student/dashboard`
* **Main Components:**
  * Category tag (`Requirement`)
  * Normalized headline and description (`Requirement`)
  * Date/time information if known (`Requirement`)
  * Location/room if known (`Requirement`)
  * "Why It Matters" consequence line (`Requirement`)
  * "What To Do Next" verb instruction (`Requirement`)
  * Confidence badge: Clear / Partially clear / Unclear (`Requirement`)
  * Interest toggle group: Interested / Registered / Not Interested (`Requirement`)
  * Source count badge: "Confirmed by N sources" (`Requirement`)
  * "View Raw Source" button (`Requirement`)
  * Copy event details to clipboard (`Proposed Addition — Requires Approval`)
* **Primary Action:** Toggle interest state (Interested / Registered / Not Interested).
* **Secondary Actions:**
  * Tap "View Raw Source" to open trace drawer (`Requirement`)
  * Open registration URL if applicable (`Requirement`)
  * "Copy event details" (`Proposed Addition — Requires Approval`)
* **Required Data:** `announcements` record, linked `student_engagements`, linked sources count.
* **Loading/Empty/Error Behavior:** Instant slide-over; optimistic UI toggling; fallback notification if notice was archived.
* **Traceability IDs:** `2.1`, `2.7`, `3.1`, `4.1`
* **Classification:** `Approved Product Decision`

---

### 1.6 Trace-to-Source Drawer
* **Purpose:** Provide complete trust and auditability by displaying verbatim raw message text, sender name, and timestamp.
* **User Role:** Student
* **Entry Point:** "View Raw Source" button on Announcement Detail or card header
* **Main Components:**
  * Slide-over drawer container (`Requirement`)
  * Verbatim raw message text display (`Requirement`)
  * Sender name / identifier badge (`Requirement`)
  * Timestamp badge (`Requirement`)
  * Source channel indicator (`Requirement`: Bulk Paste, Chat Export, or Admin Form. *Note: Web Share Target is a Phase 2 source channel*)
  * Monospace font or chat-bubble visual treatment (`Design Suggestion`)
* **Primary Action:** Inspect original raw message to verify AI extraction accuracy.
* **Secondary Actions:** Close drawer.
* **Required Data:** `raw_messages` records mapped via `announcement_sources`. Accessible for as long as the relevant source record is retained under the approved retention policy.
* **Loading/Empty/Error Behavior:**
  * Loading: Skeleton lines (`Design Suggestion`)
  * Empty/Purged: "Source text no longer available under retention policy" (`Approved Product Decision`)
  * Security error: HTTP 403 / Access Denied if attempting to view another student's private raw paste (`Requirement`)
* **Traceability IDs:** `3.3`, `Platform (Privacy)`
* **Classification:** `Requirement`

---

### 1.7 Contradiction Callout
* **Purpose:** High-visibility warning alert rendered directly on cards when merged sources report conflicting details.
* **User Role:** Student
* **Entry Point:** In-card alert callout on `/student/dashboard`
* **Main Components:**
  * High-visibility alert stripe (`Requirement` — `Design Suggestion: Amber warning banner`)
  * Conflicting field label (e.g. "Room Discrepancy" or "Date Discrepancy") (`Requirement`)
  * Summary comparison (e.g. "Source A says Room 101, Source B says Room 204") (`Requirement`)
  * Link to open Trace Drawer to inspect source evidence (`Requirement`)
* **Primary Action:** Review discrepancy to make an autonomous decision.
* **Secondary Actions:**
  * Tap link to view evidence in Trace Drawer (`Requirement`)
  * "Contact CR" button (`Proposed Addition — Requires Approval`)
* **Required Data:** `contradictions` record, linked source message IDs. Accessible for as long as the relevant source record is retained under the approved retention policy.
* **Loading/Empty/Error Behavior:** Statically rendered as part of announcement card layout.
* **Traceability IDs:** `3.2`
* **Classification:** `Requirement`

---

### 1.8 Clash Details (Modal / Banner)
* **Purpose:** Highlight and explain schedule conflicts according to strict clash visibility rules.
* **User Role:** Student
* **Entry Point:** Clash banner on `/student/dashboard` or `/student/timetable`
* **Main Components:**
  * Clash modal or notification banner (`Requirement`)
  * Clash type indicator (`Requirement`):
    * **Class vs. Class:** Overlap between timetable entries (e.g. rescheduled lecture vs. regular class). *Rule: Based strictly on timetable schedule; does NOT depend on event interest.*
    * **Class vs. Event:** Extracurricular event overlapping scheduled class. *Rule: Emitted ONLY when the event is marked Interested or Registered.*
    * **Event vs. Event:** Two extracurricular events overlapping. *Rule: Emitted ONLY when both relevant events are marked Interested or Registered.*
  * Severity indicator (`Requirement` — `Design Suggestion: Warning badge for Interested; Critical badge for Registered`)
  * Overlapping time bracket and conflicting titles (`Requirement`)
* **Primary Action:** Review conflict and adjust commitment (e.g., mark event "Not Interested").
* **Secondary Actions:** Dismiss notification banner (`Requirement`).
* **Required Data:** `clashes` row, conflicting `timetable_entries` and `announcements`.
* **Loading/Empty/Error Behavior:** Dynamically calculated; respects interest gating rules; hides automatically if interest is removed.
* **Traceability IDs:** `2.4`, `4.2`
* **Classification:** `Requirement`

---

### 1.9 Free-Slot Details
* **Purpose:** Highlight open time gaps created by cancelled lectures and surface matching opportunities fitting into that exact window.
* **User Role:** Student
* **Entry Point:** Highlighted free slot on `/student/timetable` or card on `/student/dashboard`
* **Main Components:**
  * Free-slot banner detailing cancelled course and time bracket (`Requirement` — `Design Suggestion: Emerald visual badge`)
  * Reason for cancellation if known (`Requirement`)
  * List of matching campus events/workshops fitting within that time (`Requirement`)
  * "Add personal study block" button (`Proposed Addition — Requires Approval`)
* **Primary Action:** Explore matching opportunities and mark "Interested".
* **Secondary Actions:**
  * Dismiss free-slot card (`Requirement`)
  * "Add personal study block" (`Proposed Addition — Requires Approval`)
* **Required Data:** `free_slots` entry, cancelled `timetable_entries`, active matching `announcements`.
* **Loading/Empty/Error Behavior:** Surfaces automatically upon verified cancellation; displays neutral message if no events fit the slot.
* **Traceability IDs:** `2.5`
* **Classification:** `Requirement`

---

### 1.10 What Changed Since Last Checked
* **Purpose:** Eliminate re-scanning fatigue by summarizing net changes since the student's previous visit.
* **User Role:** Student
* **Entry Point:** Fixed dismissible banner at the top of `/student/dashboard`
* **Main Components:**
  * Summary banner (`Requirement` — `Design Suggestion: High-contrast header strip`)
  * Categorized change counts (e.g. "2 new deadlines", "1 cancelled class", "1 resolved clash") (`Requirement`)
  * Dismiss action button labeled "Got it" (`Requirement`)
* **Primary Action:** Click "Got it" to dismiss banner and update `users.last_seen_at`.
* **Secondary Actions:** Click specific count to scroll down to relevant feed section (`Approved Product Decision`).
* **Required Data:** Net change query (`created_at > last_seen_at OR updated_at > last_seen_at`).
* **Loading/Empty/Error Behavior:** Hidden on first visit (shows welcome briefing instead); hidden if 0 changes; capped to top 5 if absent > 7 days.
* **Traceability IDs:** `4.5`
* **Classification:** `Requirement`

---

### 1.11 Interest and Registration States
* **Purpose:** Provide 1-tap toggles allowing students to govern relevance, gate clash notifications, and personalize priority ranking.
* **User Role:** Student
* **Entry Point:** 3-state control on every announcement card
* **Main Components:**
  * Segmented 3-state toggle: `Interested`, `Registered`, `Not Interested` (`Requirement`)
  * Icon choices: Star, Check, X (`Design Suggestion`)
* **Primary Action:** Select one of the three states.
* **Secondary Actions:** Tap active state again to revert to neutral (`none`).
* **Behavior Rules:**
  * `Interested`: Activates conditional clash monitoring for this event.
  * `Registered`: Elevates clash severity to critical.
  * `Not Interested`: Suppresses/reduces reminders, daily digests, and clash alerts. *Rule: Does NOT delete the announcement from the database or remove its historical audit trace.*
* **Required Data:** `student_engagements` status for `(user_id, announcement_id)`.
* **Loading/Empty/Error Behavior:** Instant optimistic UI update; background sync with error rollback toast.
* **Traceability IDs:** `4.1`, `4.2`
* **Classification:** `Requirement`

---

## 2. Admin Experience Screens

> [!IMPORTANT]
> **Admin Scoping Rule:** Admin accounts are scoped to **EITHER** a Class Representative (CR) **OR** a Society Coordinator. Admins do not have both scopes simultaneously.

### 2.1 Admin Login
* **Purpose:** Authenticate verified Class Representatives and Society Coordinators into their scoped administrative portal.
* **User Role:** Admin
* **Entry Point:** `/login` $\rightarrow$ the admin state of `/login` — implemented as one consolidated route with internal UI state rather than a separate `/admin/login` URL; see CLAUDE.md §Login / role selection.
* **Main Components:**
  * Admin Portal badge/heading (`Requirement`)
  * Email and Password input fields (`Requirement`)
  * "Sign In as Admin" button (`Requirement`)
  * "Student Login" navigation link (`Requirement`)
  * "Request CR/Society Access" self-registration link (`Proposed Addition — Requires Approval`)
* **Primary Action:** Submit credentials to sign in.
* **Secondary Actions:**
  * "Switch to Student Login" (`Requirement`)
  * "Request CR/Society Access" (`Proposed Addition — Requires Approval`)
* **Required Data:** Admin credentials, verified scope assignment (`scoped_section` OR `scoped_society`).
* **Loading/Empty/Error Behavior:** Loading spinner; error alert on invalid credentials or unassigned administrative scope.
* **Traceability IDs:** `6.2`, `5.2`
* **Classification:** `Requirement`

---

### 2.2 Admin Dashboard
* **Purpose:** Provide scoped administrators an overview of notices they have submitted and quick access to post official updates.
* **User Role:** Admin (CR or Society Coordinator)
* **Entry Point:** `/admin/dashboard`
* **Main Components:**
  * Persistent Verified Scope Badge (`Requirement` — displays EITHER "Class Representative: Section X" OR "Society Coordinator: Club Y")
  * Scope-relevant action button (`Requirement` — "Submit Class Update" for CR; "Submit Society Event" for Society Coordinator)
  * Active notice counters (`Approved Product Decision`)
  * Recent submissions list (`Requirement`)
* **Primary Action:** Click scope-relevant submit button.
* **Secondary Actions:** Review status of recent submissions.
* **Required Data:** Admin's `users.scoped_role`, `scoped_section` (if CR), `scoped_society` (if Society Coordinator), recent `admin_submissions`.
* **Loading/Empty/Error Behavior:** Shimmer counters on load; empty state if no submissions exist.
* **Traceability IDs:** `5.1`, `5.2`
* **Classification:** `Requirement`

---

### 2.3 Submit Class Update (CR-Scoped Screen)
* **Purpose:** Provide Class Representatives a structured, ambiguity-free form to submit class cancellations, reschedules, or room shifts.
* **User Role:** Admin (Class Representative scope only)
* **Entry Point:** `/admin/submit/class`
* **Main Components:**
  * Course Name and Course Code inputs (`Requirement`)
  * Target Section (pre-filled and locked to verified scope) (`Requirement`)
  * Action Status selector: Cancelled, Rescheduled, Room Shift, Urgent Notice (`Requirement`)
  * Date picker and Time slot inputs (`Requirement`)
  * Faculty name input (`Requirement`)
  * Supporting message pastebox (`Requirement`)
  * "Publish Update" button (`Requirement`)
* **Primary Action:** "Publish Class Update".
* **Secondary Actions:** "Cancel".
* **Required Data:** Timetable database for course validation, admin's verified section.
* **Loading/Empty/Error Behavior:** Timetable validation warning if course/section is unrecognized; confirmation on publish.
* **Traceability IDs:** `5.1`, `5.2`
* **Classification:** `Requirement`

---

### 2.4 Submit Society / Event Update (Society-Scoped Screen)
* **Purpose:** Provide Society Coordinators a structured form to submit official workshops, fests, seat counts, and registration links.
* **User Role:** Admin (Society Coordinator scope only)
* **Entry Point:** `/admin/submit/society`
* **Main Components:**
  * Society Name (pre-filled and locked to verified society scope) (`Requirement`)
  * Event Title input (`Requirement`)
  * Date picker, Start Time, and End Time inputs (`Requirement`)
  * Venue / Room input (`Requirement`)
  * Seat Count capacity input (`Requirement`)
  * Registration Deadline date/time picker (`Requirement`)
  * Registration URL input (`Requirement`)
  * Supporting message pastebox (`Requirement`)
  * "Publish Event" button (`Requirement`)
* **Primary Action:** "Publish Society Event".
* **Secondary Actions:** "Cancel".
* **Required Data:** Admin's verified society affiliation.
* **Loading/Empty/Error Behavior:** URL validation error if link is malformed; date validation if deadline is in the past; confirmation on publish.
* **Traceability IDs:** `5.1`, `5.2`
* **Classification:** `Requirement`

---

### 2.5 Submission History
* **Purpose:** Allow an admin to review their own historical submissions, timestamps, and active vs. superseded delivery status.
* **User Role:** Admin
* **Entry Point:** `/admin/history` (or tab on `/admin/dashboard`)
* **Main Components:**
  * Table/list of admin's own submissions (`Requirement`)
  * Columns: Title/Course, Type, Date Submitted, Delivery Status (Published / Superseded / Flagged) (`Requirement`)
  * Manually marking older notice as superseded (`Proposed Addition — Requires Approval`)
* **Primary Action:** View submission status.
* **Secondary Actions:**
  * "Mark as Superseded" (`Proposed Addition — Requires Approval`)
* **Required Data:** `admin_submissions` where `admin_user_id = auth.uid()`. *Note: No global moderation queue; admins view only their own records.*
* **Loading/Empty/Error Behavior:** Table shimmer on load; "No submission history" empty state.
* **Traceability IDs:** `5.1 (History)`, `5.2`
* **Classification:** `Approved Product Decision`

---

## 3. System States Inventory (13 States)

> **As built (§3.1-3.9):** these 9 ingestion states are real on `/student/ingest` (see CLAUDE.md's §Ingestion page), not a `StudentIngestionDrawer` slide-over — same tab/route supersession as elsewhere in this app. 5 of the 9 are built: Empty/Ready/Processing are just this page's own screen state, and Successfully Parsed / Partially Parsed / Needs Clarification / Unsupported Format / Failed are real result states (`lib/ingestion/result-state.ts`). Duplicate Input (§3.7) is **not built** — it needs the dedup engine `supabase/schema.sql`'s closing notes still describe as not existing. Needs Clarification (§3.6) here means "every extracted item in the run came back `confidence: unclear`," not a separate manual Uncategorized-bucket review flow — a lone unclear item within an otherwise-fine batch is shown inline instead of gating the whole result.

### 3.1 Empty State
* **Purpose:** Welcome student when zero announcements exist and guide initial ingestion.
* **User Role:** Student
* **Entry Point:** `/student/dashboard` with 0 records
* **Main Components:** Empty illustration, explanatory header, CTA button to open Ingestion Drawer (`Requirement`). Illustration style and typography (`Design Suggestion`).
* **Primary Action:** Click CTA to open `StudentIngestionDrawer`.
* **Secondary Actions:** None.
* **Required Data:** Active `announcements` count = 0.
* **Loading/Empty/Error Behavior:** Clean static presentation.
* **Traceability IDs:** `1.2`, `1.3`
* **Classification:** `Requirement`

---

### 3.2 Ready State
* **Purpose:** Confirm that pasted text or uploaded `.txt` file has been staged and is ready for AI extraction.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer` after text input or file attachment
* **Main Components:** Payload summary indicator (e.g. character count or file name attached), enabled "Parse & Organize" button, Clear text button (`Requirement`).
* **Primary Action:** "Parse & Organize".
* **Secondary Actions:** "Clear Text / Remove File".
* **Required Data:** Client-side input string length > 10.
* **Loading/Empty/Error Behavior:** Enables primary CTA button.
* **Traceability IDs:** `1.2`, `1.3`, `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.3 Processing State
* **Purpose:** Provide reassuring progress feedback during asynchronous AI extraction and deterministic clash detection.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer` during parse execution
* **Main Components:** Progress indicator, progress step label (e.g. "Extracting entities...", "Checking clashes..."), disabled submit button (`Requirement`). Pulse/shimmer animation style (`Design Suggestion`). "Cancel Processing" button (`Proposed Addition — Requires Approval`).
* **Primary Action:** Wait for completion (non-interactive).
* **Secondary Actions:** "Cancel Processing" (`Proposed Addition — Requires Approval`).
* **Required Data:** Active extraction request.
* **Loading/Empty/Error Behavior:** Timeout fallback to Failed state after 30 seconds.
* **Traceability IDs:** `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.4 Successfully Parsed State
* **Purpose:** Confirm that required information was extracted with no currently detected ambiguity.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer` upon successful extraction
* **Main Components:** Success summary indicator, count of extracted clear notices, card preview list, "Add to My Dashboard" button (`Requirement`). Green checkmark styling (`Design Suggestion`).
* **Primary Action:** "Add to My Dashboard".
* **Secondary Actions:** "Paste More Messages".
* **Required Data:** Extracted announcements with `confidence_state = 'clear'`.
* **Loading/Empty/Error Behavior:** Renders preview cards; transitions to dashboard on confirm.
* **Traceability IDs:** `2.1`, `2.7`, `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.5 Partially Parsed State
* **Purpose:** Inform student that notices were extracted but some non-critical operational details are missing.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer` / Dashboard preview
* **Main Components:** Warning indicator, summary text, highlighted card with `⚠️ Partially clear` badge and missing field note (`Requirement`). Amber badge styling (`Design Suggestion`). "Manual editing of AI-extracted missing details" (`Proposed Addition — Requires Approval`).
* **Primary Action:** "Accept & Add to Dashboard".
* **Secondary Actions:**
  * Manual editing of missing details (`Proposed Addition — Requires Approval`)
* **Required Data:** Extracted announcements with `confidence_state = 'partially_clear'`.
* **Loading/Empty/Error Behavior:** Renders affected cards with visible missing-field tooltips.
* **Traceability IDs:** `2.7`, `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.6 Needs Clarification State
* **Purpose:** Surface messages that were too vague, fragmented, or ambiguous to categorize reliably.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer` / Catch-all section
* **Main Components:** `❓ Unclear` confidence badge, card placed in Uncategorized bucket, raw text excerpt, prompt explaining ambiguity (`Requirement`).
* **Primary Action:** Review card and save as general FYI or dismiss.
* **Secondary Actions:** Discard card (`Requirement`).
* **Required Data:** Extracted items with `category = 'uncategorized'` or `confidence_state = 'unclear'`.
* **Loading/Empty/Error Behavior:** Isolates unclear notices without blocking clear notices from being added.
* **Traceability IDs:** `2.1`, `2.7`, `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.7 Duplicate Input State
* **Purpose:** Inform student that a pasted notice has already been processed from an earlier forward.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer`
* **Main Components:** Confirmation message ("Notice already tracked: Confirmed by 1 additional source"), card preview showing updated source counter (`Requirement`).
* **Primary Action:** Confirm and update source counter.
* **Secondary Actions:** View previous source.
* **Required Data:** Deduplication match against existing `announcements.deduplication_cluster_id`.
* **Loading/Empty/Error Behavior:** Increments source count without duplicating cards on dashboard.
* **Traceability IDs:** `2.6`, `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.8 Unsupported Format State
* **Purpose:** Gracefully reject non-text files or unsupported export structures without crashing.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer` file uploader
* **Main Components:** Format error message ("Unsupported file format. Please upload a plain text (.txt) WhatsApp export file"), file summary, "Choose Another File" CTA (`Requirement`).
* **Primary Action:** "Choose Another File".
* **Secondary Actions:** "Switch to Bulk Paste".
* **Required Data:** File MIME type != `text/plain`.
* **Loading/Empty/Error Behavior:** Resets uploader cleanly; preserves raw textarea content.
* **Traceability IDs:** `1.3`, `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.9 Failed State
* **Purpose:** Provide graceful, non-destructive error recovery when extraction or network fails.
* **User Role:** Student
* **Entry Point:** `StudentIngestionDrawer`
* **Main Components:** Error alert banner ("Extraction failed — please check connection and try again"), preserved raw text in textarea (zero data loss), "Try Again" button (`Requirement`). Red alert styling (`Design Suggestion`).
* **Primary Action:** "Try Again".
* **Secondary Actions:** Close drawer.
* **Required Data:** Error exception payload.
* **Loading/Empty/Error Behavior:** Preserves student's pasted text in memory for 1-click retry.
* **Traceability IDs:** `AI Contract 2`
* **Classification:** `Requirement`

---

### 3.10 Unclear or Conflicting Announcement State
* **Purpose:** Visually warn student on the dashboard card when the notice is incomplete or sources disagree.
* **User Role:** Student
* **Entry Point:** `/student/dashboard` card feed
* **Main Components:** In-card contradiction callout banner ("Discrepancy: Source A says X; Source B says Y"), `❓ Unclear` or `⚠️ Partially clear` badge, link to open Trace Drawer (`Requirement`).
* **Primary Action:** Click link to inspect evidence in Trace Drawer.
* **Secondary Actions:** "Contact CR" (`Proposed Addition — Requires Approval`).
* **Required Data:** `announcements.confidence_state = 'unclear'` OR linked `contradictions` entry. Accessible for as long as the relevant source record is retained under the approved retention policy.
* **Loading/Empty/Error Behavior:** Statically rendered with card layout.
* **Traceability IDs:** `2.7`, `3.2`
* **Classification:** `Requirement`

---

### 3.11 No Timetable Conflicts State
* **Purpose:** Reassure the student that their schedule is free of clashes.
* **User Role:** Student
* **Entry Point:** `/student/timetable` or `/student/dashboard` status strip
* **Main Components:** Confirmation message ("Schedule clear: Zero clashes detected") (`Requirement`). Shield icon and green palette (`Design Suggestion`).
* **Primary Action:** View timetable.
* **Secondary Actions:** None.
* **Required Data:** Active `clashes` count = 0.
* **Loading/Empty/Error Behavior:** Persistent subtle confirmation banner.
* **Traceability IDs:** `2.4`, `4.2`
* **Classification:** `Requirement`

---

### 3.12 Timetable Conflict Detected State
* **Purpose:** Urgently alert the student of an overlapping schedule conflict according to strict clash visibility rules.
* **User Role:** Student
* **Entry Point:** `/student/dashboard` top banner + `/student/timetable` overlapping block
* **Main Components:**
  * Alert banner detailing the conflict (`Requirement`)
  * Specific clash type label (`Requirement`: Class vs Class, Class vs Event, Event vs Event)
  * Overlapping time bracket and titles (`Requirement`)
  * "Review Conflict" CTA button (`Requirement`)
  * Amber/red high-contrast visual styling (`Design Suggestion`)
* **Primary Action:** "Review Conflict" (opens Clash Details).
* **Secondary Actions:** Mark conflicting event "Not Interested" to silence alert (`Requirement`).
* **Required Data:** Active `clashes` row meeting visibility rules:
  * Class vs Class: Overlapping timetable entries (shown unconditionally).
  * Class vs Event: Shown when event is marked Interested or Registered.
  * Event vs Event: Shown when both events are marked Interested or Registered.
* **Loading/Empty/Error Behavior:** Appears dynamically; silences immediately if student marks event Not Interested.
* **Traceability IDs:** `2.4`, `4.2`
* **Classification:** `Requirement`

---

### 3.13 No Available Free Slot State
* **Purpose:** Inform the student that no cancelled classes currently offer open slots.
* **User Role:** Student
* **Entry Point:** `/student/timetable` free slot filter / dashboard panel
* **Main Components:** Informational text ("No cancelled classes right now. When a lecture is cancelled, free slots and matching opportunities will appear here.") (`Requirement`). Calendar icon (`Design Suggestion`).
* **Primary Action:** View regular timetable.
* **Secondary Actions:** None.
* **Required Data:** `free_slots` where `is_active = true` count = 0.
* **Loading/Empty/Error Behavior:** Clean neutral placeholder.
* **Traceability IDs:** `2.5`
* **Classification:** `Requirement`
