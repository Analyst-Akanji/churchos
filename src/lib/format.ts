/** Money is stored as integer kobo. Never use floats for money. */
export function formatNaira(kobo: number | null | undefined): string {
  const v = Number(kobo ?? 0);
  const naira = Math.trunc(v / 100);
  const k = Math.abs(v % 100);
  const base = '₦' + naira.toLocaleString('en-NG');
  return k ? `${base}.${String(k).padStart(2, '0')}` : base;
}

/** "3,500.50" -> 350050. Returns null if the text is not a valid amount. */
export function nairaToKobo(text: string): number | null {
  const clean = text.replace(/[₦,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [n, k = ''] = clean.split('.');
  return Number(n) * 100 + Number(k.padEnd(2, '0'));
}
export function koboToNairaInput(kobo: number): string {
  const n = Math.trunc(kobo / 100), k = kobo % 100;
  return k ? `${n}.${String(k).padStart(2, '0')}` : String(n);
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const fmtDateShort = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
export const fmtTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');

export function isoDate(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export const todayISO = () => isoDate(new Date());
/** The most recent Sunday on or before today. */
export function recentSundayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return isoDate(d);
}
export function weekNumber(quarterStart: string, date: string): number {
  const diff = (new Date(date).getTime() - new Date(quarterStart).getTime()) / 86400000;
  return Math.min(14, Math.max(1, Math.floor(diff / 7) + 1));
}
/** <input type="datetime-local"> value from an ISO timestamp, in local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);
export const fullName = (m: { first_name: string; last_name: string } | null | undefined) =>
  m ? `${m.first_name} ${m.last_name}` : '';
