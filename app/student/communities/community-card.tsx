"use client";

import { useState } from "react";
import type { DashboardAnnouncement } from "@/lib/dashboard/types";
import { formatRelativeTimeCaps } from "@/lib/dashboard/format";
import { ChainLinkIcon } from "@/components/icons";
import cardStyles from "../dashboard/dashboard.module.css";
import styles from "./communities.module.css";

/**
 * One entry in the Communities directory. Deliberately not the dashboard's
 * `Card` — see communities.module.css's doc comment for why — but reuses
 * that component's actual link-chip and trace-to-source markup/classes
 * verbatim (imported from ../dashboard/dashboard.module.css) rather than
 * redefining that styling here.
 */
export function CommunityCard({ link, now }: { link: DashboardAnnouncement; now: Date }) {
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <div className={styles.communityCard}>
      <div className={cardStyles.cardBody}>
        <p className={cardStyles.cardTitle}>{link.title}</p>
        {link.why_it_matters && <p className={cardStyles.cardWhy}>{link.why_it_matters}</p>}

        {link.link_url && (
          <div className={cardStyles.linkChip}>
            <ChainLinkIcon />
            {link.link_url}
            {!link.link_verified && <span className={cardStyles.unverified}>⚠️ Unverified</span>}
          </div>
        )}

        {link.traceSources.length > 0 && (
          <>
            <button className={cardStyles.traceToggle} onClick={() => setTraceOpen((open) => !open)}>
              {traceOpen ? "Hide" : "View"}{" "}
              {link.traceSources.length === 1 ? "original message" : `${link.traceSources.length} original messages`}
            </button>
            {traceOpen && (
              <div className={cardStyles.traceSource}>
                {link.traceSources.map((source, i) => (
                  <div key={source.id} style={i > 0 ? { marginTop: "8px" } : undefined}>
                    <div className={cardStyles.srcLabel}>
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
