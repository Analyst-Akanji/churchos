import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { withCache } from '@/lib/offline/cache';
import { fmtDate } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Spinner } from '@/components/ui';
import type { AttStatus, SsAttendance, SsClass, SsEnrollment, SsQuarter, SsSession } from '@/types/db';

interface Row { date: string; status: AttStatus | null; onTime: boolean; points: number }
interface Person {
  id: string; name: string; relation: 'me' | 'child';
  quarter: SsQuarter | null; className: string; rows: Row[]; present: number; held: number; points: number; maxPerSunday: number;
  result: { rank_in_class: number; grade: string | null; percent: number } | null;
  top: { rank: number; display_name: string; points: number }[];
}
const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

async function load(meId: string, assemblyId: string): Promise<Person[]> {
  const wards = await q<{ child_member_id: string }[]>(supabase.from('member_guardians').select('child_member_id').eq('guardian_member_id', meId));
  const ids = [meId, ...wards.map((w) => w.child_member_id)];
  const people = await q<{ id: string; first_name: string; last_name: string }[]>(supabase.from('members').select('id, first_name, last_name').in('id', ids));
  const enrols = await q<SsEnrollment[]>(supabase.from('ss_enrollments').select('*').in('member_id', ids).eq('status', 'enrolled'));
  const quarters = enrols.length ? await q<SsQuarter[]>(supabase.from('ss_quarters').select('*').in('id', [...new Set(enrols.map((e) => e.quarter_id))])) : [];
  const classes = enrols.length ? await q<SsClass[]>(supabase.from('ss_classes').select('*').in('id', [...new Set(enrols.map((e) => e.class_id))])) : [];
  const crit = await q<{ max_points: number }[]>(supabase.from('ss_scoring_criteria').select('max_points').eq('assembly_id', assemblyId).eq('is_active', true));
  const maxPerSunday = crit.reduce((t, c) => t + Number(c.max_points), 0);
  const qOf = new Map(quarters.map((x) => [x.id, x]));

  // most relevant enrolment per person: active quarter first, then the most recent
  const rank = (e: SsEnrollment) => { const x = qOf.get(e.quarter_id); return x ? (x.status === 'active' ? 1e6 : 0) + x.year * 10 + x.quarter_no : -1; };
  const chosen = new Map<string, SsEnrollment>();
  for (const e of enrols) { const cur = chosen.get(e.member_id); if (!cur || rank(e) > rank(cur)) chosen.set(e.member_id, e); }
  const eids = [...chosen.values()].map((e) => e.id);

  const sessions = eids.length ? await q<SsSession[]>(supabase.from('ss_sessions').select('id, class_id, quarter_id, session_date').in('class_id', [...new Set([...chosen.values()].map((e) => e.class_id))]).in('quarter_id', [...new Set([...chosen.values()].map((e) => e.quarter_id))])) : [];
  const att = eids.length ? await q<SsAttendance[]>(supabase.from('ss_attendance').select('*').in('enrollment_id', eids)) : [];
  const pts = eids.length ? await q<{ session_id: string; enrollment_id: string; points: number }[]>(supabase.from('v_ss_session_points').select('session_id, enrollment_id, points').in('enrollment_id', eids)) : [];
  const results = eids.length ? await q<{ enrollment_id: string; rank_in_class: number; grade: string | null; percent: number }[]>(supabase.from('ss_quarter_results').select('enrollment_id, rank_in_class, grade, percent').in('enrollment_id', eids)) : [];

  const out: Person[] = [];
  for (const p of people) {
    const e = chosen.get(p.id);
    const name = `${p.first_name} ${p.last_name}`;
    const relation = p.id === meId ? 'me' : 'child';
    if (!e) { out.push({ id: p.id, name, relation, quarter: null, className: '', rows: [], present: 0, held: 0, points: 0, maxPerSunday, result: null, top: [] }); continue; }
    const mine = sessions.filter((s) => s.class_id === e.class_id && s.quarter_id === e.quarter_id).sort((a, b) => a.session_date.localeCompare(b.session_date));
    const rows: Row[] = mine.map((s) => {
      const a = att.find((x) => x.session_id === s.id && x.enrollment_id === e.id);
      const pt = pts.find((x) => x.session_id === s.id && x.enrollment_id === e.id);
      return { date: s.session_date, status: a?.status ?? null, onTime: !!a?.is_on_time, points: Number(pt?.points ?? 0) };
    });
    const top = await q<{ rank: number; display_name: string; points: number }[]>(supabase.rpc('ss_top_three', { p_quarter_id: e.quarter_id, p_class_id: e.class_id })).catch(() => []);
    out.push({
      id: p.id, name, relation, quarter: qOf.get(e.quarter_id) ?? null, className: classes.find((c) => c.id === e.class_id)?.name ?? '',
      rows, present: rows.filter((r) => r.status === 'present').length, held: rows.length, points: rows.reduce((t, r) => t + r.points, 0), maxPerSunday,
      result: results.find((r) => r.enrollment_id === e.id) ?? null, top,
    });
  }
  return out.sort((a, b) => (a.relation === b.relation ? a.name.localeCompare(b.name) : a.relation === 'me' ? -1 : 1));
}

