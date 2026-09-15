"use client";

import { useMemo, useState } from "react";
import {
  addTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  type TimetableEntryInput,
} from "@/lib/timetable/actions";
import { buildWeeklyGrid } from "@/lib/timetable/weekly-grid";
import { buildEntryStatusMap } from "@/lib/timetable/entry-status";
import type { TimetableEntry } from "@/lib/timetable/types";
import { WEEKDAYS } from "@/lib/dashboard/format";
import { CanvasBackground } from "@/components/canvas-background";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "@/components/icons";
import { AppHeader } from "../app-header";
import { TabRow } from "../tab-row";
import { TimetableForm } from "./timetable-form";
import { EntryBlock } from "./entry-block";
import shellStyles from "../shell.module.css";
import styles from "./timetable.module.css";

interface ClashRow {
  timetable_entry_id: string | null;
  announcement_id: string | null;
  severity: "possible" | "confirmed";
}

interface FreeSlotRow {
  timetable_entry_id: string;
  matched_announcement_id: string | null;
}

interface AnnouncementTitleRow {
  id: string;
  title: string;
}

type Screen = "empty" | "list" | "form";

function screenForCount(count: number): "empty" | "list" {
  return count === 0 ? "empty" : "list";
}

/**
 * One route, internal client-side state (docs/product-spec.md Area A.2 /
 * Feature 1.4) — matches the consolidation approach already used for
 * /login, per the task. Three of the four states the task calls for
 * ("empty", "list" = the populated weekly view, "form" = add or edit) are
 * this component's own screen state; the fourth (delete) is just the
 * form's Delete button, since editing and removing an entry share the
 * same entry point (tapping a block in the weekly view).
 *
 * `entries` is kept as local optimistic state, same
 * update-then-revert-on-failure shape as dashboard-client.tsx, except
 * here a failure doesn't need reverting — the Server Actions
 * (lib/timetable/actions.ts) are the only source of truth for `id`s and
 * there's nothing to optimistically fake before they return, so each
 * mutation just waits for the action, then updates local state from its
 * result.
 *
 * `clashes`/`freeSlots`/`announcementTitles` are point-in-time data from
 * the initial page load, not re-fetched after a client-side add/edit/
 * delete — the Server Actions already re-run `syncClashesForStudent` on
 * every mutation, so the underlying `clashes` table is always correct,
 * but this component doesn't round-trip back to the server to pick up
 * the new result mid-session. A student will see the badges update after
 * their next page load. Acceptable scope for "surface what's already
 * being computed," not a live-sync requirement.
 */
export function TimetableScreen({
  initialEntries,
  clashes,
  freeSlots,
  announcementTitles,
}: {
  initialEntries: TimetableEntry[];
  clashes: ClashRow[];
  freeSlots: FreeSlotRow[];
  announcementTitles: AnnouncementTitleRow[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [screen, setScreen] = useState<Screen>(screenForCount(initialEntries.length));
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const announcementTitleById = useMemo(
    () => new Map(announcementTitles.map((a) => [a.id, a.title])),
    [announcementTitles],
  );
  const entryStatusById = useMemo(
    () => buildEntryStatusMap(entries, clashes, freeSlots, announcementTitleById),
    [entries, clashes, freeSlots, announcementTitleById],
  );

  function openAddForm() {
    setEditingEntry(null);
    setActionError(null);
    setScreen("form");
  }

  function openEditForm(entry: TimetableEntry) {
    setEditingEntry(entry);
    setActionError(null);
    setScreen("form");
  }

  function closeForm() {
    setScreen(screenForCount(entries.length));
    setEditingEntry(null);
  }

  async function handleSubmit(input: TimetableEntryInput) {
    setSaving(true);
    setActionError(null);
    try {
      if (editingEntry) {
        await updateTimetableEntry(editingEntry.id, input);
        setEntries((current) =>
          current.map((e) => (e.id === editingEntry.id ? { ...e, ...input } : e)),
        );
      } else {
        const { id } = await addTimetableEntry(input);
        const newEntry: TimetableEntry = {
          id,
          student_id: "",
          day_of_week: input.day_of_week,
          start_time: input.start_time,
          end_time: input.end_time,
          course_name: input.course_name,
          section: input.section ?? null,
          teacher_name: input.teacher_name ?? null,
          teacher_name_confirmed: true,
        };
        setEntries((current) => [...current, newEntry]);
      }
      setScreen("list");
      setEditingEntry(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save this class.");
      throw err; // tells the form not to reset its fields
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingEntry) return;
    setSaving(true);
    setActionError(null);
    try {
      await deleteTimetableEntry(editingEntry.id);
      const remaining = entries.filter((e) => e.id !== editingEntry.id);
      setEntries(remaining);
      setScreen(screenForCount(remaining.length));
      setEditingEntry(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete this class.");
    } finally {
      setSaving(false);
    }
  }

  const columns = buildWeeklyGrid(entries);

  return (
    <CanvasBackground>
      <div className={shellStyles.wrap}>
        <AppHeader now={new Date()} heroCount={entries.length} heroLabel="classes on your timetable" />

        {actionError && (
          <div className="card" style={{ borderColor: "var(--urgent)" }}>
            {actionError}
          </div>
        )}

        <TabRow active="timetable" />

        <p className={shellStyles.sectionLabel}>
          <CalendarIcon />
          Timetable
        </p>

        {screen === "empty" && (
          <div className={shellStyles.emptyState}>
            <h2>Add your first class</h2>
            <p>Your timetable is empty — add a class to start catching clashes and free slots.</p>
            <Button className={styles.actionButton} onClick={openAddForm} style={{ maxWidth: 240, margin: "16px auto 0" }}>
              + Add a class
            </Button>
          </div>
        )}

        {screen === "form" && (
          <TimetableForm
            key={editingEntry?.id ?? "new"}
            initialEntry={editingEntry}
            saving={saving}
            onSubmit={handleSubmit}
            onDelete={editingEntry ? handleDelete : undefined}
            onCancel={closeForm}
          />
        )}

        {screen === "list" && (
          <>
            <div className={styles.toolbar}>
              <Button className={styles.actionButton} onClick={openAddForm}>
                + Add a class
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={styles.actionButton}
                disabled
                title="Upload parsing isn't built yet — add classes manually for now."
              >
                Upload image (coming soon)
              </Button>
            </div>
            <div className={styles.grid}>
              {columns.map((column) => (
                <div key={column.dayOfWeek} className={styles.dayColumn}>
                  <p className={styles.dayHeader}>{WEEKDAYS[column.dayOfWeek]}</p>
                  {column.entries.length === 0 ? (
                    <p className={styles.dayEmpty}>No classes</p>
                  ) : (
                    column.entries.map((entry) => (
                      <EntryBlock
                        key={entry.id}
                        entry={entry}
                        status={entryStatusById.get(entry.id)}
                        onEdit={() => openEditForm(entry)}
                      />
                    ))
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </CanvasBackground>
  );
}
