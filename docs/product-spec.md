# Product Specification: "What Actually Matters to Me?"
## AI-Powered Campus Announcement Assistant & Information-Management PWA

**Authoritative Source:** `docs/feature-list (1).docx` & Approved Product Architecture  
**Document Status:** Comprehensive Specification (Final Corrected & Structured)  
**Last Updated:** September 14, 2026  

---

## 1. Executive Summary & Core Philosophy

University students are overwhelmed by high-volume, unstructured, and redundant messages across WhatsApp groups, Telegram channels, and departmental bulletin boards. Critical academic deadlines, room shifts, fee payments, and class cancellations are lost in scrollback, while rare extracurricular opportunities are missed.

**Campus Assistant** transforms this chaotic message stream into a personalized, high-trust action plan.

### Core Tenets
1. **AI Extracts, Deterministic Code Decides:** Large Language Models (LLMs) are restricted to narrow extraction, categorization, confidence scoring, and one-liner generation. Deterministic TypeScript code handles clash calculations, time-decay math, deduplication keys, free-slot matching, and priority ranking.
2. **Zero Fabrication & Visible Uncertainty:** The system never invents missing dates, venues, or deadlines. Missing information is visibly labeled `Partially clear` or `Unclear`.
3. **Traceability & Autonomy:** The system never makes silent decisions. Every parsed announcement links directly to its verbatim raw message, and discrepancies between sources are displayed transparently.
4. **Strict Persona Isolation:** Student and Admin interfaces are completely segregated in routes, navigation, database permissions, and UI styling.

---

## 2. Product Structure

The product is organized into four core architectural areas:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            1. Student Experience                            │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│   │      Dashboard      │  │      Timetable      │  │     Communities     │ │
│   │ (Feed, Diff, Lanes) │  │  (Grid, Gaps, OCR)  │  │(Societies, Links)   │ │
│   └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│        │ Drawers/Modals: Ingestion, Trace-to-Source, Contradictions, Clashes│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                        2. Shared Intelligence Layer                         │
│  • AI Extraction & Taxonomy          • Deterministic Clash & Slot Matcher   │
│  • Announcement Lifecycle            • Deduplication & Contradiction Engine │
│  • Source Trust Hierarchy            • Priority Formula & Time Decay        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▲
┌──────────────────────────────────────┴──────────────────────────────────────┐
│                             3. Admin Experience                             │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│   │   Admin Dashboard   │  │ Submit Class Update │  │Submit Society Update│ │
│   │ (Scope, Submissions)│  │ (CR Scoped Changes) │  │ (Event Information) │ │
│   └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│        │ Submission History: Admin's own scoped log (No global moderation)  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                             4. Platform Layer                               │
│  • Supabase Auth & Strict RLS        • Responsive PWA & Offline Shell       │
│  • Privacy Boundaries                • Web Share Target (Phase 2)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Area A: Student Experience

The student experience is streamlined into **three top-level views**. Secondary features (details, raw source, clashes, change diffs) are implemented as **cards, drawers, banners, or modals** to maintain context and avoid navigational fragmentation:

#### 1. Student Dashboard (`/student/dashboard`)
The central operational screen:
* **"What Changed Since You Last Checked" Diff Banner [Source 4.5]:** Dismissible banner at the very top summarizing net updates since `last_seen_at` (e.g., *"2 new deadlines, 1 cancelled class, 1 clash resolved"*). Clicking *"Got it"* updates `last_seen_at`.
  * *[Approved Product Decision]*: First-time users see a *"Welcome! Here is your initial briefing"* card; the diff engine activates only from the second session onward. Absences > 7 days are capped to top 5 urgent updates with an expandable toggle.
