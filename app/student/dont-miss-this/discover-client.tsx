"use client";

import { useState } from "react";
import type { DashboardAnnouncement } from "@/lib/dashboard/types";
import type { EngagementStatus } from "@/lib/deterministic/types";
import { setAnnouncementStatus } from "@/lib/engagement/actions";
import { StarIcon } from "@/components/icons";
import { CanvasBackground } from "@/components/canvas-background";
import { AppHeader } from "../app-header";
import { TabRow } from "../tab-row";
import { Card } from "../dashboard/card";
import shellStyles from "../shell.module.css";
import styles from "./discover.module.css";

/**
 * Client Component for the "Don't Miss This" discovery feed — same
 * optimistic-update-with-revert pattern as
 * app/student/dashboard/dashboard-client.tsx, reusing the exact same
 * `Card` (no URGENT ribbon here: every call site passes `isUrgent={false}`,
 * since that's a dashboard-specific priority device this feed doesn't
 * need) and shared shell pieces. No diff banner — this feed isn't the
 * "what changed since last visit" view, so there's nothing for one to
 * summarize.
 */
export function DiscoverClient({
  announcements: initialAnnouncements,
  nowIso,
}: {
  announcements: DashboardAnnouncement[];
  nowIso: string;
}) {
  const now = new Date(nowIso);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleStatusChange(announcementId: string, status: EngagementStatus) {
    const previous = announcements;
    setAnnouncements((current) =>
      current.map((a) => (a.id === announcementId ? { ...a, engagementStatus: status } : a)),
    );
    setActionError(null);
    try {
      await setAnnouncementStatus(announcementId, status);
    } catch (err) {
      setAnnouncements(previous);
      setActionError(err instanceof Error ? err.message : "Failed to update status.");
      throw err; // Card uses this to know not to fire confetti
    }
  }

  return (
    <CanvasBackground>
      <div className={shellStyles.wrap}>
        <AppHeader now={now} heroCount={announcements.length} heroLabel="opportunities you don't want to miss" />

        {actionError && (
          <div className="card" style={{ borderColor: "var(--urgent)" }}>
            {actionError}
          </div>
        )}

        <TabRow active="discover" />

        <p className={shellStyles.sectionLabel}>
          <StarIcon />
          Don&apos;t miss these
        </p>

        <p className={styles.pageNote}>
          Limited-seat opportunities and events that matter, shown here regardless of urgency, so they
          don&apos;t get buried under your more time-sensitive deadlines.
        </p>

        {announcements.length === 0 ? (
          <div className={shellStyles.emptyState}>
            <h2>Nothing new to discover right now</h2>
            <p>Check back after your groups post more.</p>
          </div>
        ) : (
          <div className={shellStyles.cards}>
            {announcements.map((announcement) => (
              <Card
                key={announcement.id}
                announcement={announcement}
                isUrgent={false}
                now={now}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </CanvasBackground>
  );
}
