import type { DashboardAnnouncement } from "@/lib/dashboard/types";
import { CheckCircleIcon } from "@/components/icons";
import styles from "./dashboard.module.css";

/**
 * The "a class got cancelled and something good fits in that gap"
 * callout — this product's most novel feature, so it gets its own
 * solid-color panel (similar visual weight to the diff banner/hero
 * badge), not just another card in the feed. Only ever rendered when
 * there's a real match to show — see dashboard-client.tsx, which passes
 * `null` for `matched` and skips rendering this component entirely
 * otherwise, rather than this component rendering an empty/placeholder
 * state itself.
 */
export function FreeSlotSpotlight({
  matched,
  cancellation,
  onView,
}: {
  matched: DashboardAnnouncement;
  cancellation: DashboardAnnouncement | null;
  onView: () => void;
}) {
  return (
    <div className={styles.spotlight}>
      <div className={styles.spotlightIcon}>
        <CheckCircleIcon />
      </div>
      <div className={styles.spotlightBody}>
        <p className={styles.spotlightEyebrow}>A slot just opened up</p>
        <p className={styles.spotlightText}>
          {cancellation ? (
            <>
              <strong>{cancellation.title}</strong> was cancelled — and{" "}
            </>
          ) : (
            "A class was cancelled, and "
          )}
          <strong>{matched.title}</strong> fits right in that gap.
        </p>
      </div>
      <button type="button" className={styles.spotlightCta} onClick={onView}>
        View it
      </button>
    </div>
  );
}
