import { CanvasBackground } from "@/components/canvas-background";
import shellStyles from "../shell.module.css";

// Same convention as app/student/dashboard/loading.tsx and
// app/student/dont-miss-this/loading.tsx.
export default function CommunitiesLoading() {
  return (
    <CanvasBackground>
      <div className={shellStyles.wrap}>
        <div className={shellStyles.topbar}>
          <div className={shellStyles.headerRow}>
            <div className={shellStyles.brandBlock}>
              <p className={shellStyles.appName}>Rescript</p>
            </div>
          </div>
        </div>
        <div className={shellStyles.cards}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={shellStyles.loadingCard} />
          ))}
        </div>
      </div>
    </CanvasBackground>
  );
}
