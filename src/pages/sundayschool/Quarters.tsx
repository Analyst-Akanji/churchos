import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useQuarters } from './hooks';

export default function Quarters() {
  const { assembly } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const quarters = useQuarters();
  const [year, setYear] = useState(new Date().getFullYear()); const [no, setNo] = useState(1);
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [title, setTitle] = useState('');
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null); setErr(null); setTitle(''); setStart(''); setEnd('');
    setYear(new Date().getFullYear()); setNo(1);
  }
  function startEdit(x: { id: string; year: number; quarter_no: number; start_date: string; end_date: string; title: string | null }) {
    setEditingId(x.id); setErr(null);
    setYear(x.year); setNo(x.quarter_no); setStart(x.start_date); setEnd(x.end_date); setTitle(x.title ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    if (end < start) { setBusy(false); setErr(new Error('The last Sunday cannot be before the first Sunday.')); return; }

    if (editingId) {
      // Do not let a date change strand sessions that have already been created.
      const { count, error: e1 } = await supabase.from('ss_sessions').select('id', { count: 'exact', head: true })
        .eq('quarter_id', editingId).or(`session_date.lt.${start},session_date.gt.${end}`);
      if (e1) { setBusy(false); setErr(new Error(e1.message)); return; }
      if (count) { setBusy(false); setErr(new Error(`${count} Sunday school ${count === 1 ? 'session falls' : 'sessions fall'} outside these dates. Choose dates that include them.`)); return; }

      const { data, error } = await supabase.from('ss_quarters')
        .update({ year, quarter_no: no, start_date: start, end_date: end, title: title || null })
        .eq('id', editingId).select('id');
      setBusy(false);
      if (error) { setErr(new Error(error.message)); return; }
      if (!data || data.length === 0) { setErr(new Error('Nothing was saved. This quarter may be closed, or you may not have permission to change it.')); return; }
      toast.ok('Quarter updated'); resetForm(); void qc.invalidateQueries();
      return;
    }

    const { error } = await supabase.from('ss_quarters').insert({ assembly_id: assembly!.id, year, quarter_no: no, start_date: start, end_date: end, title: title || null });
    setBusy(false);
    if (error) { setErr(new Error(error.message)); return; }
    toast.ok('Quarter created'); setTitle(''); void qc.invalidateQueries({ queryKey: ['quarters'] });
  }
  async function activate(id: string) {
    const { error } = await supabase.from('ss_quarters').update({ status: 'active' }).eq('id', id);
    if (error) toast.err(error.message.includes('one_active') ? 'Another quarter is still active. Close it first.' : error.message);
    else { toast.ok('Quarter activated'); void qc.invalidateQueries(); }
  }
  async function close(id: string) {
    if (!confirm('Close this quarter? All sessions will be locked and the final results, grades and top three will be saved. This cannot be undone.')) return;
    const { error } = await supabase.rpc('close_ss_quarter', { p_quarter_id: id });
    if (error) toast.err(error.message); else { toast.ok('Quarter closed. Results saved.'); void qc.invalidateQueries(); }
  }

  return (
    <>
      <PageHeader title="Quarters" subtitle="Four quarters a year. Only one can be active at a time." />
      <Card title={editingId ? 'Edit quarter' : 'New quarter'} className="mb-6">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-5">
          <Field label="Year"><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} required /></Field>
          <Field label="Quarter"><Select value={no} onChange={(e) => setNo(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Quarter {n}</option>)}</Select></Field>
          <Field label="First Sunday"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="Last Sunday"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
          <Field label="Title (optional)"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="sm:col-span-5">{err != null && <div className="mb-3"><ErrorBox error={err} /></div>}<div className="flex flex-wrap gap-2"><Button type="submit" loading={busy}>{editingId ? 'Save changes' : 'Create quarter'}</Button>{editingId && <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>}</div></div>
        </form>
      </Card>
      {quarters.isLoading ? <Spinner /> : (
        <Card>
          <Table head={['Quarter', 'Dates', 'Status', '']}>
            {(quarters.data ?? []).map((x) => (
              <tr key={x.id}>
                <td className="px-3 py-3 font-medium">{x.year} Q{x.quarter_no}{x.title ? ` · ${x.title}` : ''}</td>
                <td className="px-3 py-3 text-gray-600">{fmtDate(x.start_date)} to {fmtDate(x.end_date)}</td>
                <td className="px-3 py-3"><Badge tone={x.status === 'active' ? 'green' : x.status === 'closed' ? 'purple' : 'gray'}>{x.status}</Badge></td>
                <td className="px-3 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {x.status !== 'closed' && <Button size="sm" variant="secondary" onClick={() => startEdit(x)}>Edit</Button>}
                    {x.status === 'draft' && <Button size="sm" onClick={() => void activate(x.id)}>Activate</Button>}
                    {x.status === 'active' && <Button size="sm" variant="danger" onClick={() => void close(x.id)}>Close quarter</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
