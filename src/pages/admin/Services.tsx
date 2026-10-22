import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { fmtDate, fmtTime, todayISO } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import { confirmAndDeleteService } from './deleteService';
import type { Service } from '@/types/db';

const TYPES = [['sunday_worship', 'Sunday worship'], ['sunday_school', 'Sunday school'], ['midweek', 'Midweek'], ['prayer', 'Prayer meeting'], ['vigil', 'Vigil'], ['special', 'Special service'], ['other', 'Other']];

export default function Services() {
  const { assembly, isOffice, isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ['services', assembly?.id], enabled: !!assembly, queryFn: () => q<Service[]>(supabase.from('services').select('*').eq('assembly_id', assembly!.id).order('starts_at', { ascending: false }).limit(60)) });
  const [f, setF] = useState({ service_type: 'sunday_worship', date: todayISO(), time: '09:00', title: '', preacher_name: '', sermon_topic: '', text_used: '' });
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const start = new Date(`${f.date}T${f.time}`);
    const { data: created, error } = await supabase.from('services').insert({
      assembly_id: assembly!.id, service_type: f.service_type, service_date: f.date, starts_at: start.toISOString(),
      title: f.title || null, preacher_name: f.preacher_name || null, sermon_topic: f.sermon_topic || null, text_used: f.text_used || null,
      checkin_opens_at: new Date(start.getTime() - 3600_000).toISOString(), checkin_closes_at: new Date(start.getTime() + 4 * 3600_000).toISOString(), status: 'scheduled',
    }).select('id').single();
    setBusy(false);
    if (error) { setErr(new Error(error.message.includes('duplicate') ? 'A service of this type already exists at that time.' : error.message)); return; }
    toast.ok('Service created'); void qc.invalidateQueries({ queryKey: ['services'] });
    if (f.service_type === 'sunday_worship' && created) {
      // Start the order of service from the last Sunday's, ready for the names.
      const { error: e2 } = await supabase.rpc('create_service_order_from_previous', { p_service: created.id });
      if (e2) toast.err(`The service was created, but its order of service could not be started: ${e2.message}`);
      else { toast.ok('Order of service started. Add the moderator and names.'); navigate(`/app/services/${created.id}`, { state: { tab: 'order' } }); }
    }
  }

  async function remove(s: Service) {
    await confirmAndDeleteService(`${s.title ?? s.service_type.replace('_', ' ')}, ${fmtDate(s.starts_at)}`, s.id, toast, qc);
  }

  return (
    <>
      <PageHeader title="Services & income" subtitle="The digital Service Record and Weekly Income book." />
      {isOffice && (
        <Card title="New service" className="mb-6">
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
            <Field label="Type"><Select value={f.service_type} onChange={(e) => setF({ ...f, service_type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Date"><Input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Time of worship"><Input type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
            <Field label="Preacher"><Input value={f.preacher_name} onChange={(e) => setF({ ...f, preacher_name: e.target.value })} /></Field>
            <Field label="Sermon topic"><Input value={f.sermon_topic} onChange={(e) => setF({ ...f, sermon_topic: e.target.value })} /></Field>
            <Field label="Text used"><Input value={f.text_used} onChange={(e) => setF({ ...f, text_used: e.target.value })} placeholder="e.g. Psalm 138:8" /></Field>
            <div className="sm:col-span-3">{err != null && <div className="mb-3"><ErrorBox error={err} /></div>}<Button type="submit" loading={busy}>Create service</Button>
              <span className="ml-3 text-xs text-gray-500">Check-in opens 1 hour before and closes 4 hours after the start. You can change it on the service page.</span></div>
          </form>
        </Card>
      )}
      {list.isLoading ? <Spinner /> : (
        <Card>
          <Table head={['Date', 'Service', 'Preacher', 'Status', '']}>
            {(list.data ?? []).map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2.5 font-medium">{fmtDate(s.starts_at)}<div className="text-xs font-normal text-gray-500">{fmtTime(s.starts_at)}</div></td>
                <td className="px-3 py-2.5 capitalize">{s.title ?? s.service_type.replace('_', ' ')}</td>
                <td className="px-3 py-2.5 text-gray-600">{s.preacher_name ?? ''}</td>
                <td className="px-3 py-2.5"><Badge tone={s.status === 'open' ? 'green' : s.status === 'closed' ? 'purple' : 'gray'}>{s.status}</Badge></td>
                <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-2"><Link to={`/app/services/${s.id}`}><Button size="sm" variant="secondary">Open</Button></Link>{isAdmin && <Button size="sm" variant="ghost" onClick={() => void remove(s)}>Delete</Button>}</div></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
