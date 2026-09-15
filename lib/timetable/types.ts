/**
 * The full `timetable_entries` row shape the UI needs (id, section,
 * teacher_name, teacher_name_confirmed included) — deliberately not
 * lib/deterministic/types.ts's `TimetableEntryRow`, which is intentionally
 * narrowed to just what the pure clash/free-slot functions read. A
 * `TimetableEntry[]` is still structurally assignable anywhere a
 * `TimetableEntryRow[]` is expected (e.g. lib/timetable/weekly-grid.ts),
 * so no conversion is needed between the two.
 */
export interface TimetableEntry {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_name: string;
  section: string | null;
  teacher_name: string | null;
  teacher_name_confirmed: boolean;
}
