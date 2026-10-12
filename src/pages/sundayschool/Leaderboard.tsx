import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { Badge, Card, Empty, Field, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { useClasses, useQuarters } from './hooks';
import type { LeaderRow } from '@/types/db';

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
const medal = ['bg-gold-500', 'bg-gray-400', 'bg-amber-700'];

export default function Leaderboard() {
  const { isSsLead, isClassStaff, classStaff } = useAuth();
  const quarters = useQuarters(); const classes = useClasses();
  const [quarterId, setQuarterId] = useState(''); const [classId, setClassId] = useState('');
  useEffect(() => { if (!quarterId && quarters.data?.length) setQuarterId((quarters.data.find((x) => x.status === 'active') ?? quarters.data[0]).id); }, [quarters.data, quarterId]);
  const myIds = new Set(classStaff.map((c) => c.class_id));
  const choices = (classes.data ?? []).filter((c) => isSsLead || myIds.has(c.id) || !isClassStaff);
  useEffect(() => { if (!classId && choices.length) setClassId(choices[0].id); }, [choices, classId]);

  const top = useQuery({
    queryKey: ['top3', quarterId, classId], enabled: !!quarterId && !!classId,
    queryFn: () => q<{ rank: number; display_name: string; points: number }[]>(supabase.rpc('ss_top_three', { p_quarter_id: quarterId, p_class_id: classId })),
  });
  const full = useQuery({
    queryKey: ['leaderboard-full', quarterId, classId], enabled: !!quarterId && !!classId && (isSsLead || isClassStaff),
    queryFn: () => q<LeaderRow[]>(supabase.from('ss_leaderboard_live').select('*').eq('quarter_id', quarterId).eq('class_id', classId).order('rank').order('first_name')),
  });
  const closed = quarters.data?.find((x) => x.id === quarterId)?.status === 'closed';

  return (
    <>
      <PageHeader title="Leaderboard" subtitle="Ranked on attendance, punctuality, memory verse, Bible reading and participation. Offerings never count." />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Field label="Quarter"><Select value={quarterId} onChange={(e) => setQuarterId(e.target.value)}>{(quarters.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.year} Q{x.quarter_no} ({x.status})</option>)}</Select></Field>
        <Field label="Class"><Select value={classId} onChange={(e) => setClassId(e.target.value)}>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      </div>
      {top.isLoading ? <Spinner /> : (top.data ?? []).length === 0 ? <Empty title="No results yet" hint="Rankings appear once attendance and scores have been recorded." /> : (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {top.data!.map((r, i) => (
            <div key={`${r.rank}-${r.display_name}`} className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
              <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-white ${medal[Math.min(r.rank - 1, 2)] ?? 'bg-brand-500'}`}><Trophy className="h-6 w-6" /></div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">{ordinal(r.rank)} place</div>
              <div className="mt-1 text-lg font-bold text-brand-900">{r.display_name}</div>
              <div className="text-sm text-gray-600">{Number(r.points)} points</div>
              <span className="sr-only">position {i + 1}</span>
            </div>
          ))}
        </div>
      )}
      {(isSsLead || isClassStaff) && (
        <Card title="Full class table" action={closed ? <Badge tone="purple">Final</Badge> : <Badge tone="green">Live</Badge>}>
          {full.isLoading ? <Spinner /> : (full.data ?? []).length === 0 ? <p className="text-sm text-gray-500">No students enrolled.</p> : (
            <Table head={['Rank', 'Student', 'Sundays present', 'Points']}>
              {full.data!.map((r) => <tr key={r.enrollment_id}><td className="px-3 py-2.5 font-semibold">{r.rank}</td><td className="px-3 py-2.5">{r.first_name} {r.last_name}</td><td className="px-3 py-2.5">{r.sessions_present}</td><td className="px-3 py-2.5 font-medium">{Number(r.total_points)}</td></tr>)}
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
