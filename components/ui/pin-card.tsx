import type { ReactNode } from "react";
import styles from "../ui.module.css";

/**
 * A mint card with a pin dot at the top, matching the dashboard's card
 * language (see app/student/dashboard/dashboard.module.css's `.card`/
 * `.pin`) but generalized — no category shadow color, no rotation/stagger
 * animation. Used for /login's tappable role tiles and auth-form
 * container; deliberately NOT used for the dashboard's own Card, which
 * has enough category-driven, animated, multi-state behavior of its own
 * that reworking it onto this shared shape isn't worth the risk.
 */
export function PinCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.pinCard} ${className ?? ""}`}>
      <div className={styles.pin} />
      {children}
    </div>
  );
}
