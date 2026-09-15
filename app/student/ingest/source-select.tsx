import { ChatBubbleIcon, UploadIcon, ShareIcon } from "@/components/icons";
import { PinCard } from "@/components/ui/pin-card";
import styles from "./ingest.module.css";

/**
 * State 1 ("Choose source") of the ingestion flow. Two real, tappable
 * options per the task — "Paste messages" and "Upload WhatsApp .txt" — plus
 * Web Share Target shown only as a visibly disabled "Coming soon (Phase 2)"
 * tile, per docs/product-spec.md's own explicit Phase-2 tag for it (Area
 * A.4's Message Ingestion Drawer bullet, Delivery Phasing table's Feature
 * 1.1 row) — not built as functional here, on purpose.
 */
export function SourceSelect({
  onSelectPaste,
  onSelectUpload,
}: {
  onSelectPaste: () => void;
  onSelectUpload: () => void;
}) {
  return (
    <PinCard>
      <div className={styles.sourceGrid}>
        <button type="button" className={styles.sourceTile} onClick={onSelectPaste}>
          <div className={styles.sourceIconChip}>
            <ChatBubbleIcon />
          </div>
          <p className={styles.sourceLabel}>Paste messages</p>
          <p className={styles.sourceSub}>Copy-paste any forwarded chat text</p>
        </button>
        <button type="button" className={styles.sourceTile} onClick={onSelectUpload}>
          <div className={styles.sourceIconChip}>
            <UploadIcon />
          </div>
          <p className={styles.sourceLabel}>Upload WhatsApp .txt</p>
          <p className={styles.sourceSub}>Official &quot;Export chat&quot; file</p>
        </button>
        <div className={`${styles.sourceTile} ${styles.sourceTileDisabled}`} aria-disabled="true">
          <div className={styles.sourceIconChip}>
            <ShareIcon />
          </div>
          <p className={styles.sourceLabel}>Share to app</p>
          <p className={styles.sourceSub}>Coming soon (Phase 2)</p>
        </div>
      </div>
    </PinCard>
  );
}
