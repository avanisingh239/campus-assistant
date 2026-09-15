import { LightningIcon, WarningTriangleIcon, CheckCircleIcon, StarIcon } from "@/components/icons";
import styles from "./dashboard.module.css";

interface Stat {
  key: string;
  icon: React.ReactNode;
  number: number;
  label: string;
}

/**
 * Small stat-card row between the diff banner and "Top priorities" — a
 * smaller, simpler sibling of the announcement cards (same mint-card/
 * forest-border treatment, no pin/cap/category color), not a new card
 * style. Pure presentational; app/student/dashboard/dashboard-client.tsx
 * owns computing each count (see that file for exactly where each number
 * comes from).
 */
export function StatRow({
  thingsToDo,
  potentialClashes,
  freeSlots,
  dontMiss,
}: {
  thingsToDo: number;
  potentialClashes: number;
  freeSlots: number;
  dontMiss: number;
}) {
  const stats: Stat[] = [
    { key: "todo", icon: <LightningIcon />, number: thingsToDo, label: "Things to do" },
    { key: "clashes", icon: <WarningTriangleIcon />, number: potentialClashes, label: "Potential clashes" },
    { key: "free-slots", icon: <CheckCircleIcon />, number: freeSlots, label: "Free slot matches" },
    { key: "dont-miss", icon: <StarIcon />, number: dontMiss, label: "Don't miss" },
  ];

  return (
    <div className={styles.statRow}>
      {stats.map((stat) => (
        <div key={stat.key} className={styles.statCard}>
          <div className={styles.statIcon}>{stat.icon}</div>
          <div className={styles.statNumber}>{stat.number}</div>
          <div className={styles.statLabel}>{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
