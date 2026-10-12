import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { fmtDate, fmtDateTime, fromLocalInput } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/toast';

interface FieldDef { name: string; label: string; type: 'text' | 'textarea' | 'datetime' | 'date' | 'url'; required?: boolean }
interface Config { table: string; title: string; subtitle: string; orderBy: string; ascending: boolean; fields: FieldDef[]; primary: string; secondary: (r: Record<string, unknown>) => string }

const CONFIGS: Record<string, Config> = {
  events: {
    table: 'events', title: 'Events', subtitle: 'Shown on the public website when marked public.', orderBy: 'starts_at', ascending: false, primary: 'title',
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'starts_at', label: 'Starts', type: 'datetime', required: true }, { name: 'ends_at', label: 'Ends', type: 'datetime' }, { name: 'venue', label: 'Venue', type: 'text' }, { name: 'description', label: 'Description', type: 'textarea' }],
    secondary: (r) => `${fmtDateTime(r.starts_at as string)}${r.venue ? ` · ${r.venue}` : ''}`,
  },
  sermons: {
    table: 'sermons', title: 'Sermon archive', subtitle: 'Add links to audio or video hosted elsewhere (YouTube, Google Drive, etc.).', orderBy: 'preached_on', ascending: false, primary: 'title',
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'preacher_name', label: 'Preacher', type: 'text' }, { name: 'text_used', label: 'Text used', type: 'text' }, { name: 'preached_on', label: 'Date preached', type: 'date' }, { name: 'audio_url', label: 'Audio link', type: 'url' }, { name: 'video_url', label: 'Video link', type: 'url' }, { name: 'summary', label: 'Summary', type: 'textarea' }],
    secondary: (r) => [r.preacher_name, r.text_used, r.preached_on ? fmtDate(r.preached_on as string) : null].filter(Boolean).join(' · '),
  },
  announcements: {
    table: 'announcements', title: 'Announcements', subtitle: 'Visible to members in the app; tick public to also show on the website.', orderBy: 'publish_at', ascending: false, primary: 'title',
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'body', label: 'Message', type: 'textarea', required: true }],
    secondary: (r) => String(r.body ?? '').slice(0, 120),
  },
};

export default function ContentManager() {
  const { kind } = useParams();
  const cfg = CONFIGS[kind ?? ''];
  const { assembly } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [vals, setVals] = useState<Record<string, string>>({}); const [isPublic, setIsPublic] = useState(true);
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ['content', cfg?.table, assembly?.id], enabled: !!cfg && !!assembly, queryFn: () => q<Record<string, unknown>[]>(supabase.from(cfg.table).select('*').eq('assembly_id', assembly!.id).order(cfg.orderBy, { ascending: cfg.ascending }).limit(100)) });
  if (!cfg) return <Empty title="Unknown section" />;

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const row: Record<string, unknown> = { assembly_id: assembly!.id, is_public: isPublic };
    for (const f of cfg.fields) { const v = vals[f.name]; row[f.name] = !v ? null : f.type === 'datetime' ? fromLocalInput(v) : v; }
    const { error } = await supabase.from(cfg.table).insert(row);
    setBusy(false);
    if (error) { setErr(new Error(error.message)); return; }
    toast.ok('Added'); setVals({}); void qc.invalidateQueries({ queryKey: ['content'] });
  }
  async function remove(id: string) {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from(cfg.table).delete().eq('id', id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['content'] });
  }

  return (
    <>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} />
      <Card title="Add new" className="mb-6">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
          {cfg.fields.map((f) => (
            <div key={f.name} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <Field label={f.label}>
                {f.type === 'textarea' ? <Textarea required={f.required} value={vals[f.name] ?? ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
                  : <Input required={f.required} type={f.type === 'datetime' ? 'datetime-local' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'} value={vals[f.name] ?? ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />}
              </Field>
            </div>
          ))}
          <div className="flex items-center gap-4 sm:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />Show on public website</label><Button type="submit" loading={busy}>Add</Button></div>
          {err != null && <div className="sm:col-span-2"><ErrorBox error={err} /></div>}
        </form>
      </Card>
      {list.isLoading ? <Spinner /> : (list.data ?? []).length === 0 ? <Empty title="Nothing here yet" /> : (
        <Card><ul className="divide-y divide-gray-100">
          {list.data!.map((r) => (
            <li key={String(r.id)} className="flex items-start justify-between gap-3 py-3">
              <div><div className="font-medium">{String(r[cfg.primary])} {r.is_public ? <Badge tone="blue">Public</Badge> : <Badge>Members only</Badge>}</div><div className="text-sm text-gray-600">{cfg.secondary(r)}</div></div>
              <button onClick={() => void remove(String(r.id))} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </li>))}
        </ul></Card>
      )}
    </>
  );
}
