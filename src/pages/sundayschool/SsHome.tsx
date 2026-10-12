import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import { formatNaira, recentSundayISO, weekNumber, fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useActiveQuarter, useClasses } from './hooks';
import type { SessionSummary, SsSession, SsQuarter } from '@/types/db';

const tone = (s: string) => (s === 'locked' ? 'purple' : s === 'submitted' ? 'green' : 'amber') as 'purple' | 'green' | 'amber';

export default function SsHome() {
  const a = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(recentSundayISO());
  const quarter = useActiveQuarter();
  const classes = useClasses();

  const myClassIds = new Set(a.classStaff.map((c) => c.class_id));
  const visibleClasses = (classes.data ?? []).filter((c) => a.isSsLead || myClassIds.has(c.id));

  const sessions = useQuery({
    queryKey: ['ss-day', quarter.data?.id, date],
    enabled: !!quarter.data,
    queryFn: () => withCache(`ss-day:${quarter.data!.id}:${date}`, () =>
      q<SsSession[]>(supabase.from('ss_sessions').select('*').eq('quarter_id', quarter.data!.id).eq('session_date', date))),
  });
  const summary = useQuery({
    queryKey: ['ss-summary', quarter.data?.id, date],
    enabled: !!quarter.data && a.isSsLead,
    queryFn: () => withCache(`ss-summary:${quarter.data!.id}:${date}`, () =>
      q<SessionSummary[]>(supabase.from('v_ss_session_summary').select('*').eq('quarter_id', quarter.data!.id).eq('session_date', date))),
  });

  const open = useMutation({
    mutationFn: async (classIds: string[]) => {
      const qr = quarter.data as SsQuarter;
      const rows = classIds.map((class_id) => ({ assembly_id: a.assembly!.id, quarter_id: qr.id, class_id, session_date: date, week_no: weekNumber(qr.start_date, date), status: 'open' }));
      const { error } = await supabase.from('ss_sessions').upsert(rows, { onConflict: 'class_id,session_date', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.ok('Sessions opened'); void qc.invalidateQueries(); },
    onError: (e) => toast.err(e instanceof Error ? e.message : 'Could not open session'),
  });

  async function openAndGo(classId: string) {
    await open.mutateAsync([classId]);
    const rows = await q<SsSession[]>(supabase.from('ss_sessions').select('id').eq('class_id', classId).eq('session_date', date));
    if (rows[0]) nav(`/app/sunday-school/sessions/${rows[0].id}`);
  }

  if (quarter.isLoading || classes.isLoading) return <Spinner />;
  const sessionByClass = new Map((sessions.data ?? []).map((s) => [s.class_id, s]));
  const sumBySession = new Map((summary.data ?? []).map((s) => [s.session_id, s]));
  const totals = (summary.data ?? []).reduce((t, s) => ({ present: t.present + s.present_count, visitors: t.visitors + s.new_visitors + s.returning_visitors, offering: t.offering + s.offering_kobo }), { present: 0, visitors: 0, offering: 0 });
  const unopened = visibleClasses.filter((c) => !sessionByClass.has(c.id));

  return (
    <>
      <PageHeader title="Sunday school" subtitle={quarter.data ? `${quarter.data.title ?? `Quarter ${quarter.data.quarter_no}, ${quarter.data.year}`} · ${fmtDate(quarter.data.start_date)} to ${fmtDate(quarter.data.end_date)}` : 'No active quarter'}
        actions={a.isSsLead ? (<>
          <Link to="/app/sunday-school/classes"><Button variant="secondary">Classes</Button></Link>
          <Link to="/app/sunday-school/quarters"><Button variant="secondary">Quarters</Button></Link>
          <Link to="/app/sunday-school/leaderboard"><Button variant="gold">Leaderboard</Button></Link></>) : (<Link to="/app/sunday-school/leaderboard"><Button variant="gold">Leaderboard</Button></Link>)} />
      {!quarter.data ? (
        <Empty title="There is no active quarter" hint={a.isSsLead ? 'Create the quarter and press Activate.' : 'The superintendent needs to activate the quarter.'}
          action={a.isSsLead ? <Link to="/app/sunday-school/quarters"><Button>Set up quarters</Button></Link> : undefined} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-600">Sunday</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
            {unopened.length > 0 && a.isSsLead && <Button onClick={() => open.mutate(unopened.map((c) => c.id))} loading={open.isPending}>Open sessions for all classes ({unopened.length})</Button>}
          </div>

          {a.isSsLead && (summary.data ?? []).length > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-3">
              {[['Present', String(totals.present)], ['Visitors', String(totals.visitors)], ['Offering', formatNaira(totals.offering)]].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-gray-500">{l}</div><div className="mt-1 text-xl font-bold text-brand-900">{v}</div></div>
              ))}
            </div>
          )}

          {visibleClasses.length === 0 ? <Empty title="No classes yet" hint={a.isSsLead ? 'Add classes first.' : 'You are not assigned to a class yet.'} /> : (
            <Card>
              <Table head={a.isSsLead ? ['Class', 'Status', 'Present', 'Absent', 'Visitors', 'Offering', ''] : ['Class', 'Status', '']}>
                {visibleClasses.map((c) => {
                  const s = sessionByClass.get(c.id); const m = s ? sumBySession.get(s.id) : undefined;
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-3 font-medium">{c.name}</td>
                      <td className="px-3 py-3">{s ? <Badge tone={tone(s.status)}>{s.status}</Badge> : <Badge>Not opened</Badge>}</td>
                      {a.isSsLead && <><td className="px-3 py-3">{m?.present_count ?? '-'}</td><td className="px-3 py-3">{m?.absent_count ?? '-'}</td>
                        <td className="px-3 py-3">{m ? m.new_visitors + m.returning_visitors : '-'}</td><td className="px-3 py-3">{m ? formatNaira(m.offering_kobo) : '-'}</td></>}
                      <td className="px-3 py-3 text-right">
                        {s ? <Link to={`/app/sunday-school/sessions/${s.id}`}><Button size="sm" variant="secondary">Open</Button></Link>
                          : <Button size="sm" onClick={() => void openAndGo(c.id)} loading={open.isPending}>Start session</Button>}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          )}
          {open.error && <div className="mt-3"><ErrorBox error={open.error} /></div>}
        </>
      )}
    </>
  );
}
