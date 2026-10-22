export type ItemKind = 'item' | 'heading';

/** One line of the order of service as it is edited on screen. */
export interface OrderDraft {
  kind: ItemKind;
  title: string;
  minutes: string; // kept as text while typing
  end_time: string; // headings only, "HH:MM", shown but does not move the clock
  member_id: string;
  label: string;
}

export const blankItem = (kind: ItemKind = 'item'): OrderDraft => ({
  kind, title: '', minutes: '', end_time: '', member_id: '', label: '',
});

/** A row of the public view v_public_order_of_service. */
export interface PublicOrderRow {
  id: string;
  service_id: string;
  service_date: string;
  service_title: string | null;
  theme_line: string | null;
  moderator: string | null;
  sort_order: number;
  kind: ItemKind;
  title: string;
  minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  assignee: string | null;
  lesson_title: string | null;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (n: number) => {
  const t = ((n % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export interface Laid {
  start: string | null; // "HH:MM", null for lines with no title yet
  end: string | null;
}

/**
 * Works out each line's times. This mirrors save_service_order in the database exactly:
 * an item starts when the previous item ended and ends after its minutes; a heading
 * starts where the clock is, does not move it, and only shows the end time typed for it.
 * Lines with no title are skipped.
 */
export function layoutOrder(startsAt: string, items: Pick<OrderDraft, 'kind' | 'title' | 'minutes' | 'end_time'>[]): Laid[] {
  let clock = toMin(startsAt || '08:00');
  return items.map((it) => {
    if (!it.title.trim()) return { start: null, end: null };
    const start = fromMin(clock);
    if (it.kind === 'heading') return { start, end: it.end_time ? it.end_time.slice(0, 5) : null };
    const mins = Number(it.minutes);
    if (!it.minutes || !Number.isFinite(mins) || mins <= 0) return { start, end: null };
    clock += Math.floor(mins);
    return { start, end: fromMin(clock) };
  });
}

function clockParts(hhmm: string) {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  const text = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`;
  const suffix = h === 12 && m === 0 ? 'noon' : h < 12 ? 'a.m.' : 'p.m.';
  return { text, suffix };
}

/** "8:20 – 9:30 a.m.", "9:30 a.m. – 12:00 noon", or just "10:20 a.m." */
export function timeRange(start?: string | null, end?: string | null): string {
  if (!start) return '';
  const a = clockParts(start);
  if (!end) return `${a.text} ${a.suffix}`;
  const b = clockParts(end);
  if (a.suffix === b.suffix && a.suffix !== 'noon') return `${a.text} – ${b.text} ${b.suffix}`;
  return `${a.text} ${a.suffix} – ${b.text} ${b.suffix}`;
}
