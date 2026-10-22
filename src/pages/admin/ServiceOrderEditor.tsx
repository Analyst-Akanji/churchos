import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { supabase, q } from '@/lib/supabase';
import { fullName } from '@/lib/format';
import { Button, Card, Field, Input, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useMembersLite } from '../sundayschool/hooks';
import { blankItem, layoutOrder, timeRange, type OrderDraft } from '@/lib/serviceOrder';

interface Props {
  serviceId: string;
  serviceDate: string; // YYYY-MM-DD
}

interface Header {
  moderator_member_id: string | null;
  moderator_label: string | null;
  theme_line: string | null;
  order_starts_at: string;
  order_published: boolean;
}
interface ItemRow {
  kind: 'item' | 'heading';
  title: string;
  minutes: number | null;
  end_time: string | null;
  assignee_member_id: string | null;
  assignee_label: string | null;
  sort_order: number;
}

/** Editor for one service's order of service: moderator, theme, timed items and who takes each. */
export default function ServiceOrderEditor({ serviceId, serviceDate }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const members = useMembersLite();
  const people = (members.data ?? []).filter((m) => m.age_group !== 'child');

  const header = useQuery({
    queryKey: ['service-order-header', serviceId],
    queryFn: async () =>
      (await q<Header[]>(supabase.from('services').select('moderator_member_id, moderator_label, theme_line, order_starts_at, order_published').eq('id', serviceId)))[0] ?? null,
  });
  const rows = useQuery({
    queryKey: ['service-order-items', serviceId],
    queryFn: () => q<ItemRow[]>(supabase.from('service_order_items').select('kind, title, minutes, end_time, assignee_member_id, assignee_label, sort_order').eq('service_id', serviceId).order('sort_order')),
  });
  // This Sunday's lesson from the curriculum, shown next to the Sunday school item.
  const lesson = useQuery({
    queryKey: ['order-lesson', serviceDate],
    queryFn: async () => {
      try {
        return (await q<{ lesson_number: number | null; title: string }[]>(supabase.from('curriculum_lessons').select('lesson_number, title').eq('lesson_date', serviceDate)))[0] ?? null;
      } catch { return null; }
    },
  });

  const [theme, setTheme] = useState('');
  const [modMember, setModMember] = useState('');
  const [modLabel, setModLabel] = useState('');
  const [startsAt, setStartsAt] = useState('08:00');
  const [published, setPublished] = useState(false);
  const [items, setItems] = useState<OrderDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (dirty || !header.data || !rows.data) return;
    setTheme(header.data.theme_line ?? '');
    setModMember(header.data.moderator_member_id ?? '');
    setModLabel(header.data.moderator_label ?? '');
    setStartsAt((header.data.order_starts_at ?? '08:00').slice(0, 5));
    setPublished(header.data.order_published);
    setItems(rows.data.map((r) => ({
      kind: r.kind, title: r.title, minutes: r.minutes ? String(r.minutes) : '',
      end_time: r.end_time ? r.end_time.slice(0, 5) : '', member_id: r.assignee_member_id ?? '', label: r.assignee_label ?? '',
    })));
  }, [header.data, rows.data, dirty]);

  const change = (fn: () => void) => { setDirty(true); fn(); };
  const patch = (i: number, p: Partial<OrderDraft>) => change(() => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...p } : it))));
  const move = (i: number, by: -1 | 1) => change(() => setItems((prev) => {
    const j = i + by;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }));

  const laid = layoutOrder(startsAt, items);

  async function save() {
    setProblem(null);
    const titled = items.filter((i) => i.title.trim());
    if (published && titled.length === 0) { setProblem('Add at least one item before showing this on the website.'); return; }
    if (items.some((i) => i.kind === 'item' && i.minutes && !(Number(i.minutes) > 0))) { setProblem('Minutes must be a number above zero, or left blank.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('save_service_order', {
      p_service: serviceId,
      p: {
        theme_line: theme, moderator_member_id: modMember, moderator_label: modLabel, order_starts_at: startsAt, order_published: published,
        items: items.map((i) => ({
          kind: i.kind, title: i.title, minutes: i.kind === 'heading' ? null : i.minutes ? Number(i.minutes) : null,
          end_time: i.kind === 'heading' ? i.end_time : '', assignee_member_id: i.member_id, assignee_label: i.label,
        })),
      },
    });
    setSaving(false);
    if (error) { toast.err(error.message); return; }
    toast.ok(published ? 'Saved. This order of service is showing on the website.' : 'Saved as a draft. It is not on the website yet.');
    setDirty(false);
    void qc.invalidateQueries({ queryKey: ['service-order-header', serviceId] });
    void qc.invalidateQueries({ queryKey: ['service-order-items', serviceId] });
  }

  if (header.isLoading || rows.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <Card title="Service details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Theme line (shown at the top)"><Input value={theme} onChange={(e) => change(() => setTheme(e.target.value))} placeholder="e.g. 2026: My Year of Good Success" /></Field>
          </div>
          <Field label="Moderator (member)">
            <Select value={modMember} onChange={(e) => change(() => { setModMember(e.target.value); if (e.target.value) setModLabel(''); })}>
              <option value="">Choose a member</option>
              {people.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
            </Select>
          </Field>
          <Field label="or type a name"><Input value={modLabel} onChange={(e) => change(() => { setModLabel(e.target.value); if (e.target.value) setModMember(''); })} /></Field>
          <Field label="The order starts at"><Input type="time" value={startsAt} onChange={(e) => change(() => setStartsAt(e.target.value))} /></Field>
        </div>
      </Card>

      <Card title="Order of service">
        <ol className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className={`rounded-xl border p-3 ${it.kind === 'heading' ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-brand-800">{laid[i]?.start ? timeRange(laid[i].start, laid[i].end) : 'Add a title'}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ChevronDown className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => change(() => setItems((prev) => prev.filter((_, j) => j !== i)))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-6">
                <div className="sm:col-span-4"><Field label={it.kind === 'heading' ? 'Section' : 'Item'}><Input value={it.title} onChange={(e) => patch(i, { title: e.target.value })} /></Field></div>
                {it.kind === 'heading' ? (
                  <div className="sm:col-span-2"><Field label="Ends at (shown only)"><Input type="time" value={it.end_time} onChange={(e) => patch(i, { end_time: e.target.value })} /></Field></div>
                ) : (
                  <>
                    <div className="sm:col-span-2"><Field label="Minutes"><Input type="number" min={1} inputMode="numeric" value={it.minutes} onChange={(e) => patch(i, { minutes: e.target.value })} /></Field></div>
                    <div className="sm:col-span-3">
                      <Field label="Taken by (member)">
                        <Select value={it.member_id} onChange={(e) => patch(i, e.target.value ? { member_id: e.target.value, label: '' } : { member_id: '' })}>
                          <option value="">Choose a member</option>
                          {people.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <div className="sm:col-span-3"><Field label="or a group"><Input value={it.label} onChange={(e) => patch(i, e.target.value ? { label: e.target.value, member_id: '' } : { label: '' })} placeholder="e.g. Choir, Pastor" /></Field></div>
                  </>
                )}
              </div>
              {it.kind === 'item' && /^sunday school/i.test(it.title.trim()) && lesson.data && (
                <p className="mt-2 text-xs text-gray-600">Shown with this Sunday's lesson: {lesson.data.lesson_number ? `Lesson ${lesson.data.lesson_number}: ` : ''}{lesson.data.title}</p>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => change(() => setItems([...items, blankItem('item')]))}>Add an item</Button>
          <Button variant="secondary" size="sm" onClick={() => change(() => setItems([...items, blankItem('heading')]))}>Add a section heading</Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={published} onChange={(e) => change(() => setPublished(e.target.checked))} />
          Show this order of service on the public website
        </label>
        <Button loading={saving} onClick={() => void save()}>Save order of service</Button>
      </div>
      {problem && <p className="text-sm text-crimson-600" role="alert">{problem}</p>}
    </div>
  );
}
