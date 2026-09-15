import styles from "./dashboard.module.css";

// Next.js's own loading-UI convention — shown automatically while
// page.tsx's Server Component data fetch is in flight, no client-side
// spinner state needed. Deliberately lightweight: just enough shimmer to
// signal "loading," not a full skeleton of every card detail.
export default function DashboardLoading() {
  return (
    <div className={styles.site}>
      <div className={styles.wrap}>
        <div className={styles.topbar}>
          <div className={styles.headerRow}>
            <div className={styles.brandBlock}>
              <p className={styles.appName}>Rescript</p>
            </div>
          </div>
        </div>
        <div className={styles.cards}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.loadingCard} />
          ))}
        </div>
      </div>
    </div>
  );
}
