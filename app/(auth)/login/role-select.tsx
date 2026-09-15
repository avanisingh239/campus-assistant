import { GraduationCapIcon, ShieldCheckIcon } from "@/components/icons";
import { PinCard } from "@/components/ui/pin-card";
import styles from "./login.module.css";

/** State 1: the landing state for an unauthenticated visitor — pick a role. */
export function RoleSelect({
  onSelectStudent,
  onSelectAdmin,
}: {
  onSelectStudent: () => void;
  onSelectAdmin: () => void;
}) {
  return (
    <PinCard>
      <div className={styles.roleGrid}>
        <button type="button" className={styles.roleTile} onClick={onSelectStudent}>
          <div className={styles.roleIconChip}>
            <GraduationCapIcon />
          </div>
          <p className={styles.roleLabel}>I&apos;m a student</p>
          <p className={styles.roleSub}>Log in or create an account</p>
        </button>
        <button type="button" className={styles.roleTile} onClick={onSelectAdmin}>
          <div className={styles.roleIconChip}>
            <ShieldCheckIcon />
          </div>
          <p className={styles.roleLabel}>I&apos;m an admin</p>
          <p className={styles.roleSub}>Log in with an assigned account</p>
        </button>
      </div>
    </PinCard>
  );
}
