import { CanvasBackground } from "@/components/canvas-background";
import shellStyles from "../shell.module.css";

// Same convention as the other real student screens' loading.tsx.
export default function IngestLoading() {
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
        <div className={shellStyles.loadingCard} style={{ maxWidth: 640, margin: "0 auto" }} />
      </div>
    </CanvasBackground>
  );
}
