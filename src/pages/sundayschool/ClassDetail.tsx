import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { fmtDate, fullName } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Table, Tabs } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useActiveQuarter, useClasses, useMembersLite } from './hooks';
import type { ClassStaffRow, SsEnrollment, SsSession } from '@/types/db';

type Tab = 'roster' | 'staff' | 'sessions' | 'sheet';

interface SheetPoint { session_id: string; enrollment_id: string; points: number | string }
interface SheetAtt { session_id: string; enrollment_id: string; status: 'present' | 'absent' | 'excused' }
interface SheetBoard { enrollment_id: string; total_points: number | string; rank: number | string }
interface CurriculumLesson { lesson_date: string; lesson_number: number | null; title: string }

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function ClassDetail() {
  const { classId } = useParams();
  const { assembly, isSsLead } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('roster');
  const [term, setTerm] = useState('');
  const [pick, setPick] = useState(''); const [staffRole, setStaffRole] = useState<'teacher' | 'secretary' | 'assistant'>('teacher');

  const classes = useClasses(true);
  const cls = (classes.data ?? []).find((c) => c.id === classId);
  const quarter = useActiveQuarter();
  const members = useMembersLite();
  const byId = new Map((members.data ?? []).map((m) => [m.id, m]));

  const roster = useQuery({
    queryKey: ['roster', classId, quarter.data?.id], enabled: !!quarter.data && !!classId,
    queryFn: () => q<SsEnrollment[]>(supabase.from('ss_enrollments').select('*').eq('class_id', classId!).eq('quarter_id', quarter.data!.id).order('created_at')),
  });
  const staff = useQuery({
    queryKey: ['class-staff', classId], enabled: !!classId,
    queryFn: () => q<ClassStaffRow[]>(supabase.from('ss_class_staff').select('*').eq('class_id', classId!).eq('is_active', true)),
  });
  const sessions = useQuery({
    queryKey: ['class-sessions', classId, quarter.data?.id], enabled: !!quarter.data && !!classId,
    queryFn: () => q<SsSession[]>(supabase.from('ss_sessions').select('*').eq('class_id', classId!).eq('quarter_id', quarter.data!.id).order('session_date', { ascending: false })),
  });

  // Quarter sheet: weekly columns headed by each lesson. Reads the views the leaderboard already uses.
  const sessionIds = (sessions.data ?? []).map((s) => s.id);
  const sheetOn = tab === 'sheet' && sessionIds.length > 0;
  const sheetPoints = useQuery({
    queryKey: ['sheet-points', classId, sessionIds.join(',')], enabled: sheetOn,
    queryFn: () => q<SheetPoint[]>(supabase.from('v_ss_session_points').select('session_id, enrollment_id, points').in('session_id', sessionIds)),
  });
  const sheetAtt = useQuery({
    queryKey: ['sheet-att', classId, sessionIds.join(',')], enabled: sheetOn,
    queryFn: () => q<SheetAtt[]>(supabase.from('ss_attendance').select('session_id, enrollment_id, status').in('session_id', sessionIds)),
  });
  const board = useQuery({
    queryKey: ['sheet-board', classId, quarter.data?.id], enabled: sheetOn && !!quarter.data,
    queryFn: () => q<SheetBoard[]>(supabase.from('ss_leaderboard_live').select('enrollment_id, total_points, rank').eq('class_id', classId!).eq('quarter_id', quarter.data!.id)),
  });
  // Lesson titles from the curriculum, for sessions whose own title is still blank.
  const sessionDates = (sessions.data ?? []).map((s) => s.session_date);
  const curriculum = useQuery({
    queryKey: ['curriculum-for-dates', sessionDates.join(',')], enabled: sessionDates.length > 0,
    queryFn: async () => {
      try { return await q<CurriculumLesson[]>(supabase.from('curriculum_lessons').select('lesson_date, lesson_number, title').in('lesson_date', sessionDates)); }
      catch { return [] as CurriculumLesson[]; }
    },
  });
  const curriculumByDate = new Map((curriculum.data ?? []).map((l) => [l.lesson_date, l]));
  const lessonTitle = (s: SsSession) => s.lesson_title?.trim() || curriculumByDate.get(s.session_date)?.title || '';

  const enrolledIds = new Set((roster.data ?? []).filter((r) => r.status === 'enrolled').map((r) => r.member_id));
  const matches = (members.data ?? []).filter((m) => !enrolledIds.has(m.id) && fullName(m).toLowerCase().includes(term.toLowerCase())).slice(0, 8);

  async function enrol(memberId: string) {
    if (!quarter.data) return;
    const { error } = await supabase.from('ss_enrollments').upsert(
      { assembly_id: assembly!.id, quarter_id: quarter.data.id, class_id: classId, member_id: memberId, status: 'enrolled' },
      { onConflict: 'quarter_id,member_id' });
    if (error) toast.err(error.message.includes('violates') ? 'This student is already in another class this quarter.' : error.message);
    else { setTerm(''); void qc.invalidateQueries({ queryKey: ['roster'] }); }
  }
  async function withdraw(id: string) {
    if (!confirm('Withdraw this student from the class for this quarter?')) return;
    const { error } = await supabase.from('ss_enrollments').update({ status: 'withdrawn' }).eq('id', id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['roster'] });
  }
  async function addStaff() {
    if (!pick) return;
    const { error } = await supabase.from('ss_class_staff').upsert({ assembly_id: assembly!.id, class_id: classId, member_id: pick, staff_role: staffRole, is_active: true }, { onConflict: 'class_id,member_id,staff_role' });
    if (error) toast.err(error.message); else { setPick(''); void qc.invalidateQueries({ queryKey: ['class-staff'] }); }
  }
  async function removeStaff(id: string) {
    const { error } = await supabase.from('ss_class_staff').update({ is_active: false }).eq('id', id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['class-staff'] });
  }

  if (classes.isLoading) return <Spinner />;
  if (!cls) return <Empty title="Class not found" />;
  const active = (roster.data ?? []).filter((r) => r.status === 'enrolled');

  return (
    <>
      <PageHeader title={cls.name} subtitle={quarter.data ? `Active quarter: ${quarter.data.year} Q${quarter.data.quarter_no}` : 'No active quarter'} actions={<Link to="/app/sunday-school/classes"><Button variant="secondary">All classes</Button></Link>} />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'roster', label: `Students (${active.length})` }, { id: 'staff', label: 'Teachers & secretary' }, { id: 'sessions', label: 'Sessions' }, { id: 'sheet', label: 'Quarter sheet' }]} />

      {tab === 'roster' && (
        <div className="space-y-4">
          {isSsLead && quarter.data && (
            <Card title="Add a student">
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search members by name" />
              {term && <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                {matches.length === 0 && <li className="p-3 text-sm text-gray-500">No match. Add the person under Members first.</li>}
                {matches.map((m) => <li key={m.id} className="flex items-center justify-between p-3 text-sm"><span>{fullName(m)} <Badge>{m.age_group}</Badge></span><Button size="sm" onClick={() => void enrol(m.id)}>Enrol</Button></li>)}
              </ul>}
            </Card>
          )}
          <Card>
            {roster.isLoading ? <Spinner /> : active.length === 0 ? <Empty title="No students yet" /> : (
              <Table head={['#', 'Name', '']}>
                {active.map((r, i) => (
                  <tr key={r.id}><td className="px-3 py-2.5 text-gray-500">{i + 1}</td><td className="px-3 py-2.5 font-medium">{fullName(byId.get(r.member_id)) || r.member_id.slice(0, 8)}</td>
                    <td className="px-3 py-2.5 text-right">{isSsLead && <Button size="sm" variant="ghost" onClick={() => void withdraw(r.id)}>Withdraw</Button>}</td></tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === 'staff' && (
        <div className="space-y-4">
          {isSsLead && (
            <Card title="Assign staff">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Member"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose a member</option>{(members.data ?? []).filter((m) => m.age_group !== 'child').map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</Select></Field>
                <Field label="Role"><Select value={staffRole} onChange={(e) => setStaffRole(e.target.value as typeof staffRole)}><option value="teacher">Teacher</option><option value="secretary">Class secretary</option><option value="assistant">Assistant</option></Select></Field>
                <div className="flex items-end"><Button onClick={() => void addStaff()} disabled={!pick}>Assign</Button></div>
              </div>
              <p className="mt-3 text-xs text-gray-500">The person must have linked their login (see Members, invite code) before they can open the class on their phone.</p>
            </Card>
          )}
          <Card>
            {(staff.data ?? []).length === 0 ? <Empty title="No teacher or secretary assigned" /> : (
              <Table head={['Name', 'Role', 'Login linked', '']}>
                {staff.data!.map((s) => { const m = byId.get(s.member_id); return (
                  <tr key={s.id}><td className="px-3 py-2.5 font-medium">{fullName(m)}</td><td className="px-3 py-2.5 capitalize">{s.staff_role}</td>
                    <td className="px-3 py-2.5">{m?.user_id ? <Badge tone="green">Yes</Badge> : <Badge tone="amber">Not yet</Badge>}</td>
                    <td className="px-3 py-2.5 text-right">{isSsLead && <Button size="sm" variant="ghost" onClick={() => void removeStaff(s.id)}>Remove</Button>}</td></tr>); })}
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === 'sheet' && (() => {
        const cols = [...(sessions.data ?? [])].sort((a, b) => a.session_date.localeCompare(b.session_date));
        const ptsMap = new Map((sheetPoints.data ?? []).map((r) => [`${r.session_id}:${r.enrollment_id}`, Number(r.points)]));
        const attMap = new Map((sheetAtt.data ?? []).map((r) => [`${r.session_id}:${r.enrollment_id}`, r.status]));
        const boardMap = new Map((board.data ?? []).map((r) => [r.enrollment_id, { total: Number(r.total_points), rank: Number(r.rank) }]));
        const students = [...active].sort((a, b) => fullName(byId.get(a.member_id)).localeCompare(fullName(byId.get(b.member_id))));
        const loadingSheet = sessions.isLoading || sheetPoints.isLoading || sheetAtt.isLoading || board.isLoading;
        return (
          <Card>
            {loadingSheet ? <Spinner /> : cols.length === 0 ? <Empty title="No sessions yet this quarter" /> : students.length === 0 ? <Empty title="No students yet" /> : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Points for each Sunday and the quarter total</caption>
                  <thead className="border-b border-gray-200 text-xs text-gray-500">
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 text-left uppercase tracking-wide">Student</th>
                      {cols.map((s, i) => (
                        <th key={s.id} scope="col" className="min-w-[5.5rem] px-2 py-2 text-center align-bottom">
                          <Link to={`/app/sunday-school/sessions/${s.id}`} className="block font-semibold text-gray-700 hover:underline">W{s.week_no ?? i + 1}</Link>
                          <div className="font-normal text-gray-500">{shortDate(s.session_date)}</div>
                          <div className="mx-auto max-w-[8rem] truncate font-normal text-gray-400" title={lessonTitle(s)}>{lessonTitle(s) || 'No topic'}</div>
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-center uppercase tracking-wide">Total</th>
                      <th scope="col" className="px-3 py-2 text-center uppercase tracking-wide">Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map((r) => {
                      const b = boardMap.get(r.id);
                      const top = !!b && b.total > 0 && b.rank <= 3;
                      return (
                        <tr key={r.id} className={top ? 'bg-amber-50' : undefined}>
                          <th scope="row" className={`sticky left-0 z-10 whitespace-nowrap px-3 py-2 text-left font-medium ${top ? 'bg-amber-50' : 'bg-white'}`}>{fullName(byId.get(r.member_id)) || r.member_id.slice(0, 8)}</th>
                          {cols.map((s) => {
                            const k = `${s.id}:${r.id}`; const st = attMap.get(k);
                            return (
                              <td key={s.id} className={`px-2 py-2 text-center tabular-nums ${st === 'present' ? '' : 'text-gray-400'}`}>
                                {st === 'present' ? (ptsMap.get(k) ?? 0) : st === 'absent' ? 'A' : st === 'excused' ? 'E' : '-'}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center font-semibold tabular-nums text-brand-900">{b ? b.total : 0}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{b && b.total > 0 ? b.rank : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-gray-200 text-xs text-gray-500">
                    <tr>
                      <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium">Present</th>
                      {cols.map((s) => <td key={s.id} className="px-2 py-2 text-center tabular-nums">{students.filter((r) => attMap.get(`${s.id}:${r.id}`) === 'present').length}</td>)}
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">P = points for the Sunday. A = absent, E = excused, - = not marked. Highlighted rows are the top three.</p>
          </Card>
        );
      })()}

      {tab === 'sessions' && (
        <Card>
          {(sessions.data ?? []).length === 0 ? <Empty title="No sessions yet this quarter" /> : (
            <Table head={['Date', 'Week', 'Lesson', 'Status', '']}>
              {sessions.data!.map((s) => (
                <tr key={s.id}><td className="px-3 py-2.5 font-medium">{fmtDate(s.session_date)}</td><td className="px-3 py-2.5">{s.week_no ?? '-'}</td><td className="px-3 py-2.5">{lessonTitle(s) || '-'}</td>
                  <td className="px-3 py-2.5"><Badge tone={s.status === 'locked' ? 'purple' : s.status === 'submitted' ? 'green' : 'amber'}>{s.status}</Badge></td>
                  <td className="px-3 py-2.5 text-right"><Link to={`/app/sunday-school/sessions/${s.id}`}><Button size="sm" variant="secondary">Open</Button></Link></td></tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
