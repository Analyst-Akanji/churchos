import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Lock, Send, Undo2, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import { enqueue, pendingFor, useSyncState } from '@/lib/offline/outbox';
import { uid } from '@/lib/uid';
import { formatNaira, fmtDate, koboToNairaInput, nairaToKobo } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import type { AttStatus, Criterion, Member, SessionStatus, SsAttendance, SsEnrollment, SsOffering, SsScore, SsSession, SsVisitor } from '@/types/db';

interface Bundle {
  session: SsSession; className: string;
  roster: { enrollment_id: string; member_id: string; name: string }[];
  attendance: SsAttendance[]; scores: SsScore[]; criteria: Criterion[]; visitors: SsVisitor[]; offering: SsOffering | null;
}
interface AttState { status: AttStatus; is_on_time: boolean }

async function loadBundle(sid: string): Promise<Bundle> {
  const session = (await q<SsSession[]>(supabase.from('ss_sessions').select('*').eq('id', sid)))[0];
  if (!session) throw new Error('Session not found');
  const [cls, enrol, attendance, scores, criteria, visitors, offerings] = await Promise.all([
    q<{ name: string }[]>(supabase.from('ss_classes').select('name').eq('id', session.class_id)),
    q<SsEnrollment[]>(supabase.from('ss_enrollments').select('*').eq('class_id', session.class_id).eq('quarter_id', session.quarter_id).eq('status', 'enrolled').order('created_at')),
    q<SsAttendance[]>(supabase.from('ss_attendance').select('*').eq('session_id', sid)),
    q<SsScore[]>(supabase.from('ss_scores').select('*').eq('session_id', sid)),
    q<Criterion[]>(supabase.from('ss_scoring_criteria').select('*').eq('assembly_id', session.assembly_id).eq('is_active', true).order('sort_order')),
    q<SsVisitor[]>(supabase.from('ss_visitors').select('*').eq('session_id', sid).order('created_at')),
    q<SsOffering[]>(supabase.from('ss_offerings').select('*').eq('session_id', sid).neq('status', 'voided')),
  ]);
  const ids = enrol.map((e) => e.member_id);
  const people = ids.length ? await q<Pick<Member, 'id' | 'first_name' | 'last_name'>[]>(supabase.from('members').select('id, first_name, last_name').in('id', ids)) : [];
  const nameOf = new Map(people.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const roster = enrol.map((e) => ({ enrollment_id: e.id, member_id: e.member_id, name: nameOf.get(e.member_id) ?? 'Unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { session, className: cls[0]?.name ?? 'Class', roster, attendance, scores, criteria, visitors, offering: offerings[0] ?? null };
}

const statusTone = (s: SessionStatus) => (s === 'locked' ? 'purple' : s === 'submitted' ? 'green' : 'amber') as 'purple' | 'green' | 'amber';

export default function SessionEditor() {
  const { sessionId } = useParams();
  const sid = sessionId!;
  const a = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const sync = useSyncState();

  const bundleQ = useQuery({ queryKey: ['session-bundle', sid], queryFn: () => withCache(`session:${sid}`, () => loadBundle(sid)) });
  const b = bundleQ.data;

  const [att, setAtt] = useState<Record<string, AttState>>({});
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [visitors, setVisitors] = useState<SsVisitor[]>([]);
  const [lesson, setLesson] = useState(''); const [verse, setVerse] = useState('');
  const [offAmount, setOffAmount] = useState(''); const [offNote, setOffNote] = useState('');
  const [offRef, setOffRef] = useState<{ id?: string; client_id: string }>({ client_id: uid() });
  const [localStatus, setLocalStatus] = useState<SessionStatus | null>(null);
  const [vName, setVName] = useState(''); const [vPhone, setVPhone] = useState(''); const [vReturning, setVReturning] = useState(false);
  const [initFor, setInitFor] = useState<string | null>(null);
  const [lead, setLead] = useState<unknown>(null);
  const hydrating = useRef(false);

  // Fill local state once per session: server data first, then any writes still waiting in the outbox.
  useEffect(() => {
    if (!b || initFor === sid || hydrating.current) return;
    hydrating.current = true;
    (async () => {
      const aMap: Record<string, AttState> = {}; const sMap: Record<string, Record<string, number>> = {};
      b.attendance.forEach((r) => { aMap[r.enrollment_id] = { status: r.status, is_on_time: r.is_on_time }; });
      b.scores.forEach((r) => { (sMap[r.enrollment_id] ??= {})[r.criterion_id] = Number(r.points); });
      const vis = new Map<string, SsVisitor>(b.visitors.map((v) => [v.client_id ?? v.id, v]));
      let ref = { id: b.offering?.id, client_id: b.offering?.client_id ?? uid() };
      let amt = b.offering ? koboToNairaInput(b.offering.amount_kobo) : ''; let note = b.offering?.note ?? '';
      let les = b.session.lesson_title ?? ''; let ver = b.session.memory_verse_ref ?? '';
      for (const it of await pendingFor('ss_attendance')) if (it.payload.session_id === sid) aMap[String(it.payload.enrollment_id)] = { status: it.payload.status as AttStatus, is_on_time: !!it.payload.is_on_time };
      for (const it of await pendingFor('ss_scores')) if (it.payload.session_id === sid) (sMap[String(it.payload.enrollment_id)] ??= {})[String(it.payload.criterion_id)] = Number(it.payload.points);
      for (const it of await pendingFor('ss_visitors')) if (it.payload.session_id === sid) vis.set(String(it.payload.client_id), { id: String(it.payload.client_id), session_id: sid, full_name: String(it.payload.full_name), phone: (it.payload.phone as string) ?? null, is_returning: !!it.payload.is_returning, client_id: String(it.payload.client_id) });
      for (const it of await pendingFor('ss_offerings')) if (it.payload.session_id === sid) { amt = koboToNairaInput(Number(it.payload.amount_kobo)); note = (it.payload.note as string) ?? ''; ref = { id: it.payload.id as string | undefined, client_id: (it.payload.client_id as string) ?? ref.client_id }; }
      for (const it of await pendingFor('ss_sessions')) if (it.match?.id === sid && 'lesson_title' in it.payload) { les = String(it.payload.lesson_title ?? ''); ver = String(it.payload.memory_verse_ref ?? ''); }
      setAtt(aMap); setScores(sMap); setVisitors([...vis.values()]); setOffRef(ref); setOffAmount(amt); setOffNote(note); setLesson(les); setVerse(ver);
      setInitFor(sid); hydrating.current = false;
    })();
  }, [b, sid, initFor]);

  // Once everything has synced, trust the server's session status again.
  useEffect(() => { if (sync.pending === 0) setLocalStatus(null); }, [sync.pending, b?.session.status]);

  const criteria = b?.criteria ?? [];
  const manual = criteria.filter((c) => c.source === 'manual');
  const maxPerSession = criteria.reduce((t, c) => t + Number(c.max_points), 0);
  const status: SessionStatus = localStatus ?? b?.session.status ?? 'open';
  const readOnly = status === 'locked' || (status === 'submitted' && !a.isSsLead);
  const isSecretary = !!b && a.classStaff.some((c) => c.class_id === b.session.class_id && c.staff_role === 'secretary');
  const canRecordOffering = a.isSsLead || isSecretary;
  const canSeeOffering = canRecordOffering || a.isFinance;

  const pointsFor = (eid: string) => {
    const at = att[eid]; if (!at) return 0;
    let p = 0;
    for (const c of criteria) {
      if (c.source === 'attendance' && at.status === 'present') p += Number(c.max_points);
      if (c.source === 'on_time' && at.status === 'present' && at.is_on_time) p += Number(c.max_points);
      if (c.source === 'manual') p += scores[eid]?.[c.id] ?? 0;
    }
    return p;
  };
  const counts = useMemo(() => {
    const roster = b?.roster ?? [];
    return {
      present: roster.filter((r) => att[r.enrollment_id]?.status === 'present').length,
      absent: roster.filter((r) => att[r.enrollment_id]?.status === 'absent').length,
      unmarked: roster.filter((r) => !att[r.enrollment_id]).length,
    };
  }, [b, att]);

  if (bundleQ.isLoading || (b && initFor !== sid)) return <Spinner />;
  if (bundleQ.error || !b) return <ErrorBox error={bundleQ.error ?? 'Session not found'} />;

  const base = { assembly_id: b.session.assembly_id, session_id: sid, class_id: b.session.class_id };
  const nameOf = (eid: string) => b.roster.find((r) => r.enrollment_id === eid)?.name ?? '';

  function saveAtt(eid: string, next: AttState) {
    setAtt((s) => ({ ...s, [eid]: next }));
    void enqueue({
      key: `att:${sid}:${eid}`, label: `Attendance: ${nameOf(eid)}`, table: 'ss_attendance', onConflict: 'session_id,enrollment_id',
      payload: { ...base, enrollment_id: eid, status: next.status, is_on_time: next.status === 'present' && next.is_on_time, arrived_at: next.status === 'present' ? new Date().toISOString() : null },
    });
  }
  const setStatus = (eid: string, s: AttStatus) => saveAtt(eid, { status: s, is_on_time: s === 'present' ? att[eid]?.is_on_time ?? false : false });
  const toggleOnTime = (eid: string) => saveAtt(eid, { status: 'present', is_on_time: att[eid]?.status === 'present' ? !att[eid].is_on_time : true });
  function setScore(eid: string, c: Criterion, raw: string) {
    const n = raw === '' ? 0 : Math.max(0, Math.min(Number(c.max_points), Number(raw)));
    if (Number.isNaN(n)) return;
    setScores((s) => ({ ...s, [eid]: { ...s[eid], [c.id]: n } }));
    if (!att[eid]) saveAtt(eid, { status: 'present', is_on_time: false });
    void enqueue({ key: `score:${sid}:${eid}:${c.id}`, label: `${c.label}: ${nameOf(eid)}`, table: 'ss_scores', onConflict: 'session_id,enrollment_id,criterion_id',
      payload: { ...base, enrollment_id: eid, criterion_id: c.id, points: n } });
  }
  function markAllPresent() { b!.roster.forEach((r) => { if (!att[r.enrollment_id]) saveAtt(r.enrollment_id, { status: 'present', is_on_time: false }); }); }

  function saveMeta() {
    void enqueue({ key: `session-meta:${sid}`, label: 'Lesson details', op: 'update', table: 'ss_sessions', match: { id: sid }, payload: { lesson_title: lesson || null, memory_verse_ref: verse || null } });
  }
  async function addVisitor(e: FormEvent) {
    e.preventDefault(); if (!vName.trim()) return;
    const cid = uid();
    setVisitors((v) => [...v, { id: cid, session_id: sid, full_name: vName.trim(), phone: vPhone.trim() || null, is_returning: vReturning, client_id: cid }]);
    await enqueue({ key: `visitor:${cid}`, label: `Visitor: ${vName.trim()}`, table: 'ss_visitors', onConflict: 'assembly_id,client_id',
      payload: { ...base, full_name: vName.trim(), phone: vPhone.trim() || null, is_returning: vReturning, client_id: cid } });
    setVName(''); setVPhone(''); setVReturning(false);
  }
  async function saveOffering() {
    const kobo = nairaToKobo(offAmount);
    if (kobo === null) { toast.err('Enter a valid amount, for example 3500 or 3500.50'); return; }
    await enqueue({ key: `offering:${sid}`, label: `Class offering ${formatNaira(kobo)}`, table: 'ss_offerings',
      onConflict: offRef.id ? 'id' : 'assembly_id,client_id',
      payload: { ...base, amount_kobo: kobo, note: offNote || null, ...(offRef.id ? { id: offRef.id } : { client_id: offRef.client_id }) } });
    toast.ok(navigator.onLine ? 'Offering saved' : 'Offering saved on your phone');
  }
  async function submit() {
    if (counts.unmarked > 0 && !confirm(`${counts.unmarked} student(s) have no attendance mark. Submit anyway? You will not be able to edit afterwards.`)) return;
    if (counts.unmarked === 0 && !confirm('Submit this session? You will not be able to edit it afterwards.')) return;
    await enqueue({ key: `session-status:${sid}`, label: 'Submit session', op: 'update', table: 'ss_sessions', match: { id: sid },
      payload: { status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: a.user!.id } });
    setLocalStatus('submitted'); toast.ok(navigator.onLine ? 'Session submitted' : 'Submitted on your phone. It will reach the superintendent when you are online.');
  }
  async function leadSetStatus(next: SessionStatus) {
    setLead(null);
    const patch = next === 'locked' ? { status: next, locked_at: new Date().toISOString(), locked_by: a.user!.id } : { status: next };
    const { error } = await supabase.from('ss_sessions').update(patch).eq('id', sid);
    if (error) { setLead(new Error(error.message)); return; }
    setLocalStatus(null); toast.ok(next === 'open' ? 'Session reopened' : 'Session locked'); void qc.invalidateQueries();
  }
  async function verifyOffering() {
    if (!b!.offering) return;
    const { error } = await supabase.from('ss_offerings').update({ status: 'verified' }).eq('id', b!.offering.id);
    if (error) { toast.err(error.message.includes('check') ? 'Someone other than the person who recorded it must verify.' : error.message); return; }
    toast.ok('Offering verified'); void qc.invalidateQueries();
  }
  async function voidOffering() {
    if (!b!.offering) return;
    const reason = prompt('Why is this offering record being voided?'); if (!reason?.trim()) return;
    const { error } = await supabase.from('ss_offerings').update({ status: 'voided', void_reason: reason.trim() }).eq('id', b!.offering.id);
    if (error) toast.err(error.message); else { toast.ok('Voided. You can now enter the correct amount.'); setOffRef({ client_id: uid() }); setOffAmount(''); setOffNote(''); void qc.invalidateQueries(); }
  }

  const off = b.offering;
  const offLocked = !!off && off.status !== 'recorded';

  return (
    <>
      <PageHeader title={`${b.className}`} subtitle={`${fmtDate(b.session.session_date)}${b.session.week_no ? ` · Week ${b.session.week_no}` : ''}`}
        actions={<><Badge tone={statusTone(status)}>{status}</Badge><Link to="/app/sunday-school"><Button variant="secondary" size="sm">Back</Button></Link></>} />

      {readOnly && <div className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{status === 'locked' ? 'This session is locked.' : 'This session has been submitted.'} Ask the superintendent to reopen it if something needs correcting.</div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Lesson topic"><Input value={lesson} disabled={readOnly} onChange={(e) => setLesson(e.target.value)} onBlur={saveMeta} placeholder="Optional" /></Field>
        <Field label="Memory verse"><Input value={verse} disabled={readOnly} onChange={(e) => setVerse(e.target.value)} onBlur={saveMeta} placeholder="e.g. John 3:16" /></Field>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        {[['Present', counts.present, 'text-emerald-700'], ['Absent', counts.absent, 'text-crimson-600'], ['Not marked', counts.unmarked, 'text-gray-600']].map(([l, v, c]) => (
          <div key={String(l)} className="rounded-xl border border-gray-200 bg-white p-3"><div className={`text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-gray-500">{l}</div></div>
        ))}
      </div>

      <Card title="Attendance and scores" action={!readOnly && counts.unmarked > 0 ? <Button size="sm" variant="secondary" onClick={markAllPresent}><CheckCheck className="h-4 w-4" />Mark all present</Button> : undefined}>
        {b.roster.length === 0 ? <Empty title="No students enrolled in this class" hint="The superintendent can add students under Classes." /> : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-3 py-2 text-left">Student</th><th className="px-3 py-2 text-left">Attendance</th><th className="px-3 py-2">On time</th>
                  {manual.map((c) => <th key={c.id} className="px-2 py-2">{c.label}<div className="font-normal normal-case text-gray-400">max {Number(c.max_points)}</div></th>)}
                  <th className="px-3 py-2">Pts</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {b.roster.map((r) => {
                  const s = att[r.enrollment_id];
                  return (
                    <tr key={r.enrollment_id}>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {([['present', 'P'], ['absent', 'A'], ['excused', 'E']] as [AttStatus, string][]).map(([k, l]) => (
                            <button key={k} disabled={readOnly} onClick={() => setStatus(r.enrollment_id, k)} aria-label={k}
                              className={clsx('h-9 w-9 rounded-lg border text-sm font-semibold disabled:opacity-60', s?.status === k ? (k === 'present' ? 'border-emerald-600 bg-emerald-600 text-white' : k === 'absent' ? 'border-crimson-500 bg-crimson-500 text-white' : 'border-amber-500 bg-amber-500 text-white') : 'border-gray-300 bg-white text-gray-600')}>{l}</button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center"><input type="checkbox" className="h-5 w-5 accent-brand-700" disabled={readOnly || s?.status === 'absent' || s?.status === 'excused'} checked={!!s?.is_on_time && s.status === 'present'} onChange={() => toggleOnTime(r.enrollment_id)} aria-label="On time" /></td>
                      {manual.map((c) => (
                        <td key={c.id} className="px-2 py-2 text-center">
                          <input type="number" inputMode="decimal" min={0} max={Number(c.max_points)} step="0.5" disabled={readOnly} value={scores[r.enrollment_id]?.[c.id] ?? ''} onChange={(e) => setScore(r.enrollment_id, c, e.target.value)}
                            className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-center disabled:bg-gray-50" aria-label={c.label} />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-semibold text-brand-800">{pointsFor(r.enrollment_id)}<span className="text-xs font-normal text-gray-400">/{maxPerSession}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={`Visitors (${visitors.length})`}>
          {!readOnly && (
            <form onSubmit={addVisitor} className="mb-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Visitor's name" value={vName} onChange={(e) => setVName(e.target.value)} /><Input placeholder="Phone (optional)" inputMode="tel" value={vPhone} onChange={(e) => setVPhone(e.target.value)} /></div>
              <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={vReturning} onChange={(e) => setVReturning(e.target.checked)} />Visited before</label>
                <Button type="submit" size="sm" disabled={!vName.trim()}><UserPlus className="h-4 w-4" />Add</Button></div>
            </form>
          )}
          {visitors.length === 0 ? <p className="text-sm text-gray-500">No visitors recorded.</p> : (
            <ul className="divide-y divide-gray-100 text-sm">{visitors.map((v) => <li key={v.id} className="flex items-center justify-between py-2"><span>{v.full_name}{v.phone ? ` · ${v.phone}` : ''}</span><Badge tone={v.is_returning ? 'blue' : 'green'}>{v.is_returning ? 'Previous' : 'New'}</Badge></li>)}</ul>
          )}
        </Card>

        {canSeeOffering && (
          <Card title="Class offering" action={off ? <Badge tone={off.status === 'verified' ? 'green' : 'amber'}>{off.status}</Badge> : undefined}>
            {canRecordOffering && !readOnly ? (
              <div className="space-y-3">
                <Field label="Amount (₦)"><Input inputMode="decimal" value={offAmount} disabled={offLocked} onChange={(e) => setOffAmount(e.target.value)} placeholder="0" /></Field>
                <Field label="Note (optional)"><Input value={offNote} disabled={offLocked} onChange={(e) => setOffNote(e.target.value)} /></Field>
                <Button onClick={() => void saveOffering()} disabled={offLocked || !offAmount}>Save offering</Button>
                {offLocked && <p className="text-xs text-gray-500">A verified amount cannot be edited. Void it with a reason, then enter the correct amount.</p>}
              </div>
            ) : <div className="text-2xl font-bold text-brand-900">{off ? formatNaira(off.amount_kobo) : 'Not recorded'}</div>}
            {off && (a.isSsLead || a.isFinance) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                {off.status === 'recorded' && (off.recorded_by === a.user?.id
                  ? <span className="text-xs text-gray-500">You recorded this, so someone else must verify it.</span>
                  : <Button size="sm" onClick={() => void verifyOffering()}>Verify {formatNaira(off.amount_kobo)}</Button>)}
                {off.status !== 'voided' && <Button size="sm" variant="ghost" onClick={() => void voidOffering()}>Void</Button>}
              </div>
            )}
          </Card>
        )}
      </div>

      {a.isSsLead && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {status !== 'open' && <Button variant="secondary" onClick={() => void leadSetStatus('open')}><Undo2 className="h-4 w-4" />Reopen</Button>}
          {status !== 'locked' && <Button variant="secondary" onClick={() => void leadSetStatus('locked')}><Lock className="h-4 w-4" />Lock</Button>}
          {lead != null && <ErrorBox error={lead} />}
        </div>
      )}

      {!readOnly && status === 'open' && (
        <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur md:left-64" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm text-gray-600">{counts.present} present · {counts.unmarked} not marked</span>
            <Button onClick={() => void submit()}><Send className="h-4 w-4" />Submit session</Button>
          </div>
        </div>
      )}
    </>
  );
}
