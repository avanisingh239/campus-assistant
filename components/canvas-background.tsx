import { StarIcon, TwoCirclesIcon, CalendarIcon, ChatBubbleIcon } from "./icons";
import styles from "./ui.module.css";

/**
 * The forest-green gradient backdrop + four floating decorative symbols,
 * extracted from the Student Dashboard prototype (dashboard.html's
 * `.site`/`.bgsym` wrapper) so any screen using the same visual system
 * (dashboard, /login) can share one implementation instead of duplicating
 * the gradient + animation. Purely decorative — no interactivity, safe to
 * render from a Server Component.
 */
export function CanvasBackground({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  );
}
