import { LogoMark } from "@/components/icons";
import { formatHeaderDate } from "@/lib/dashboard/format";
import styles from "./shell.module.css";

/**
 * The brand block + date/hero-badge header shared by every real student
 * screen. Extracted out of dashboard-client.tsx once app/student/dont-
 * miss-this needed the same header with different badge semantics — the
 * badge shape/style is generic ("N of something"), but what it counts is
 * screen-specific (the dashboard's "N things need a decision from you
 * today" vs. this feed's own count/label), so those are passed in rather
 * than hardcoded here.
 */
export function AppHeader({
  now,
  heroCount,
  heroLabel,
}: {
  now: Date;
  heroCount: number;
  heroLabel: string;
}) {
  return (
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
            <div className={styles.heroLabel}>{heroLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
