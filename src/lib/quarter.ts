export type LessonKind = 'lesson' | 'sharing';

export interface LessonUnit {
  unit_number: number;
  title: string;
}

export interface Lesson {
  id: string;
  lesson_number: number | null;
  lesson_date: string; // YYYY-MM-DD, always a Sunday
  title: string;
  kind: LessonKind;
  unit: LessonUnit | null;
}

export interface Quarter {
  id: string;
  quarter_number: number;
  title: string;
  theme: string;
  starts_on: string;
  ends_on: string;
  lessons: Lesson[];
}

export const CHURCH_TIME_ZONE = 'Africa/Lagos';

/** Today's date in Lagos as YYYY-MM-DD, whatever the visitor's device time zone is. */
export function todayInLagos(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: CHURCH_TIME_ZONE });
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso);
}

/** "Sunday 18 October" */
export function formatSunday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "25 October" */
export function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export interface UpcomingLesson {
  /** Index into the sorted lessons array, or -1 when the quarter is over. */
  index: number;
  current: Lesson | null;
  next: Lesson | null;
  sorted: Lesson[];
}

/**
 * The lesson for today if today is a lesson Sunday, otherwise the next one.
 * On Sunday it stays "today" for the whole day (Lagos time).
 */
export function pickUpcoming(lessons: Lesson[], today: string): UpcomingLesson {
  const sorted = [...lessons].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
  const index = sorted.findIndex((l) => l.lesson_date >= today);
  if (index === -1) return { index: -1, current: null, next: null, sorted };
  return { index, current: sorted[index], next: sorted[index + 1] ?? null, sorted };
}

export function totalLessons(lessons: Lesson[]): number {
  return lessons.filter((l) => l.kind === 'lesson').length;
}

/** Adds days to a YYYY-MM-DD date and returns YYYY-MM-DD. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isSunday(iso: string): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
}

/** The first Sunday on or after the given date. */
export function nextSundayOnOrAfter(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow === 0 ? iso : addDays(iso, 7 - dow);
}

/** The most recent Sunday on or before the given date. */
export function lastSundayOnOrBefore(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -dow);
}

export function ordinal(n: number): string {
  return ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
}
