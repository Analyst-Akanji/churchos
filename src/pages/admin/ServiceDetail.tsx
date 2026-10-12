import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { formatNaira, fmtDate, fmtDateTime, fmtTime, fromLocalInput, fullName, nairaToKobo, toLocalInput } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Table, Tabs } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useMembersLite } from '../sundayschool/hooks';
import type { Checkin, Fund, HeadCount, IncomeEntry, Service } from '@/types/db';

type Tab = 'details' | 'headcount' | 'income' | 'checkins';

export default function ServiceDetail() {
  const { serviceId } = useParams();
  const sid = serviceId!;
  const a = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('details');
  const members = useMembersLite();
  const byId = new Map((members.data ?? []).map((m) => [m.id, m]));
  const refresh = () => qc.invalidateQueries();

  const svc = useQuery({ queryKey: ['service', sid], queryFn: async () => (await q<Service[]>(supabase.from('services').select('*').eq('id', sid)))[0] ?? null });
  const hc = useQuery({ queryKey: ['headcount', sid], queryFn: async () => (await q<HeadCount[]>(supabase.from('service_attendance_counts').select('*').eq('service_id', sid)))[0] ?? null });
  const funds = useQuery({ queryKey: ['funds', a.assembly?.id], enabled: !!a.assembly, queryFn: () => q<Fund[]>(supabase.from('funds').select('*').eq('assembly_id', a.assembly!.id).eq('is_active', true).order('name')) });
  const income = useQuery({ queryKey: ['income', sid], enabled: a.isOffice || a.isFinance, queryFn: () => q<IncomeEntry[]>(supabase.from('service_income_entries').select('*').eq('service_id', sid).order('created_at')) });
  const checkins = useQuery({ queryKey: ['svc-checkins', sid], queryFn: () => q<Checkin[]>(supabase.from('member_checkins').select('*').eq('service_id', sid).order('checked_in_at')) });

  const [d, setD] = useState({ title: '', preacher_name: '', sermon_topic: '', text_used: '', status: 'scheduled', opens: '', closes: '' });
  useEffect(() => { if (svc.data) setD({ title: svc.data.title ?? '', preacher_name: svc.data.preacher_name ?? '', sermon_topic: svc.data.sermon_topic ?? '', text_used: svc.data.text_used ?? '', status: svc.data.status, opens: toLocalInput(svc.data.checkin_opens_at), closes: toLocalInput(svc.data.checkin_closes_at) }); }, [svc.data]);
  const [h, setH] = useState({ men: 0, women: 0, youth_male: 0, youth_female: 0, children: 0 });
  useEffect(() => { if (hc.data) setH({ men: hc.data.men, women: hc.data.women, youth_male: hc.data.youth_male, youth_female: hc.data.youth_female, children: hc.data.children }); }, [hc.data]);
  const [inc, setInc] = useState({ fund_id: '', amount: '', collector: '', note: '' });
  const [pickMember, setPickMember] = useState('');

  if (svc.isLoading) return <Spinner />;
  const s = svc.data;
  if (!s) return <Empty title="Service not found" />;

  async function saveDetails() {
    const { error } = await supabase.from('services').update({ title: d.title || null, preacher_name: d.preacher_name || null, sermon_topic: d.sermon_topic || null, text_used: d.text_used || null, status: d.status, checkin_opens_at: fromLocalInput(d.opens), checkin_closes_at: fromLocalInput(d.closes) }).eq('id', sid);
    if (error) toast.err(error.message); else { toast.ok('Saved'); void refresh(); }
  }
  async function saveHeadcount() {
    const { error } = await supabase.from('service_attendance_counts').upsert({ assembly_id: a.assembly!.id, service_id: sid, ...h }, { onConflict: 'service_id' });
    if (error) toast.err(error.message); else { toast.ok('Headcount saved'); void refresh(); }
  }
  async function addIncome() {
    const kobo = nairaToKobo(inc.amount);
    if (!inc.fund_id) { toast.err('Choose a fund'); return; }
    if (kobo === null) { toast.err('Enter a valid amount, for example 25000 or 25000.50'); return; }
    const { error } = await supabase.from('service_income_entries').insert({ assembly_id: a.assembly!.id, service_id: sid, fund_id: inc.fund_id, amount_kobo: kobo, collector_name: inc.collector || null, note: inc.note || null });
    if (error) toast.err(error.message); else { toast.ok('Income recorded'); setInc({ fund_id: '', amount: '', collector: '', note: '' }); void refresh(); }
  }
  async function verify(id: string) {
    const { error } = await supabase.from('service_income_entries').update({ status: 'verified' }).eq('id', id);
    if (error) toast.err(error.message.includes('check') ? 'Someone other than the person who recorded it must verify.' : error.message); else { toast.ok('Verified'); void refresh(); }
  }
  async function voidEntry(id: string) {
    const reason = prompt('Why is this entry being voided?'); if (!reason?.trim()) return;
    const { error } = await supabase.from('service_income_entries').update({ status: 'voided', void_reason: reason.trim() }).eq('id', id);
    if (error) toast.err(error.message); else { toast.ok('Voided'); void refresh(); }
  }
  async function manualCheckin() {
    if (!pickMember) return;
    const { error } = await supabase.from('member_checkins').insert({ assembly_id: a.assembly!.id, service_id: sid, member_id: pickMember, method: 'usher', checked_in_at: new Date().toISOString() });
    if (error) toast.err(error.message.includes('duplicate') ? 'Already checked in.' : error.message); else { toast.ok('Checked in'); setPickMember(''); void refresh(); }
  }
  async function setCheckin(id: string, status: 'verified' | 'rejected') {
    const { error } = await supabase.from('member_checkins').update({ status }).eq('id', id);
    if (error) toast.err(error.message); else void refresh();
  }

  const entries = income.data ?? [];
  const live = entries.filter((e) => e.status !== 'voided');
  const fundName = (id: string) => (funds.data ?? []).find((f) => f.id === id)?.name ?? '';
  const byFund = new Map<string, number>(); live.forEach((e) => byFund.set(e.fund_id, (byFund.get(e.fund_id) ?? 0) + e.amount_kobo));
  const grand = live.reduce((t, e) => t + e.amount_kobo, 0);
  const cks = checkins.data ?? [];
  const verifiedCount = cks.filter((c) => c.status === 'verified').length;
  const hcTotal = h.men + h.women + h.youth_male + h.youth_female + h.children;
  const canCount = a.isUsher;

  const tabs: { id: Tab; label: string }[] = [{ id: 'details', label: 'Service record' }, { id: 'headcount', label: 'Headcount' }, ...(a.isOffice || a.isFinance ? [{ id: 'income' as Tab, label: 'Income' }] : []), { id: 'checkins', label: `Check-ins (${cks.length})` }];

  return (
    <>
      <PageHeader title={s.title ?? s.service_type.replace('_', ' ')} subtitle={`${fmtDate(s.starts_at)} at ${fmtTime(s.starts_at)}`} actions={<Link to="/app/services"><Button variant="secondary" size="sm">All services</Button></Link>} />
      <Tabs<Tab> value={tab} onChange={setTab} items={tabs} />

      {tab === 'details' && (
        <Card><div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title (optional)"><Input value={d.title} disabled={!a.isOffice} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
          <Field label="Status"><Select value={d.status} disabled={!a.isOffice} onChange={(e) => setD({ ...d, status: e.target.value })}><option value="scheduled">Scheduled</option><option value="open">Open (check-in on)</option><option value="closed">Closed</option></Select></Field>
          <Field label="Preacher"><Input value={d.preacher_name} disabled={!a.isOffice} onChange={(e) => setD({ ...d, preacher_name: e.target.value })} /></Field>
          <Field label="Sermon topic"><Input value={d.sermon_topic} disabled={!a.isOffice} onChange={(e) => setD({ ...d, sermon_topic: e.target.value })} /></Field>
          <Field label="Text used"><Input value={d.text_used} disabled={!a.isOffice} onChange={(e) => setD({ ...d, text_used: e.target.value })} /></Field><div />
          <Field label="Check-in opens"><Input type="datetime-local" value={d.opens} disabled={!a.isOffice} onChange={(e) => setD({ ...d, opens: e.target.value })} /></Field>
          <Field label="Check-in closes"><Input type="datetime-local" value={d.closes} disabled={!a.isOffice} onChange={(e) => setD({ ...d, closes: e.target.value })} /></Field>
          {a.isOffice && <div className="sm:col-span-2"><Button onClick={() => void saveDetails()}>Save</Button></div>}
        </div></Card>
      )}

      {tab === 'headcount' && (
        <Card title="Worship attendance (headcount)"><div className="grid gap-3 sm:grid-cols-5">
          {([['men', 'Men'], ['women', 'Women'], ['youth_male', 'Youth male'], ['youth_female', 'Youth female'], ['children', 'Children']] as const).map(([k, l]) => (
            <Field key={k} label={l}><Input type="number" min={0} inputMode="numeric" disabled={!canCount} value={h[k]} onChange={(e) => setH({ ...h, [k]: Math.max(0, Number(e.target.value) || 0) })} /></Field>))}
        </div>
          <div className="mt-4 flex flex-wrap items-center gap-4"><div className="text-lg font-bold text-brand-900">Total: {hcTotal}</div><div className="text-sm text-gray-600">App check-ins verified: {verifiedCount}</div>{canCount && <Button onClick={() => void saveHeadcount()}>Save headcount</Button>}</div>
        </Card>
      )}

      {tab === 'income' && (
        <div className="space-y-4">
          <Card title="Record income">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Fund"><Select value={inc.fund_id} onChange={(e) => setInc({ ...inc, fund_id: e.target.value })}><option value="">Choose</option>{(funds.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
              <Field label="Amount (₦)"><Input inputMode="decimal" value={inc.amount} onChange={(e) => setInc({ ...inc, amount: e.target.value })} /></Field>
              <Field label="Collector"><Input value={inc.collector} onChange={(e) => setInc({ ...inc, collector: e.target.value })} /></Field>
              <Field label="Note"><Input value={inc.note} onChange={(e) => setInc({ ...inc, note: e.target.value })} /></Field>
            </div>
            <div className="mt-3"><Button onClick={() => void addIncome()}>Record</Button></div>
          </Card>
          <Card title="Weekly income" action={<div className="text-lg font-bold text-brand-900">{formatNaira(grand)}</div>}>
            {entries.length === 0 ? <p className="text-sm text-gray-500">No income recorded for this service.</p> : (<>
              <Table head={['Fund', 'Amount', 'Collector', 'Status', '']}>
                {entries.map((e) => (
                  <tr key={e.id} className={e.status === 'voided' ? 'opacity-50' : ''}>
                    <td className="px-3 py-2.5 font-medium">{fundName(e.fund_id)}</td><td className="px-3 py-2.5">{formatNaira(e.amount_kobo)}</td><td className="px-3 py-2.5 text-gray-600">{e.collector_name ?? ''}</td>
                    <td className="px-3 py-2.5"><Badge tone={e.status === 'verified' ? 'green' : e.status === 'voided' ? 'red' : 'amber'}>{e.status}</Badge></td>
                    <td className="space-x-2 px-3 py-2.5 text-right">
                      {a.isFinance && e.status === 'recorded' && (e.recorded_by === a.user?.id ? <span className="text-xs text-gray-500">Needs a second person</span> : <Button size="sm" onClick={() => void verify(e.id)}>Verify</Button>)}
                      {a.isFinance && e.status !== 'voided' && <Button size="sm" variant="ghost" onClick={() => void voidEntry(e.id)}>Void</Button>}
                    </td>
                  </tr>))}
              </Table>
              <div className="mt-4 border-t border-gray-100 pt-3 text-sm"><div className="mb-1 font-medium text-gray-700">Totals by fund</div>
                {[...byFund].map(([id, v]) => <div key={id} className="flex justify-between py-0.5"><span>{fundName(id)}</span><span className="font-medium">{formatNaira(v)}</span></div>)}</div>
            </>)}
          </Card>
        </div>
      )}

      {tab === 'checkins' && (
        <div className="space-y-4">
          {a.isUsher && (
            <Card title="Check in someone manually"><div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1"><Select value={pickMember} onChange={(e) => setPickMember(e.target.value)}><option value="">Choose a member</option>{(members.data ?? []).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</Select></div>
              <Button onClick={() => void manualCheckin()} disabled={!pickMember}>Check in</Button></div></Card>
          )}
          <Card title={`${verifiedCount} verified of ${cks.length}`}>
            {cks.length === 0 ? <p className="text-sm text-gray-500">No check-ins yet.</p> : (
              <Table head={['Member', 'Time', 'Method', 'Result', '']}>
                {cks.map((c) => (
                  <tr key={c.id}><td className="px-3 py-2.5 font-medium">{fullName(byId.get(c.member_id))}</td><td className="px-3 py-2.5">{fmtDateTime(c.checked_in_at)}</td><td className="px-3 py-2.5 capitalize">{c.method}</td>
                    <td className="px-3 py-2.5"><Badge tone={c.status === 'verified' ? 'green' : c.status === 'flagged' ? 'amber' : 'red'}>{c.status}</Badge>{c.flag_reason && <div className="text-xs text-gray-500">{c.flag_reason.replace(/_/g, ' ')}{c.distance_m ? ` · ${Math.round(c.distance_m)} m away` : ''}</div>}</td>
                    <td className="space-x-2 px-3 py-2.5 text-right">{a.isUsher && c.status === 'flagged' && <><Button size="sm" onClick={() => void setCheckin(c.id, 'verified')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => void setCheckin(c.id, 'rejected')}>Reject</Button></>}</td></tr>))}
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
