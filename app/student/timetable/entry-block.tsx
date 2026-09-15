"use client";

import { useState } from "react";
import type { TimetableEntry } from "@/lib/timetable/types";
import type { EntryStatus } from "@/lib/timetable/entry-status";
import { formatTimeRange } from "@/lib/dashboard/format";
import { StarIcon, WarningCircleIcon } from "@/components/icons";
import styles from "./timetable.module.css";

/**
 * One block in the weekly grid. Split out of timetable-screen.tsx once it
 * needed its own local state (the clash popover's open/closed toggle,
 * same "useState local to each instance" pattern as card.tsx's
 * trace-to-source toggle — see that component's regression test for why
 * this pattern is already trusted not to leak across sibling instances).
 *
 * Not a single outer `<button>` like before this pass — a clash badge
 * needed its own independent click target inside the block (tap it to
 * open the popover, not the edit form), and a `<button>` can't contain
 * another `<button>`. `.entryMain` (wrapping just the course/time text)
 * and the clash badge are separate sibling buttons inside a plain `<div>`
 * container instead.
 */
export function EntryBlock({
  entry,
  status,
  onEdit,
}: {
  entry: TimetableEntry;
  status: EntryStatus | undefined;
  onEdit: () => void;
}) {
  const [clashOpen, setClashOpen] = useState(false);

  const cancelled = status?.cancelled ?? false;
  const worstSeverity = status?.worstSeverity ?? null;

  return (
    <div className={styles.entryBlock}>
      <button type="button" className={styles.entryMain} onClick={onEdit}>
        <p className={cancelled ? `${styles.entryCourse} ${styles.entryCourseCancelled}` : styles.entryCourse}>
          {entry.course_name}
        </p>
        <p className={styles.entryTime}>{formatTimeRange(entry.start_time, entry.end_time)}</p>
        {(entry.section || entry.teacher_name) && (
          <p className={styles.entryMeta}>
            {[entry.section, entry.teacher_name].filter(Boolean).join(" · ")}
            {entry.teacher_name && !entry.teacher_name_confirmed ? " (unconfirmed)" : ""}
          </p>
        )}
      </button>

      {cancelled && (
        <div className={styles.cancelledRow}>
          <span className={styles.cancelledBadge}>Cancelled</span>
          {status?.matchedAnnouncementTitle && (
            <p className={styles.matchedNote}>
              <StarIcon />
              This slot fits: {status.matchedAnnouncementTitle}
            </p>
          )}
        </div>
      )}

      {worstSeverity && (
        <div className={styles.clashSection}>
          <button
            type="button"
            className={`${styles.clashBadge} ${
              worstSeverity === "confirmed" ? styles.clashBadgeConfirmed : styles.clashBadgePossible
            }`}
            onClick={() => setClashOpen((open) => !open)}
          >
            <WarningCircleIcon />
            {worstSeverity === "confirmed" ? "Clash" : "Possible clash"}
          </button>
          {clashOpen && (
            <div className={styles.clashPopover}>
              {status!.clashes.map((clash, i) => (
                <p key={i} className={styles.clashPopoverLine}>
                  <strong>{clash.severity === "confirmed" ? "Confirmed" : "Possible"}</strong> — clashes with{" "}
                  {clash.label}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
