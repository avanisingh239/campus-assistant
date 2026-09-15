import { CATEGORY_LABELS } from "@/lib/dashboard/category-meta";
import { formatAbsoluteDate } from "@/lib/dashboard/format";
import type { AnnouncementCategory } from "@/lib/dashboard/types";
import type { AdminSubmissionSummary } from "@/lib/admin/actions";
import styles from "./admin-dashboard.module.css";

/**
 * docs/product-spec.md Area B.4 (Submission History), folded into
 * /admin/dashboard itself rather than a separate /admin/history route —
 * see CLAUDE.md's §Admin Dashboard for why. No global moderation queue per
 * that doc's own Anti-Scope Rule: this only ever lists rows this admin
 * submitted themselves (page.tsx's query is already scoped to
 * `submitted_by = auth.uid()`), not anyone else's.
 */
export function SubmissionHistory({ items }: { items: AdminSubmissionSummary[] }) {
  return (
    <section>
      <h2>Your submissions</h2>
      {items.length === 0 ? (
        <p className="muted">You haven&apos;t submitted any updates yet.</p>
      ) : (
        <ul className={styles.historyList}>
          {items.map((item) => (
            <li key={item.id} className={styles.historyItem}>
              <span>{item.title}</span>
              <span className="muted">
                {CATEGORY_LABELS[item.category as AnnouncementCategory] ?? item.category}
                {item.event_date ? ` · ${formatAbsoluteDate(item.event_date)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
