"use client";

import { useState } from "react";
import styles from "./dashboard.module.css";

/**
 * Small, unobtrusive trust link near the header — an expandable panel
 * (not a full modal overlay, which this design system has no existing
 * primitive for) explaining the confidence badges and the "never guess"
 * extraction rule already documented in docs/ai-contracts.md §"Strict
 * No-Invention Rules" and enforced by lib/ai/extract.ts's system prompt.
 * Nothing here changes behavior — it's a visible acknowledgment that the
 * trust system is intentional, not an addition to it.
 */
export function HowThisWorks() {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.trustWrap}>
      <button type="button" className={styles.trustLink} onClick={() => setOpen((o) => !o)}>
        ℹ️ How this works
      </button>
      {open && (
        <div className={styles.trustPanel}>
          <p>
            Every card is scored <strong>✅ Clear</strong>, <strong>⚠️ Partially clear</strong>, or{" "}
            <strong>❓ Unclear</strong> based on how much the original message actually stated — a missing
            time, date, or room shows up as a lower badge, not a guess.
          </p>
          <p>
            Rescript never invents dates, rooms, deadlines, seat counts, or class matches. If the source text
            doesn&apos;t say it, the card says so instead of filling in something that sounds plausible.
          </p>
          <p>
            Marking <strong>Interested</strong> or <strong>Registered</strong> isn&apos;t just personal
            tracking — it&apos;s what powers scheduling-clash detection and prioritization. Items you
            haven&apos;t responded to won&apos;t be checked for conflicts.
          </p>
          <p>
            <strong>Events</strong> and <strong>opportunities</strong> are shown to everyone on the
            platform, not just your class — so you don&apos;t miss things happening elsewhere on campus.
          </p>
          <p>
            Marking something <strong>Not Interested</strong> removes it from your main feed so it stops
            cluttering your priorities — but it&apos;s not gone. You can review and change your mind
            anytime from the dismissed items section below your feed.
          </p>
        </div>
      )}
    </div>
  );
}