* **Priority Action Plan Feed [Source 2.1, 2.2, 2.3]:** Cards ordered deterministically by the Urgency × Consequence scoring formula.
* **"Don't Miss This" Discovery Feed [Source 4.3]:** A distinct, persistently visible lane for limited-seat or one-off high-value opportunities, ensuring they are not buried under immediate day-to-day deadlines.
* **Conditional Clash Alerts [Source 4.2]:** High-visibility banner or toast alerting the student of a schedule clash **only if** the conflicting event is marked `Interested` or `Registered`.
* **Time-Decay Demo Control [Source 2.3]:** Evaluation bar allowing judges/users to simulate time advancing (+1 day, +3 days) to witness live priority promotion.
* **States Handled:** Explicit Empty State (*"No announcements yet — paste messages to begin"*), Shimmer Loading State, and Error State (*"Failed to sync notices"*).

#### 2. Student Timetable (`/student/timetable`)
The ground-truth schedule repository:
* **Timetable Grid [Source 1.4]:** Weekly calendar view rendering confirmed class slots.
* **Manual Entry Form [Source 1.4]:** Direct form to add courses, sections, rooms, times, and faculty.
* **Cancelled-Class & Free-Slot Display [Source 2.5]:** Cancelled classes render with a strikethrough and open an emerald "Free Slot" card cross-referencing live campus events that fit into that exact gap.
* **Clash Visualization [Source 2.4]:** Visual overlap indicators displaying:
  1. **Class vs. Class** (e.g., rescheduled lecture overlapping with an existing lecture or lab).
  2. **Class vs. Event** (e.g., guest workshop scheduled during a lecture).
  3. **Event vs. Event** (e.g., two registered extracurricular workshops overlapping).
* **AI OCR Upload Modal [Source 1.4 - Phase 2 — Deferred but Committed]:** Upload syllabus/schedule image or PDF. Deferred to Phase 2 to ensure zero-hallucination accuracy across varied layout templates. Any unconfirmed OCR extraction is explicitly labeled *"Please confirm"* before saving.

