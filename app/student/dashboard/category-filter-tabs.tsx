import { DASHBOARD_FILTERS, type DashboardFilter } from "@/lib/dashboard/category-filter";
import styles from "./dashboard.module.css";

/**
 * The secondary filter row above the card feed (docs/figma-screen-
 * inventory.md §1.2's "Filter feed by category" Requirement) —
 * deliberately smaller/lighter than ../tab-row.tsx's main site nav (see
 * dashboard.module.css's `.filterTab` vs. ../shell.module.css's `.tab`)
 * so the two don't get confused, while still using the same gold-active
 * treatment to read as the same design language.
 */
export function CategoryFilterTabs({
  active,
  onChange,
}: {
  active: DashboardFilter;
  onChange: (filter: DashboardFilter) => void;
}) {
  return (
    <div className={styles.filterRow}>
      {DASHBOARD_FILTERS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={`${styles.filterTab} ${id === active ? styles.filterTabActive : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
