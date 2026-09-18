import Link from "next/link";
import { LogoMark } from "@/components/icons";
import styles from "./shell.module.css";

/**
 * A small, persistent floating shortcut into /student/ask — the "Ask
 * Rescript" tab in the main nav row (TabRow) is easy to miss among five
 * tabs, so this gives it a second, always-visible entry point, the same
 * "Meta AI"-style corner icon pattern the task that added this asked for.
 * Reuses `LogoMark` exactly as the header already renders it (per the
 * task's own explicit instruction not to alter it) — this component only
 * adds the fixed-position circular badge around it (`.askShortcut`,
 * shell.module.css — the same gold/forest-deep circular-badge recipe
 * `.heroBadge` already uses, not a new visual language).
 *
 * Rendered ONCE, in app/student/layout.tsx (which wraps every route under
 * /student/*), rather than added to each page individually — the
 * cheapest way to make it appear "across all student pages for
 * consistency," per the task's own stated preference over the bare
 * minimum ("/student/dashboard at minimum"). `position: fixed` pins it to
 * the viewport regardless of where in the tree it renders or how far the
 * page scrolls (nothing in this app's layout tree sets a `transform` on
 * an ancestor, which is the one thing that would break a fixed-position
 * child out of viewport-relative positioning).
 *
 * Deliberately NOT hidden on /student/ask itself — keeping this simple
 * (per the task's own "keep it simple" instruction) was judged more
 * valuable than the marginal benefit of a route-aware client wrapper just
 * to suppress it on one page; tapping it while already there is a harmless
 * no-op navigation, not a broken or confusing state.
 */
export function AskShortcut() {
  return (
    <Link href="/student/ask" className={styles.askShortcut} aria-label="Ask Rescript">
      <LogoMark />
    </Link>
  );
}
