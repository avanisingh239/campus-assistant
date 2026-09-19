"use client";

import { useState } from "react";
import type { DashboardAnnouncement } from "@/lib/dashboard/types";
import type { EngagementStatus } from "@/lib/deterministic/types";
import { CATEGORY_LABELS, CONFIDENCE_LABELS, supportsEngagementToggle } from "@/lib/dashboard/category-meta";
import { formatCapMeta, splitVerb, formatRelativeTimeCaps } from "@/lib/dashboard/format";
import { WarningCircleIcon, ArrowMergeIcon, ChainLinkIcon } from "@/components/icons";
import { assessDomainRisk, combinePaymentRiskSeverity } from "@/lib/ingestion/verify-link";
import { CategoryIcon } from "./icons";
import { confettiBurst } from "./confetti";
import styles from "./dashboard.module.css";

const ENGAGEMENT_OPTIONS: { status: EngagementStatus; label: string }[] = [
  { status: "interested", label: "Interested" },
  { status: "registered", label: "Registered" },
  { status: "not_interested", label: "Not interested" },
];

const CONFIDENCE_CLASS: Record<DashboardAnnouncement["confidence"], string> = {
  clear: styles.confidenceClear,
  partial: styles.confidencePartial,
  unclear: styles.confidenceUnclear,
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
  const confidence = {
    label: CONFIDENCE_LABELS[announcement.confidence],
    className: CONFIDENCE_CLASS[announcement.confidence],
  };
  const tagLabel = announcement.contradiction
    ? `Merged · ${announcement.sourceCount} sources`
    : CATEGORY_LABELS[announcement.category];

  // Domain risk signals compound an already-triggered payment_risk warning
  // — they never trigger one on their own (combinePaymentRiskSeverity
  // enforces that). Computed here, at render, rather than stored on the
  // row: it needs no schema migration, stays correct if the domain
  // red-flag lists ever change, and applies retroactively to announcements
  // ingested before this check existed. `title` + `why_it_matters` stands
  // in for the original raw message text (not available on this shaped
  // row) for the claimed-institution-mismatch check — the same text a
  // student already reads on the card, so nothing here relies on a signal
  // the student can't also see. See lib/ingestion/verify-link.ts's own
  // doc comments for the full reasoning.
  const domainRisk = announcement.link_url
    ? assessDomainRisk(announcement.link_url, `${announcement.title} ${announcement.why_it_matters ?? ""}`)
    : { risky: false, reasons: [] };
  const paymentRiskWarning = combinePaymentRiskSeverity(announcement.payment_risk, domainRisk);

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
    <div id={`announcement-${announcement.id}`} className={styles.card} data-category={announcement.category}>
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

        {paymentRiskWarning.message && (
          <div
            className={
              paymentRiskWarning.severity === "language_and_domain"
                ? `${styles.paymentRiskWarning} ${styles.paymentRiskWarningStrong}`
                : styles.paymentRiskWarning
            }
          >
            <div className={styles.paymentRiskHeadline}>
              <WarningCircleIcon />
              <span>{paymentRiskWarning.message}</span>
              {paymentRiskWarning.severity === "language_and_domain" && (
                <span className={styles.paymentRiskSeverityBadge}>HIGH RISK</span>
              )}
            </div>
            {/* Domain info is context here, never the trigger — the
                warning fires from the message text alone (verify-link.ts's
                detectPaymentRiskPattern), regardless of the link's own
                verification status or whether a link exists at all; the
                domain, when present, only ever compounds its severity. */}
            {announcement.link_url && (
              <div className={styles.paymentRiskLink}>
                {announcement.link_url}
                {!announcement.link_verified && <span className={styles.unverified}>⚠️ Unverified domain</span>}
              </div>
            )}
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
