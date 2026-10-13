import { usePublicList } from './publicData';

export interface ProgrammeItem {
  id: string; assembly_id?: string; programme_date: string; start_time: string; end_time: string | null;
  title: string; details: string | null; venue: string | null; is_public?: boolean;
}

/** "YYYY-MM-DD" -> a local Date (avoids the UTC shift that new Date("YYYY-MM-DD") causes). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(iso: string, n: number): string {
  const d = parseDay(iso); d.setDate(d.getDate() + n); return toISO(d);
}
/** The Sunday that starts the church week containing the given date. */
export function weekStartSunday(iso: string): string { return addDays(iso, -parseDay(iso).getDay()); }

/** "08:00:00" -> "8:00 am" */
export function clock(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export const timeRange = (p: Pick<ProgrammeItem, 'start_time' | 'end_time'>) => p.end_time ? `${clock(p.start_time)} to ${clock(p.end_time)}` : clock(p.start_time);

export function dayLabel(iso: string, todayIso = toISO(new Date())): string {
  const long = parseDay(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  if (iso === todayIso) return `Today, ${long}`;
  if (iso === addDays(todayIso, 1)) return `Tomorrow, ${long}`;
  return long;
}

export function groupByDay<T extends Pick<ProgrammeItem, 'programme_date' | 'start_time'>>(items: T[]): { date: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => a.programme_date.localeCompare(b.programme_date) || a.start_time.localeCompare(b.start_time));
  const out: { date: string; items: T[] }[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && last.date === it.programme_date) last.items.push(it); else out.push({ date: it.programme_date, items: [it] });
  }
  return out;
}

/** The public website's "this week": today and the next 6 days, entered by the church office. */
export const usePublicProgramme = () => usePublicList<ProgrammeItem>('v_public_programme', 'programme_date', true, 80);
