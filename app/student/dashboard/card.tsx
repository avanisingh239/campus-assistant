"use client";

import { useState } from "react";
import type { DashboardAnnouncement } from "@/lib/dashboard/types";
import type { EngagementStatus } from "@/lib/deterministic/types";
import { CATEGORY_LABELS, supportsEngagementToggle } from "@/lib/dashboard/category-meta";
import { formatCapMeta, splitVerb, formatRelativeTimeCaps } from "@/lib/dashboard/format";
import { CategoryIcon, WarningCircleIcon, ArrowMergeIcon, ChainLinkIcon } from "./icons";
import { confettiBurst } from "./confetti";
import styles from "./dashboard.module.css";

const ENGAGEMENT_OPTIONS: { status: EngagementStatus; label: string }[] = [
  { status: "interested", label: "Interested" },
  { status: "registered", label: "Registered" },
  { status: "not_interested", label: "Not interested" },
];

const CONFIDENCE_META: Record<
  DashboardAnnouncement["confidence"],
  { label: string; className: string }
> = {
  clear: { label: "✅ Clear", className: styles.confidenceClear },
  partial: { label: "⚠️ Partially clear", className: styles.confidencePartial },
  unclear: { label: "❓ Unclear", className: styles.confidenceUnclear },
};

export function Card({
  announcement,
  isUrgent,
  now,
  onStatusChange,
}: {
  announcement: DashboardAnnouncement;
  isUrgent: boolean;
  now: Date;
  onStatusChange: (announcementId: string, status: EngagementStatus) => Promise<void>;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [pending, setPending] = useState<EngagementStatus | null>(null);

  const capMeta = formatCapMeta(announcement, now);
  const { verb, rest } = announcement.what_to_do_next
    ? splitVerb(announcement.what_to_do_next)
    : { verb: "", rest: "" };
  const confidence = CONFIDENCE_META[announcement.confidence];
  const tagLabel = announcement.contradiction
    ? `Merged · ${announcement.sourceCount} sources`
    : CATEGORY_LABELS[announcement.category];

  async function handlePillClick(status: EngagementStatus, event: React.MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    setPending(status);
    try {
      await onStatusChange(announcement.id, status);
      if (status === "registered") {
        confettiBurst(button);
      }
    } catch {
      // onStatusChange already reverts optimistic state on failure and
      // surfaces the error at the page level — nothing card-local to do.
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.card} data-category={announcement.category}>
      <div className={styles.pin} />
      <div className={styles.cardCap}>
        <div className={styles.iconChip}>
          <CategoryIcon category={announcement.category} />
        </div>
        <div className={styles.capMeta}>{capMeta}</div>
        <span className={styles.tag}>{tagLabel}</span>
      </div>

      <div className={styles.cardBody}>
        {isUrgent && (
          <div className={styles.urgentTag}>
            <WarningCircleIcon />
            URGENT
          </div>
        )}

        <span className={`${styles.cbadge} ${confidence.className}`}>{confidence.label}</span>
        <p className={styles.cardTitle}>{announcement.title}</p>

        {announcement.why_it_matters && <p className={styles.cardWhy}>{announcement.why_it_matters}</p>}

        {announcement.contradiction && (
          <>
            <p className={styles.mergeNote}>
              <ArrowMergeIcon />
              Reported by {announcement.sourceCount} sources — details disagree, see below
            </p>
            <div className={styles.contradiction}>{announcement.contradiction.summary}</div>
          </>
        )}

        {announcement.category === "society_link" && announcement.link_url && (
          <div className={styles.linkChip}>
            <ChainLinkIcon />
            {announcement.link_url}
            {!announcement.link_verified && <span className={styles.unverified}>⚠️ Unverified</span>}
          </div>
        )}

        {announcement.what_to_do_next && (
          <p className={styles.cardNext}>
            → <span className={styles.verb}>{verb}</span> {rest}
          </p>
        )}

        {supportsEngagementToggle(announcement.category) && (
          <div className={styles.cardActions}>
            {ENGAGEMENT_OPTIONS.map((option) => {
              const active = announcement.engagementStatus === option.status;
              const classNames = [styles.pill];
              if (active) classNames.push(styles.pillActive);
              if (active && option.status === "registered") classNames.push(styles.pillRegistered);
              return (
                <button
                  key={option.status}
                  className={classNames.join(" ")}
                  disabled={pending !== null}
                  onClick={(e) => handlePillClick(option.status, e)}
                >
                  {pending === option.status ? "…" : option.label}
                </button>
              );
            })}
          </div>
        )}

        {announcement.traceSources.length > 0 && (
          <>
            <button className={styles.traceToggle} onClick={() => setTraceOpen((open) => !open)}>
              {traceOpen ? "Hide" : "View"}{" "}
              {announcement.traceSources.length === 1
                ? "original message"
                : `${announcement.traceSources.length} original messages`}
            </button>
            {traceOpen && (
              <div className={styles.traceSource}>
                {announcement.traceSources.map((source, i) => (
                  <div key={source.id} style={i > 0 ? { marginTop: "8px" } : undefined}>
                    <div className={styles.srcLabel}>
                      FROM {(source.source_group_name ?? "UNKNOWN SOURCE").toUpperCase()} ·{" "}
                      {formatRelativeTimeCaps(source.created_at, now)}
                    </div>
                    &quot;{source.raw_text}&quot;
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
