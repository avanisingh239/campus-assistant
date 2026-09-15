/**
 * Dashboard-specific icon mapping. The base icon shapes themselves live in
 * components/icons.tsx (shared with /login and any other screen that needs
 * the same visual language) — this file only keeps the one thing that's
 * actually dashboard-specific: mapping an announcement category to its
 * card icon.
 *
 * Two categories don't come from a card in the prototype — FYI and
 * `uncategorized`/duplicate both needed a category the prototype never
 * demonstrated. Rather than inventing new shapes, both reuse SVGs already
 * present in the prototype for other purposes (see category-meta.ts's
 * comment for the reasoning): FYI reuses the decorative "chat bubble"
 * background symbol (`.bgsym.s4`); `uncategorized` reuses card 6's
 * warning-triangle (shown there for a merged/contradictory item, which
 * fits "we don't know what this is" just as well).
 */

import type { AnnouncementCategory } from "@/lib/dashboard/types";
import {
  DeadlineIcon,
  CancellationIcon,
  StarIcon,
  CheckCircleIcon,
  TwoCirclesIcon,
  CalendarIcon,
  WarningTriangleIcon,
  ChatBubbleIcon,
} from "@/components/icons";

/** Maps a category to its card icon — see category-meta.ts's CATEGORY_ICON keys. */
export function CategoryIcon({ category }: { category: AnnouncementCategory }) {
  switch (category) {
    case "deadline":
      return <DeadlineIcon />;
    case "cancellation":
      return <CancellationIcon />;
    case "event":
      return <CalendarIcon />;
    case "opportunity":
      return <StarIcon />;
    case "registered_update":
      return <CheckCircleIcon />;
    case "society_link":
      return <TwoCirclesIcon />;
    case "fyi":
      return <ChatBubbleIcon />;
    case "duplicate":
    case "uncategorized":
      return <WarningTriangleIcon />;
  }
}
