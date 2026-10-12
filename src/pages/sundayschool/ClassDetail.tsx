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

type Tab = 'roster' | 'staff' | 'sessions';

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
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'roster', label: `Students (${active.length})` }, { id: 'staff', label: 'Teachers & secretary' }, { id: 'sessions', label: 'Sessions' }]} />

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

      {tab === 'sessions' && (
        <Card>
          {(sessions.data ?? []).length === 0 ? <Empty title="No sessions yet this quarter" /> : (
            <Table head={['Date', 'Week', 'Status', '']}>
              {sessions.data!.map((s) => (
                <tr key={s.id}><td className="px-3 py-2.5 font-medium">{fmtDate(s.session_date)}</td><td className="px-3 py-2.5">{s.week_no ?? '-'}</td>
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
