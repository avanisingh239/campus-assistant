/**
 * Narrowest possible shape of a `clashes` row this file needs — matches
 * `lib/deterministic/clashes.ts`'s `ClashCandidate` on these two columns,
 * kept separate rather than importing that type so this stays decoupled
 * from the detection engine's own internals.
 */
export interface ClashAnnouncementRef {
  announcement_id: string | null;
  other_announcement_id: string | null;
}

/**
 * Which announcement ids appear on either side of any of this student's
 * `clashes` rows — used by the dashboard's "Conflicts" filter tab
 * (lib/dashboard/category-filter.ts) to flag cards that clash with
 * something.
 *
 * Deliberately only announcement_id/other_announcement_id: a
 * `class_vs_class` clash (lib/deterministic/clashes.ts's
 * `CLASH_ELIGIBLE_CATEGORIES` doc comment) is between two
 * `timetable_entries` rows and never references an announcement at all —
 * such a row contributes nothing here, so "Conflicts" on the dashboard can
 * only ever mean "this announcement clashes with a class or another
 * announcement," not "you have a class-vs-class clash somewhere" (that's
 * what /student/timetable's own clash badges are for).
 */
export function collectClashedAnnouncementIds(clashes: ClashAnnouncementRef[]): Set<string> {
  const ids = new Set<string>();
  for (const clash of clashes) {
    if (clash.announcement_id) ids.add(clash.announcement_id);
    if (clash.other_announcement_id) ids.add(clash.other_announcement_id);
  }
  return ids;
}
