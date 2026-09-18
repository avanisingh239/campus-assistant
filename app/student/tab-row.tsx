import type { ReactNode } from "react";
import Link from "next/link";
import { ActionPlanIcon, StarIcon, TwoCirclesIcon, CalendarIcon, ChatBubbleIcon, SearchIcon } from "@/components/icons";
import styles from "./shell.module.css";

export type StudentTab = "dashboard" | "discover" | "communities" | "timetable" | "ingest" | "ask";

const TABS: { tab: StudentTab; href: string; icon: ReactNode; label: string }[] = [
  { tab: "dashboard", href: "/student/dashboard", icon: <ActionPlanIcon />, label: "Action plan" },
  { tab: "discover", href: "/student/dont-miss-this", icon: <StarIcon />, label: "Don't miss this" },
  { tab: "communities", href: "/student/communities", icon: <TwoCirclesIcon />, label: "Communities" },
  { tab: "timetable", href: "/student/timetable", icon: <CalendarIcon />, label: "Timetable" },
  { tab: "ingest", href: "/student/ingest", icon: <ChatBubbleIcon />, label: "Add messages" },
  { tab: "ask", href: "/student/ask", icon: <SearchIcon />, label: "Ask Rescript" },
];

/**
 * The four-tab nav shared by every real student screen. Extracted out of
 * dashboard-client.tsx once app/student/dont-miss-this needed the exact
 * same row with a different tab highlighted — see shell.module.css's
 * doc comment for why this lives under app/student/ rather than the
 * top-level components/.
 */
export function TabRow({ active }: { active: StudentTab }) {
  return (
    <div className={styles.tabRow}>
      {TABS.map(({ tab, href, icon, label }) => (
        <Link key={tab} href={href} className={`${styles.tab} ${tab === active ? styles.tabActive : ""}`}>
          {icon}
          {label}
        </Link>
      ))}
    </div>
  );
}
