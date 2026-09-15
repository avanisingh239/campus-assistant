"use client";

import { useMemo, useState } from "react";
import type { DashboardAnnouncement } from "@/lib/dashboard/types";
import type { EngagementStatus } from "@/lib/deterministic/types";
import type { DiffSummary } from "@/lib/dashboard/diff-summary";
import { setAnnouncementStatus } from "@/lib/engagement/actions";
import { dismissDiffBanner } from "@/lib/dashboard/actions";
import { supportsEngagementToggle } from "@/lib/dashboard/category-meta";
import { isDiscoveryWorthy, buildDiscoverFeed } from "@/lib/dashboard/discover-feed";
import { collectClashedAnnouncementIds, type ClashAnnouncementRef } from "@/lib/dashboard/clash-flags";
import { filterAnnouncements, type DashboardFilter } from "@/lib/dashboard/category-filter";
import { Card } from "./card";
import { StatRow } from "./stat-row";
import { CategoryFilterTabs } from "./category-filter-tabs";
import { FreeSlotSpotlight } from "./free-slot-spotlight";
import { HowThisWorks } from "./how-this-works";
import { BellIcon, LightningIcon } from "@/components/icons";
import { CanvasBackground } from "@/components/canvas-background";
import { AppHeader } from "../app-header";
import { TabRow } from "../tab-row";
import shellStyles from "../shell.module.css";
import styles from "./dashboard.module.css";

/** page.tsx's query already filters to `matched_announcement_id is not null`. */
interface FreeSlotRow {
  id: string;
  timetable_entry_id: string;
  cancellation_announcement_id: string;
  matched_announcement_id: string;
  status: "possible" | "confirmed";
  created_at: string;
}

/**
 * Client Component: owns interactivity (engagement pills, diff-banner
 * dismiss, trace-to-source toggles live inside Card) and the mutable copy
 * of `announcements` that optimistic updates write to. Everything
 * structural/visual is a direct port of dashboard.html; see
 * app/student/dashboard/page.tsx for what's real vs. the prototype's
 * hardcoded example data.
 *
 * Also owns the four-element follow-up pass documented in CLAUDE.md's
 * §Student Dashboard: the stat row, the category filter tabs, the
 * free-slot spotlight, and the "How this works" trust link. All four are
 * derived from data this component already had (`announcements`) plus
 * two new props (`clashes`/`freeSlots`) — no new page beyond page.tsx's
 * two extra queries.
 */
export function DashboardClient({
  announcements: initialAnnouncements,
  urgentId,
  diffSummary,
  nowIso,
  clashes,
  freeSlots,
}: {
  announcements: DashboardAnnouncement[];
  urgentId: string | null;
  diffSummary: DiffSummary;
  nowIso: string;
  clashes: ClashAnnouncementRef[];
  freeSlots: FreeSlotRow[];
}) {
  const now = new Date(nowIso);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>("all");

  // "Things need a decision from you" - eligible-for-engagement items the
  // student hasn't weighed in on yet (docs/product-spec.md's own framing
  // for this hero stat) — also stat row element #1, same count.
  const heroCount = announcements.filter(
    (a) => supportsEngagementToggle(a.category) && a.engagementStatus === "none",
  ).length;

  const announcementsById = useMemo(() => new Map(announcements.map((a) => [a.id, a])), [announcements]);
  const clashedAnnouncementIds = useMemo(() => collectClashedAnnouncementIds(clashes), [clashes]);
  // Stat row element #4: reuses buildDiscoverFeed's not-interested exclusion
  // (the one rule that needs the shaped/joined data) rather than
  // re-deriving it — only the category predicate (isDiscoveryWorthy) is new,
  // since the dedicated /student/dont-miss-this page pushes that filter
  // into SQL instead of exposing it as a JS function.
  const dontMissCount = buildDiscoverFeed(announcements.filter(isDiscoveryWorthy)).length;
  const visibleAnnouncements = filterAnnouncements(announcements, filter, clashedAnnouncementIds);

  // Free-slot spotlight: freeSlots is already pre-filtered server-side to
  // rows with a matched_announcement_id, ordered newest-first, so [0] is
  // the most recent real match, if any.
  const spotlightSlot = freeSlots[0] ?? null;
  const spotlightMatch = spotlightSlot ? announcementsById.get(spotlightSlot.matched_announcement_id) ?? null : null;
  const spotlightCancellation = spotlightSlot
    ? announcementsById.get(spotlightSlot.cancellation_announcement_id) ?? null
    : null;

  function handleViewSpotlight() {
    if (!spotlightMatch) return;
    setFilter("all");
    requestAnimationFrame(() => {
      document.getElementById(`announcement-${spotlightMatch.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

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

  async function handleDismissBanner() {
    setBannerDismissed(true);
    try {
      await dismissDiffBanner();
    } catch (err) {
      // Not worth reverting the banner for — worst case it just reappears
      // next visit since last_seen_at didn't actually save.
      setActionError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  return (
    <CanvasBackground>
      <div className={shellStyles.wrap}>
        <AppHeader now={now} heroCount={heroCount} heroLabel="things need a decision from you today" />

        <HowThisWorks />

        {!bannerDismissed && diffSummary.kind !== "no_changes" && (
          <div className={styles.diffbar}>
            <div className={styles.diffbarIcon}>
              <BellIcon />
            </div>
            <div className={styles.diffbarText}>
              {diffSummary.kind === "first_visit" ? (
                <>
                  <strong>Welcome!</strong> Here&apos;s your initial briefing — everything below is new.
                </>
              ) : (
                diffSummary.text
              )}
            </div>
            <button className={styles.diffDismiss} onClick={handleDismissBanner}>
              Got it
            </button>
          </div>
        )}

        {actionError && (
          <div className="card" style={{ borderColor: "var(--urgent)" }}>
            {actionError}
          </div>
        )}

        <StatRow thingsToDo={heroCount} potentialClashes={clashes.length} freeSlots={freeSlots.length} dontMiss={dontMissCount} />

        {spotlightMatch && (
          <FreeSlotSpotlight matched={spotlightMatch} cancellation={spotlightCancellation} onView={handleViewSpotlight} />
        )}

        <TabRow active="dashboard" />

        <p className={shellStyles.sectionLabel}>
          <LightningIcon />
          Top priorities
        </p>

        {announcements.length > 0 && <CategoryFilterTabs active={filter} onChange={setFilter} />}

        {announcements.length === 0 ? (
          <div className={shellStyles.emptyState}>
            <h2>You&apos;re all caught up</h2>
            <p>No announcements yet — paste messages to begin.</p>
          </div>
        ) : visibleAnnouncements.length === 0 ? (
          <div className={shellStyles.emptyState}>
            <h2>Nothing here</h2>
            <p>No announcements match this filter right now.</p>
          </div>
        ) : (
          <div className={shellStyles.cards}>
            {visibleAnnouncements.map((announcement) => (
              <Card
                key={announcement.id}
                announcement={announcement}
                isUrgent={announcement.id === urgentId}
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
