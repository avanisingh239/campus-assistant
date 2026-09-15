"use client";

import { useState } from "react";
import Link from "next/link";
import type { DashboardAnnouncement } from "@/lib/dashboard/types";
import type { EngagementStatus } from "@/lib/deterministic/types";
import type { DiffSummary } from "@/lib/dashboard/diff-summary";
import { setAnnouncementStatus } from "@/lib/engagement/actions";
import { dismissDiffBanner } from "@/lib/dashboard/actions";
import { supportsEngagementToggle } from "@/lib/dashboard/category-meta";
import { formatHeaderDate } from "@/lib/dashboard/format";
import { Card } from "./card";
import {
  LogoMark,
  BellIcon,
  StarIcon,
  TwoCirclesIcon,
  CalendarIcon,
  ChatBubbleIcon,
  ActionPlanIcon,
  LightningIcon,
} from "./icons";
import styles from "./dashboard.module.css";

/**
 * Client Component: owns interactivity (engagement pills, diff-banner
 * dismiss, trace-to-source toggles live inside Card) and the mutable copy
 * of `announcements` that optimistic updates write to. Everything
 * structural/visual is a direct port of dashboard.html; see
 * app/student/dashboard/page.tsx for what's real vs. the prototype's
 * hardcoded example data.
 */
export function DashboardClient({
  announcements: initialAnnouncements,
  urgentId,
  diffSummary,
  nowIso,
}: {
  announcements: DashboardAnnouncement[];
  urgentId: string | null;
  diffSummary: DiffSummary;
  nowIso: string;
}) {
  const now = new Date(nowIso);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // "Things need a decision from you" - eligible-for-engagement items the
  // student hasn't weighed in on yet (docs/product-spec.md's own framing
  // for this hero stat).
  const heroCount = announcements.filter(
    (a) => supportsEngagementToggle(a.category) && a.engagementStatus === "none",
  ).length;

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
    <div className={styles.site}>
      <div className={`${styles.bgSym} ${styles.s1}`}>
        <StarIcon />
      </div>
      <div className={`${styles.bgSym} ${styles.s2}`}>
        <TwoCirclesIcon />
      </div>
      <div className={`${styles.bgSym} ${styles.s3}`}>
        <CalendarIcon />
      </div>
      <div className={`${styles.bgSym} ${styles.s4}`}>
        <ChatBubbleIcon />
      </div>

      <div className={styles.wrap}>
        <div className={styles.topbar}>
          <div className={styles.headerRow}>
            <div className={styles.brandBlock}>
              <div className={styles.logoMark}>
                <LogoMark />
              </div>
              <div>
                <p className={styles.appName}>Rescript</p>
                <p className={styles.tagline}>Your campus, clarified.</p>
              </div>
            </div>

            <div className={styles.heroRow}>
              <div className={styles.heroBadge}>
                <div className={styles.heroNumber}>{heroCount}</div>
                <div className={styles.heroSub}>today</div>
              </div>
              <div>
                <p className={styles.greeting}>{formatHeaderDate(now)}</p>
                <div className={styles.heroLabel}>things need a decision from you today</div>
              </div>
            </div>
          </div>
        </div>

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

        <div className={styles.tabRow}>
          <Link href="/student/dashboard" className={`${styles.tab} ${styles.tabActive}`}>
            <ActionPlanIcon />
            Action plan
          </Link>
          <Link href="/student/dont-miss-this" className={styles.tab}>
            <StarIcon />
            Don&apos;t miss this
          </Link>
          <Link href="/student/communities" className={styles.tab}>
            <TwoCirclesIcon />
            Communities
          </Link>
          <Link href="/student/timetable" className={styles.tab}>
            <CalendarIcon />
            Timetable
          </Link>
        </div>

        <p className={styles.sectionLabel}>
          <LightningIcon />
          Top priorities
        </p>

        {announcements.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>You&apos;re all caught up</h2>
            <p>No announcements yet — paste messages to begin.</p>
          </div>
        ) : (
          <div className={styles.cards}>
            {announcements.map((announcement) => (
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
    </div>
  );
}
