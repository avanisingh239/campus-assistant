/**
 * Base icon set ported verbatim from dashboard.html's inline SVGs (same
 * viewBox, stroke, and path data) — shared across the dashboard and any
 * other screen that needs the same visual language (e.g. /login). Sizing
 * is applied by the consuming CSS Module via selectors on the parent
 * element (e.g. `.iconChip svg`), not props here — matches the
 * prototype's own approach of sizing icons through the surrounding class.
 */

const strokeProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function DeadlineIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4M8 3v4M3 10h18" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}

export function CancellationIcon() {
  return (
    <svg {...strokeProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 8l8 8" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M12 2l2.6 6.6L21 11l-6.4 2.4L12 20l-2.6-6.6L3 11l6.4-2.4z" />
    </svg>
  );
}

export function CheckCircleIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function TwoCirclesIcon() {
  return (
    <svg {...strokeProps}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="16" r="3" />
      <path d="M10 9.5l4 5" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

export function WarningTriangleIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  );
}

export function ChatBubbleIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  );
}

export function ActionPlanIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M4 12l8-8 8 8M6 10v10h12V10" />
    </svg>
  );
}

export function LightningIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M13 2L3 14h7l-1 8 11-13h-7l1-7z" />
    </svg>
  );
}

export function WarningCircleIcon() {
  return (
    <svg {...strokeProps} strokeWidth={2.5}>
      <path d="M12 8v5M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function ArrowMergeIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M17 8l4 4-4 4M3 12h18" />
    </svg>
  );
}

export function ChainLinkIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" />
      <path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />
    </svg>
  );
}

/** The Rescript logo mark — filled shapes, not stroked, unlike everything else here. */
export function LogoMark() {
  return (
    <svg viewBox="0 0 100 100">
      <path
        d="M18 100V40C18 20 32 8 48 8C64 8 78 20 78 40C78 55 68 62 60 66L82 100H62L44 72H36V100Z"
        fill="#7A1B34"
      />
      <path d="M18 40C18 20 32 8 48 8V30C40 30 36 34 36 42V52H18V40Z" fill="#DCA7AC" />
      <rect x="24" y="38" width="10" height="2.5" fill="#7A1B34" />
      <rect x="24" y="44" width="10" height="2.5" fill="#7A1B34" />
    </svg>
  );
}

/** Upload-to-tray glyph for the WhatsApp .txt export tile on /student/ingest. */
export function UploadIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </svg>
  );
}

/** Share glyph for the disabled "Coming soon" Web Share Target tile on /student/ingest. */
export function ShareIcon() {
  return (
    <svg {...strokeProps}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4" />
    </svg>
  );
}

/** Filled graduation-cap glyph for the student role tile on /login. */
export function GraduationCapIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
      <path d="M22 10v6" />
    </svg>
  );
}

/** Shield-check glyph for the admin role tile on /login. */
export function ShieldCheckIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
