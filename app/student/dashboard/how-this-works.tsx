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
        </div>
      )}
    </div>
  );
}
