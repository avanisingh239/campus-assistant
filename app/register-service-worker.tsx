"use client";

import { useEffect } from "react";

/** Registers public/sw.js once the app shell has loaded. Android-first,
 * best-effort — see docs/architecture.md §4.3 and product-spec.md's note
 * that Web Share Target (a separate, Phase 2 feature) is deferred due to
 * iOS Safari limitations. Registration failures are swallowed on purpose:
 * a PWA install prompt is a nice-to-have, never a blocker for using the
 * site in a normal browser tab. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort — see comment above.
      });
    }
  }, []);

  return null;
}