> **As built:** the Timetable Grid and Manual Entry Form (including edit/delete) are real, wired to `lib/timetable/actions.ts` — every mutation triggers real clash detection. The Cancelled-Class & Free-Slot Display and Clash Visualization bullets above are now also real, in a form scoped to what a follow-up task actually asked for: a clash badge (confirmed = red, possible = amber, reusing the dashboard's own colors) that expands on tap to name what it clashes with, and a strikethrough + "Cancelled" badge with an inline matched-opportunity note (not a separate emerald "Free Slot" card). The OCR Upload Modal stays a disabled "coming soon" button, exactly matching this doc's own `Deferred but Committed` tag. See CLAUDE.md's §Timetable.

#### 3. Student Communities (`/student/communities`)
The reference directory for campus organizations:
* **Group Link Directory [Source 4.4]:** Dedicated tab/view grouping club and society WhatsApp/Telegram join links by organization.
* **Deduplication [Source 4.4]:** Multiple forwarded links for the same club are merged into a single club entry with a badge (*"Posted in 3 groups"*).
* **Link Safety [Source 4.4]:** URLs are regex-validated; non-standard or suspicious shorteners display a prominent `⚠️ Unverified link` warning.

> **As built:** the MVP pass implements this against `announcements` where `category = 'society_link'` (there's no separate `communities` table in `supabase/schema.sql`), de-duplicated by exact `link_url` match — not grouped/merged by organization name with a "Posted in N groups" badge, which needs the full dedup engine `supabase/schema.sql`'s closing notes still describe as not built (see CLAUDE.md's Core architectural rule section). "Unverified" reuses `announcements.link_verified` — a later pass found this was never actually set by anything (the AI's own extraction schema never included it; the column just sat at its DB default of `true`), and replaced that gap with a real deterministic domain-allowlist check (`lib/ingestion/verify-link.ts`, computed at ingestion time, not a live regex pass run by this page) rather than an AI judgment call — see CLAUDE.md's §Link verification and §Communities directory.

#### 4. Dashboard Contextual Drawers & Panels (Not Top-Level Pages)
* **Message Ingestion Drawer (`StudentIngestionDrawer`):** Slide-over triggered from the dashboard containing:
  * **Bulk Paste Box [Source 1.2 - MVP]:** Primary demo flow for pasting 50+ messy chat messages.
  * **WhatsApp Chat Export Upload [Source 1.3 - MVP]:** File uploader for official `.txt` exports, stripping system notices.
  * **Web Share Target [Source 1.1 - Phase 2 — Deferred but Committed]:** OS-level share receiver; deferred to Phase 2 due to mobile browser OS variations (specifically iOS Safari limitations) while Bulk Paste provides universal MVP coverage.

  > **As built:** implemented as its own tab/route, `/student/ingest`, not a dashboard slide-over — same supersession as the "Don't Miss This" lane below. Bulk Paste and WhatsApp `.txt` Upload are both real; Web Share Target is a visibly disabled "Coming soon" tile, matching this doc's own Phase-2 tag for it. See CLAUDE.md's §Ingestion page.
* **Trace-to-Source Drawer (`TraceToSourceDrawer`) [Source 3.3]:** Slide-over triggered by tapping any announcement card, displaying verbatim raw text, sender, timestamp, and batch ID.
* **Contradiction Callout (`ContradictionBanner`) [Source 3.2]:** In-card warning banner displaying conflicting details across merged sources (e.g., *"Source A says Room 201; Source B says Room 304"*).
* **Confidence Explainer (`ConfidenceBadge`) [Source 2.7]:** In-card badge (`✅ Clear`, `⚠️ Partially clear`, `❓ Unclear`) with an interactive popover explaining what information is missing.
* **Engagement Toggles (`InterestButtonGroup`) [Source 4.1]:** 1-tap card buttons for:
  * `Interested`: Activates clash monitoring and highlights card.
  * `Registered`: Hard commitment, escalates clash severity to critical.
  * `Not Interested`: Suppresses or reduces relevant reminders, digests, and clash alerts. *[Approved Product Decision]*: It does **not delete the announcement from the database** or erase its historical audit trace; the student can still locate it in search or general views.

---

### Area B: Admin Experience

The Admin interface is dedicated to Class Representatives (CRs) and Society Coordinators. It provides structured data entry to eliminate ambiguity at the source, preventing campus chaos.

#### 1. Admin Dashboard (`/admin/dashboard`)
* Overview of active announcements posted within the admin's verified scope.
* Quick status counters: Published updates, Active class notices, Upcoming society events.
* Prominent **Verified Scope Header** displaying the admin's verified role (e.g., *"Class Representative — Computer Science, Section B"* or *"Society Coordinator — Robotics Club"*).

#### 2. Submit Class Update (`/admin/submit/class`) [Source 5.1]
Focused structured form for CRs:
* **Fields:** Course Name, Course Code, Target Section, Date, Time Slot, Teacher Name.
* **Action Status:** Radio selector for `Cancelled`, `Rescheduled`, `Room Shift`, or `Urgent Announcement`.
* **Optional Supporting Message:** Textbox to paste the teacher's original WhatsApp message for verification.
* **Deterministic Guard:** Validates against the timetable database; if the course/section is unrecognized, it flags *"Unmatched class — please verify"* before submission.

#### 3. Submit Society / Event Update (`/admin/submit/society`) [Source 5.1]
Structured form for Society Leads:
* **Fields:** Society/Club Name, Event Title, Date, Start Time, End Time, Venue/Room.
* **Capacity:** Seat Count (or checkbox for *"Unlimited / Open"*).
* **Registration:** Registration Deadline timestamp and Official Form/Registration URL.
* **Optional Supporting Message:** Raw text or notice paste.

#### 4. Submission History (`/admin/history`) [Approved Product Decision]
* Tab or view showing the admin's **own submitted updates**.
* Displays timestamp, delivery status, and whether the update is currently active or superseded.
* *[Anti-Scope Rule]*: **No global moderation queue.** Admins do not review student pastes or other admins' posts. They only view and manage their own scoped updates.

---

### Area C: Shared Intelligence Layer

The shared intelligence layer governs how unstructured data becomes reliable, actionable information.

#### 1. Announcement Lifecycle [Approved Product Decision]
Every piece of information transitions through an automated lifecycle:

```
[ Raw Message Ingested ]
           │
           ▼
[ Parsed & Structured ] ──(Missing critical fields / conflicting)──► [ Needs Review ]
           │                                                                 │
           ▼                                                                 ▼
[ Classified & Tagged ]                                        (Automated warning label)
           │                                                                 │
           ▼                                                                 ▼
[ Published to Relevant Users ] ◄────────────────────────────────────────────┘
           │
           ├──(Newer update cancels/reschedules this)──► [ Superseded ]
           │
           └──(Deadline or event timestamp elapses)───► [ Archived ]
```

* `Ingested`: Raw text stored immutably in `raw_messages`.
* `Parsed`: AI extracts entities into defined JSON schema.
* `Classified`: Assigned to fixed category taxonomy.
* `Needs Review`: **Primarily an automated system state** for incomplete, ambiguous, or contradictory data. **It does NOT imply a human moderation queue.** Publishing does **NOT require manual admin approval in the MVP**. Notices in `Needs Review` are published directly to students with visible warning badges (`⚠️ Partially clear` / `❓ Unclear` / Contradiction banner) so students retain autonomy.
* `Published`: Active on student dashboards matching course/section.
* `Superseded`: An existing announcement is updated or cancelled by a verified source (e.g., class rescheduled again).
* `Archived`: Date has passed; moved to historical view.

#### 2. Source Trust Hierarchy & Contradiction Handling [Approved Product Decision]
When conflicting notices arrive, the system calculates precedence without hiding discrepancies:
1. **Tier 1 — Verified Admin Submission:** Direct structured submission by a scoped CR or Society Coordinator.
2. **Tier 2 — Multi-Source Consensus:** Information independently extracted and matching across $\ge 2$ unverified forwards.
3. **Tier 3 — Single Attributed Forward:** Extracted from 1 forward with identifiable sender/timestamp.
4. **Tier 4 — Unattributed Fragment:** Low-confidence text snippet.

> [!IMPORTANT]
> **Precedence Never Erases Contradictions:** The Source Trust Hierarchy ranks evidence to select the primary displayed value, but it **never silently overwrites or discards conflicting details**. All conflicting values remain accessible through in-card **Contradiction Callouts** and the **Trace-to-Source Drawer**.

#### 3. Strict No-Invention Rules [Approved Product Decision]
The AI is programmatically forbidden from fabricating:
* Exact Dates or Times (if relative like *"tomorrow"*, it must resolve strictly against message timestamp or report `null`).
* Venues or Room numbers.
* Deadlines or Submission links.
* Seat counts (must flag `seat_count_unclear: true` if unstated).
* Course names or sections (must not guess from teacher nicknames).
* Registration commitments (must never assume a student is registered).

#### 4. Student Announcement Card Contract [Approved Product Decision]
Every student-facing card must render these standardized fields:
* `category`: One of 9 fixed taxonomy badges.
* `title`: Normalized, clear headline.
* `temporal_info`: Formatted Date and Time (or *"Time Unspecified"*).
* `priority_badge`: Computed Urgency × Consequence indicator.
* `confidence_badge`: `✅ Clear`, `⚠️ Partially clear`, or `❓ Unclear`.
* `why_it_matters`: Exactly 1 consequence-driven sentence.
* `what_to_do_next`: Exactly 1 verb-led action directive.
* `source_count`: Badge showing *"Confirmed by N sources"*.
* `engagement_state`: 1-tap toggles for *Interested*, *Registered*, *Not Interested*.
* `clash_status`: Visual conflict callout covering all 3 clash types (Class vs Class, Class vs Event, Event vs Event).
* `trace_trigger`: Button opening `TraceToSourceDrawer`.

---

### Area D: Platform Layer

#### 1. Authentication & Role Segregation [Approved Product Decision]
* Entry route: `/login` presents a role selection screen:
  * **Student Login Button** $\rightarrow$ the student login/signup state of `/login` (implemented as internal UI state on the one route, not a separate `/student/login` URL — see CLAUDE.md §Login / role selection).
  * **Admin Login Button** $\rightarrow$ the admin login state of `/login`, same route (not a separate `/admin/login` URL).
* Post-authentication redirects:
  * Student $\rightarrow$ `/student/dashboard`.
  * Admin $\rightarrow$ `/admin/dashboard`.
* **Admin Provisioning Model [Approved Product Decision]:**
  * For MVP, admin accounts are **manually provisioned** in the Supabase database by the system owner (assigning `role = 'admin'` and setting `scoped_department`, `scoped_section`, or `scoped_society`). There is no public admin registration in MVP to prevent spoofing.

#### 2. Ingestion States [Approved Product Decision]
The user-visible ingestion interface must support these 9 distinct states:
1. `Empty`: Initial clean state with paste instructions.
2. `Ready`: Text entered or file attached, ready for submission.
3. `Processing`: Animated shimmer/progress indicator (*"Extracting entities & checking clashes..."*).
4. `Successfully Parsed`: All cards generated with `✅ Clear` confidence.
5. `Partially Parsed`: Some notices extracted, but missing fields flagged as `⚠️ Partially clear`.
6. `Needs Clarification`: Ambiguous messages placed in `Uncategorized` with user confirmation prompts.
7. `Duplicate Input`: Input identical to existing batch; reports *"Already processed — confirmed source added"*.
8. `Unsupported Format`: Non-text export or corrupted file rejected gracefully.
9. `Failed`: Network/API error with clear retry option.

#### 3. Privacy Boundaries, Admin Data Access & Offline Security [Approved Product Decision]
* **Admin Data Access Boundary:**
  * Admins may access **only** their own submissions (`admin_submissions`) and authorized public structured outputs (`announcements`).
  * Admins **must NOT access private student raw-message pastes or private student ingestion records**.
  * This restriction is strictly enforced at the database engine level via **Supabase Row-Level Security (RLS)**, not merely by hiding UI buttons.
* **Raw Message Privacy:** Student-pasted raw messages are strictly private to that student (`raw_messages.user_id = auth.uid()`).
* **Offline Caching Boundaries:** 
  * Only the PWA app shell and non-sensitive structured cards (`announcements`) may be cached in browser storage.
  * **Raw message text is NEVER cached offline** in unencrypted browser storage to protect privacy on shared devices.

---

## 3. Delivery Phasing: MVP, Phase 2, and Stretch

| Feature Name | Feature ID | Delivery Phase | Phasing Rationale |
| :--- | :--- | :--- | :--- |
| Student & Admin Authentication (/login split) | 6.2 | **MVP** | Core security foundation |
| Separate Student & Admin Interfaces | 6.2 | **MVP** | Essential role segregation |
| Bulk Paste Ingestion Drawer | 1.2 | **MVP** | Primary live demo ingestion flow |
| WhatsApp Chat Export (.txt) Upload | 1.3 | **MVP** | Official zero-API chat data ingestion |
| Manual Timetable Input | 1.4 | **MVP** | Ground truth for clash detection |
| Fixed 9-Category Classification | 2.1 | **MVP** | Core structure from chaos |
| Priority Ranking (Urgency × Consequence) | 2.2 | **MVP** | Core prioritization value proposition |
| Time-Decay Demo Toggle | 2.3 | **MVP** | Proves living assistant capabilities |
| Deterministic Clash Detector (All 3 types) | 2.4 | **MVP** | Class vs Class, Class vs Event, Event vs Event |
| Cancelled-Class Free-Slot Matcher | 2.5 | **MVP** | Core differentiating innovation |
| Deduplication ("Confirmed by N sources") | 2.6 | **MVP** | Solves repeat message fatigue |
| Incompleteness Badges (Clear/Partial/Unclear) | 2.7 | **MVP** | Trust & transparency core |
| "Why It Matters" + "What To Do Next" | 3.1 | **MVP** | Action-oriented output requirement |
| Transparent Contradiction Warning Banner | 3.2 | **MVP** | Trust pillar: no silent decisions |
| Trace-to-Source Drawer | 3.3 | **MVP** | Trust pillar: auditability |
| Interested / Not Interested / Registered Toggles | 4.1 | **MVP** | Drives downstream alert gating |
| Conditional Clash Alerts (Interested-Gated) | 4.2 | **MVP** | Prevents notification fatigue |
| "Don't Miss This" Discovery Feed | 4.3 | **MVP** | Ensures rare opportunities aren't lost |
| Communities Directory (Group Links) | 4.4 | **MVP** | Solves group link scrollback clutter |
| "What Changed" Diff Banner vs last_seen_at | 4.5 | **MVP** | Eliminates re-scanning fatigue |
| Admin Class Update Submission Form | 5.1 | **MVP** | Source chaos reduction for CRs |
| Admin Society Event Submission Form | 5.1 | **MVP** | Source chaos reduction for Clubs |
| Admin Verified Scope Header & Isolation | 5.2 | **MVP** | Spoofing & misinformation prevention |
| Admin Submission History (Own Updates) | 5.1 | **MVP** | Feedback confirmation for admins |
| Supabase Auth, PostgreSQL & Core RLS | Platform | **MVP** | Robust backend infrastructure with raw privacy |
| Responsive PWA Shell & Installability | 6.1 | **MVP** | App-like feel without app store friction |
| AI Timetable Image/PDF Parsing (OCR) | 1.4 | **Phase 2 — Deferred but Committed** | Deferred to Phase 2 to tune vision OCR models for diverse schedule templates; manual entry handles MVP ground truth. |
| PWA Web Share Target Registration | 1.1 | **Phase 2 — Deferred but Committed** | Deferred to Phase 2 due to iOS Safari Web Share Target limitations; Bulk Paste provides universal MVP support. |
| Offline Structured-Data Caching | Platform | **Phase 2 — Deferred but Committed** | Enhanced offline PWA service worker caching |
| Advanced Dynamic Reranking & Time Decay | 2.3 | **Phase 2 — Deferred but Committed** | Background cron recalculation engine |
| WhatsApp Business Bot (Meta Cloud API Sandbox) | 5.3 | **Stretch** | External Meta business sandbox setup |

---

## 4. Unresolved Product Decisions

The following items are recognized as open design considerations and **will not be implemented** until explicitly resolved:

1. **[Unresolved Decision] Student Enrollment Verification:**  
   In MVP, students select their department and section manually in profile settings. Whether student enrollment should be verified via institutional email domain (`@university.edu`) or student ID upload remains open for Phase 2.
2. **[Unresolved Decision] Cross-Section Shared Course Cancellations:**  
   How to resolve when Course X is shared across Section A and Section B, but only Section A's CR submits a cancellation. In MVP, announcements are strictly filtered by `target_section`.
3. **[Unresolved Decision] Raw Message Data Retention Policy:**  
   A 30-day rolling purge of `raw_messages` was proposed, but **is NOT finalized**. Deciding on the final retention policy requires evaluating:
   * **Privacy & Data Minimization:** How long private student chat pastes should be held on the server.
   * **User Deletion Requests:** Mechanism for students to delete their uploaded raw messages immediately on demand.
   * **Debugging & Extraction Quality:** Retaining raw text long enough to diagnose AI parsing anomalies.
   * **Database Storage Limits:** PostgreSQL row and text storage capacity under large chat exports.
   * **Trace-to-Source Audit Availability:** Retaining raw messages as long as their derived announcements remain active and unarchived.
