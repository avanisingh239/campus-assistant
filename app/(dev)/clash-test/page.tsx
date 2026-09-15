"use client";

/**
 * TEMPORARY dev harness for exercising the clash/free-slot engine
 * (lib/deterministic/) end to end against a real Supabase project. Not
 * part of the product UI — see app/(dev)/clash-test/actions.ts for why
 * this bypasses auth, and the same warning as app/(dev)/ingest-test/:
 * delete or gate this route before the app is reachable by anyone but
 * developers.
 *
 * Workflow: paste in a student's UUID (Supabase dashboard -> Authentication
 * -> Users -> copy the UUID), add one or more timetable entries for them,
 * mark some of the announcements already in the DB (from /ingest-test
 * testing) as Interested/Registered, then hit "Refresh" to see the
 * resulting clashes/free_slots rows.
 */

import { useEffect, useState } from "react";
import {
  devAddTimetableEntry,
  devSetEngagementStatus,
  devListRecentAnnouncements,
  devGetClashesAndFreeSlots,
  type AnnouncementSummary,
  type ClashSummary,
  type FreeSlotSummary,
} from "./actions";
import type { EngagementStatus } from "@/lib/deterministic/types";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ClashTestPage() {
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [entryForm, setEntryForm] = useState({
    day_of_week: 1,
    start_time: "09:00",
    end_time: "10:00",
    course_name: "",
  });
  const [addingEntry, setAddingEntry] = useState(false);

  const [announcements, setAnnouncements] = useState<AnnouncementSummary[]>([]);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const [results, setResults] = useState<{ clashes: ClashSummary[]; freeSlots: FreeSlotSummary[] } | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    devListRecentAnnouncements()
      .then(setAnnouncements)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function handleAddEntry() {
    setError(null);
    if (!studentId.trim()) {
      setError("Paste a student UUID above first.");
      return;
    }
    if (!entryForm.course_name.trim()) {
      setError("Course name is required.");
      return;
    }
    setAddingEntry(true);
    try {
      await devAddTimetableEntry({ studentId: studentId.trim(), ...entryForm });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingEntry(false);
    }
  }

  async function handleSetStatus(announcementId: string, status: EngagementStatus) {
    setError(null);
    if (!studentId.trim()) {
      setError("Paste a student UUID above first.");
      return;
    }
    setStatusUpdating(announcementId);
    try {
      await devSetEngagementStatus(studentId.trim(), announcementId, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatusUpdating(null);
    }
  }

  async function handleRefresh() {
    setError(null);
    if (!studentId.trim()) {
      setError("Paste a student UUID above first.");
      return;
    }
    setRefreshing(true);
    try {
      const data = await devGetClashesAndFreeSlots(studentId.trim());
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main>
      <h1>Clash &amp; free-slot engine — dev harness</h1>
      <p className="muted">
        Not part of the product UI. Tests <code>lib/deterministic/</code> against a real
        Supabase project — no auth, you provide the student ID directly.
      </p>

      <div className="card">
        <label htmlFor="studentId">Student UUID</label>
        <input
          id="studentId"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder="paste a UUID from Supabase Auth -> Users"
          style={{ display: "block", width: "100%", marginTop: "0.5rem" }}
        />
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#e5484d" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add a timetable entry</h2>
        <label htmlFor="day">Day</label>
        <select
          id="day"
          value={entryForm.day_of_week}
          onChange={(e) => setEntryForm({ ...entryForm, day_of_week: Number(e.target.value) })}
          style={{ display: "block", width: "100%", marginBlock: "0.5rem" }}
        >
          {DAY_LABELS.map((label, i) => (
            <option key={i} value={i}>
              {label} ({i})
            </option>
          ))}
        </select>
        <label htmlFor="start">Start time</label>
        <input
          id="start"
          type="time"
          value={entryForm.start_time}
          onChange={(e) => setEntryForm({ ...entryForm, start_time: e.target.value })}
          style={{ display: "block", width: "100%", marginBlock: "0.5rem" }}
        />
        <label htmlFor="end">End time</label>
        <input
          id="end"
          type="time"
          value={entryForm.end_time}
          onChange={(e) => setEntryForm({ ...entryForm, end_time: e.target.value })}
          style={{ display: "block", width: "100%", marginBlock: "0.5rem" }}
        />
        <label htmlFor="course">Course name</label>
        <input
          id="course"
          value={entryForm.course_name}
          onChange={(e) => setEntryForm({ ...entryForm, course_name: e.target.value })}
          placeholder="e.g. Database Systems"
          style={{ display: "block", width: "100%", marginBlock: "0.5rem" }}
        />
        <button onClick={handleAddEntry} disabled={addingEntry}>
          {addingEntry ? "Adding..." : "Add entry"}
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent announcements</h2>
        <p className="muted">
          Set the pasted-in student&apos;s engagement status on any of these (from earlier{" "}
          <code>/ingest-test</code> runs) to trigger class_vs_event / event_vs_event clash checks.
        </p>
        {announcements.length === 0 && <p className="muted">None yet — run /ingest-test first.</p>}
        {announcements.map((a) => (
          <div key={a.id} style={{ borderTop: "1px solid var(--border)", paddingBlock: "0.75rem" }}>
            <strong>{a.title}</strong>{" "}
            <span className="muted">
              [{a.category}] {a.event_date ?? "no date"} {a.start_time ?? "?"}-{a.end_time ?? "?"}
            </span>
            {a.linked_class_name && (
              <div className="muted">
                linked_class_name: &quot;{a.linked_class_name}&quot; (match_confidence:{" "}
                {a.match_confidence ?? "null"})
              </div>
            )}
            <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.4rem" }}>
              {(["interested", "registered", "not_interested", "none"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => handleSetStatus(a.id, status)}
                  disabled={statusUpdating === a.id}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Clashes &amp; free slots for this student</h2>
        <button onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Loading..." : "Refresh"}
        </button>

        {results && (
          <>
            <h3>Clashes ({results.clashes.length})</h3>
            <pre style={{ overflowX: "auto" }}>{JSON.stringify(results.clashes, null, 2)}</pre>
            <h3>Free slots ({results.freeSlots.length})</h3>
            <pre style={{ overflowX: "auto" }}>{JSON.stringify(results.freeSlots, null, 2)}</pre>
          </>
        )}
      </div>
    </main>
  );
}