export default function MyProgress() {
  const { member, assembly } = useAuth();
  const [sel, setSel] = useState<string | null>(null);
  const data = useQuery({ queryKey: ['my-progress', member?.id], enabled: !!member && !!assembly, queryFn: () => withCache(`my-progress:${member!.id}`, () => load(member!.id, assembly!.id)) });

  if (!member) return <Empty title="Link your account first" hint="Go to Home and enter your invite code." />;
  if (data.isLoading) return <Spinner />;
  const list = data.data ?? [];
  const person = list.find((p) => p.id === sel) ?? list[0];
  const children = list.filter((p) => p.relation === 'child').length;
  if (!person) return <Empty title="Nothing to show yet" />;

  return (
    <>
      <PageHeader title="Sunday school progress" subtitle={children ? 'Your progress and your children\u2019s.' : 'Your progress this quarter.'} />
      {list.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {list.map((p) => <button key={p.id} onClick={() => setSel(p.id)} className={clsx('rounded-full border px-4 py-1.5 text-sm font-medium', p.id === person.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-700')}>{p.relation === 'me' ? 'Me' : p.name.split(' ')[0]}</button>)}
        </div>
      )}

      {!person.quarter ? (
        <Empty title={person.relation === 'me' ? 'You are not in a Sunday school class yet' : `${person.name.split(' ')[0]} is not in a Sunday school class yet`} hint="The Sunday school superintendent enrols students at the start of each quarter." />
      ) : (
        <div className="space-y-4">
          <Card title={`${person.name} · ${person.className}`} action={<Badge tone={person.quarter.status === 'closed' ? 'purple' : 'green'}>{person.quarter.status === 'closed' ? 'Final results' : 'In progress'}</Badge>}>
            <div className="mb-1 text-sm text-gray-500">{person.quarter.year} Quarter {person.quarter.quarter_no}</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-2xl font-bold text-brand-900">{person.present}<span className="text-sm font-medium text-gray-500">/{person.held}</span></div><div className="text-xs text-gray-500">Sundays present</div></div>
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-2xl font-bold text-brand-900">{person.points}<span className="text-sm font-medium text-gray-500">/{person.held * person.maxPerSunday}</span></div><div className="text-xs text-gray-500">Points</div></div>
              <div className="rounded-xl bg-gray-50 p-3">{person.result ? <><div className="text-2xl font-bold text-brand-900">{person.result.grade ?? '-'}</div><div className="text-xs text-gray-500">Grade · {ordinal(person.result.rank_in_class)} in class</div></> : <><div className="text-2xl font-bold text-gray-300">-</div><div className="text-xs text-gray-500">Grade at quarter end</div></>}</div>
            </div>
          </Card>

          <Card title="Sunday by Sunday">
            {person.rows.length === 0 ? <p className="text-sm text-gray-500">No Sundays recorded yet.</p> : (
              <ul className="divide-y divide-gray-100 text-sm">
                {person.rows.map((r) => (
                  <li key={r.date} className="flex items-center justify-between py-2.5">
                    <span className="font-medium text-gray-800">{fmtDate(r.date)}</span>
                    <span className="flex items-center gap-3">
                      {r.status === 'present' ? <Badge tone="green">{r.onTime ? 'Present, on time' : 'Present'}</Badge> : r.status === 'absent' ? <Badge tone="red">Absent</Badge> : r.status === 'excused' ? <Badge tone="amber">Excused</Badge> : <Badge>Not marked</Badge>}
                      <span className="w-14 text-right font-semibold text-brand-800">{r.points} pts</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-gray-500">Points come from attendance, punctuality, memory verse, Bible reading and class participation. Offerings never count.</p>
          </Card>

          {person.top.length > 0 && (
            <Card title={`${person.className} top three`}>
              <ul className="space-y-2">
                {person.top.map((t) => (
                  <li key={`${t.rank}-${t.display_name}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                    <span className="flex items-center gap-3"><Trophy className={clsx('h-5 w-5', t.rank === 1 ? 'text-gold-500' : t.rank === 2 ? 'text-gray-400' : 'text-amber-700')} /><span className="font-medium text-gray-900">{ordinal(t.rank)}</span><span className="text-gray-700">{t.display_name}</span></span>
                    <span className="text-sm font-semibold text-brand-800">{Number(t.points)} pts</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
