import Link from "next/link";
import { LogoMark } from "@/components/icons";
import { CanvasBackground } from "@/components/canvas-background";
import uiStyles from "@/components/ui.module.css";
import styles from "./landing.module.css";

/**
 * Public landing page (docs/architecture.md §2 route tree) — the "front
 * door" a signed-out visitor (including a judge evaluating the project)
 * sees before /login. Previously plain unstyled text (bare <h1>/<p>/
 * <Link>) with none of the rest of the app's visual identity; this is a
 * real hero built from the exact same pieces /login and the student shell
 * already use, not a new design: `LogoMark` (components/icons.tsx),
 * `CanvasBackground` (the gradient + floating-symbol backdrop), and the
 * "Rescript" / "Your campus, clarified." wordmark+tagline pairing that
 * both app-header.tsx and login-screen.tsx already render verbatim.
 *
 * Server Component, no client-side state needed — matches CanvasBackground
 * itself, which is also hook-free. Lives under `(public)`, a route group,
 * so its URL is `/`; `middleware.ts`'s role checks only match `/student/*`
 * and `/admin/*`, so this renders for a fully signed-out visitor exactly
 * like `/login` already does.
 *
 * The CTA button reuses components/ui.module.css's `.button`/
 * `.buttonPrimary` (the same gold pill every other primary action in the
 * app uses) on a `<Link>` rather than a `<button>`, since this navigates
 * to /login rather than performing an in-page action — same pattern
 * app/student/ingest/result-panel.tsx's own `<Link>` CTA already
 * establishes for exactly this "route to a real button" case.
 */
export default function PublicLandingPage() {
  return (
    <CanvasBackground>
      <main className={styles.wrap}>
        <div className={styles.logoMark}>
          <LogoMark />
        </div>
        <h1 className={styles.appName}>Rescript</h1>
        <p className={styles.tagline}>Your campus, clarified.</p>
        <p className={styles.description}>
          University life buries what matters in a flood of WhatsApp groups, Telegram
          channels, and bulletin boards. Rescript turns that chaos into one clear,
          trustworthy action plan — so deadlines, cancellations, and opportunities never
          get lost in the scroll.
        </p>
        <Link href="/login" className={`${uiStyles.button} ${uiStyles.buttonPrimary} ${styles.cta}`}>
          Get started
        </Link>
      </main>
    </CanvasBackground>
  );
}
