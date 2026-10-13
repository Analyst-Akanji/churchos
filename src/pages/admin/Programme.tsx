import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { addDays, clock, dayLabel, groupByDay, parseDay, timeRange, toISO, weekStartSunday, type ProgrammeItem } from '@/lib/programme';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/toast';

export default function Programme() {
  const { assembly } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const today = toISO(new Date());
  const [weekStart, setWeekStart] = useState(weekStartSunday(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [f, setF] = useState({ date: today, start: '', end: '', title: '', venue: '', details: '', is_public: true });
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);

  const items = useQuery({
    queryKey: ['programme', assembly?.id, weekStart], enabled: !!assembly,
    queryFn: () => q<ProgrammeItem[]>(supabase.from('weekly_programme').select('*').eq('assembly_id', assembly!.id).gte('programme_date', weekStart).lte('programme_date', addDays(weekStart, 6))),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['programme'] });
  const grouped = groupByDay(items.data ?? []);

  function go(n: number) { const w = addDays(weekStart, n * 7); setWeekStart(w); setF((x) => ({ ...x, date: w })); }

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.from('weekly_programme').insert({
      assembly_id: assembly!.id, programme_date: f.date, start_time: f.start, end_time: f.end || null,
      title: f.title.trim(), venue: f.venue.trim() || null, details: f.details.trim() || null, is_public: f.is_public,
    });
    setBusy(false);
    if (error) { setErr(new Error(error.message.includes('duplicate') ? 'That programme is already listed for that day and time.' : error.message)); return; }
    toast.ok('Added'); setF({ ...f, start: '', end: '', title: '', venue: '', details: '' }); void refresh();
  }
  async function remove(id: string) {
    if (!confirm('Remove this programme?')) return;
    const { error } = await supabase.from('weekly_programme').delete().eq('id', id);
    if (error) toast.err(error.message); else void refresh();
  }
  async function toggle(it: ProgrammeItem) {
    const { error } = await supabase.from('weekly_programme').update({ is_public: !it.is_public }).eq('id', it.id);
    if (error) toast.err(error.message); else void refresh();
  }
  async function copyLastWeek() {
    const prev = await q<ProgrammeItem[]>(supabase.from('weekly_programme').select('*').eq('assembly_id', assembly!.id).gte('programme_date', addDays(weekStart, -7)).lte('programme_date', addDays(weekStart, -1)));
    if (prev.length === 0) { toast.err('Last week has no programmes to copy.'); return; }
    const rows = prev.map((p) => ({ assembly_id: assembly!.id, programme_date: addDays(p.programme_date, 7), start_time: p.start_time, end_time: p.end_time, title: p.title, venue: p.venue, details: p.details, is_public: p.is_public ?? true }));
    const { error } = await supabase.from('weekly_programme').upsert(rows, { onConflict: 'assembly_id,programme_date,start_time,title', ignoreDuplicates: true });
    if (error) toast.err(error.message); else { toast.ok(`Copied ${rows.length} programme(s) from last week. Edit anything that changed.`); void refresh(); }
  }

  const label = `${parseDay(weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${parseDay(addDays(weekStart, 6)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <>
      <PageHeader title="Weekly programme" subtitle="What is happening this week. Visitors see the next 7 days on the website." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" />Previous</Button>
        <div className="min-w-[13rem] text-center text-sm font-semibold text-brand-900">{label}</div>
        <Button variant="secondary" size="sm" onClick={() => go(1)}>Next<ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => { const w = weekStartSunday(today); setWeekStart(w); setF((x) => ({ ...x, date: today })); }}>This week</Button>
        <Button variant="gold" size="sm" onClick={() => void copyLastWeek()} className="sm:ml-auto"><Copy className="h-4 w-4" />Copy last week into this week</Button>
      </div>

      <Card title="Add a programme" className="mb-6">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
          <Field label="Day"><Select value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>{days.map((d) => <option key={d} value={d}>{parseDay(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</option>)}</Select></Field>
          <Field label="Starts"><Input type="time" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Ends (optional)"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="Venue (optional)"><Input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
          <div className="sm:col-span-4"><Field label="Programme"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Sunday school, Worship service, Bible study, Prayer meeting" /></Field></div>
          <div className="sm:col-span-4"><Field label="Details (optional)"><Textarea value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder="Speaker, topic, who it is for, what to bring" /></Field></div>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={f.is_public} onChange={(e) => setF({ ...f, is_public: e.target.checked })} />Show on the public website</label>
            <Button type="submit" loading={busy}>Add to the week</Button>
          </div>
          {err != null && <div className="sm:col-span-4"><ErrorBox error={err} /></div>}
        </form>
      </Card>

      {items.isLoading ? <Spinner /> : grouped.length === 0 ? <Empty title="Nothing planned for this week yet" hint='Add programmes above, or press "Copy last week into this week" and edit what changed.' /> : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <Card key={g.date} title={dayLabel(g.date, today)}>
              <ul className="divide-y divide-gray-100">
                {g.items.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="font-medium text-brand-900">{it.title}</div>
                      <div className="text-sm text-gray-600">{timeRange(it) || clock(it.start_time)}{it.venue ? ` · ${it.venue}` : ''}</div>
                      {it.details && <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{it.details}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => void toggle(it)} title="Click to change"><Badge tone={it.is_public ? 'blue' : 'gray'}>{it.is_public ? 'Public' : 'Members only'}</Badge></button>
                      <button onClick={() => void remove(it.id)} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
