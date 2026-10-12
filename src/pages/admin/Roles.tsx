import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { fullName } from '@/lib/format';
import { Button, Card, Empty, Field, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useMembersLite } from '../sundayschool/hooks';
import type { Role, UserRoleRow } from '@/types/db';

const ROLES: { id: Role; label: string; note: string }[] = [
  { id: 'assembly_admin', label: 'Assembly admin', note: 'Everything in this assembly' },
  { id: 'church_secretary', label: 'Church secretary', note: 'Services, headcount, members, events, announcements' },
  { id: 'finance_officer', label: 'Finance officer', note: 'Income entries, verification, receipts' },
  { id: 'superintendent', label: 'Sunday school superintendent', note: 'All classes, offerings, quarters' },
  { id: 'usher', label: 'Usher', note: 'Manual check-in, headcount' },
  { id: 'department_head', label: 'Department head', note: 'Rota for their department' },
];

export default function Roles() {
  const { assembly, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const members = useMembersLite();
  const roles = useQuery({ queryKey: ['roles', assembly?.id], enabled: !!assembly, queryFn: () => q<UserRoleRow[]>(supabase.from('user_roles').select('*').eq('assembly_id', assembly!.id).neq('role', 'member')) });
  const [pick, setPick] = useState(''); const [role, setRole] = useState<Role>('church_secretary');
  const byUser = new Map((members.data ?? []).filter((m) => m.user_id).map((m) => [m.user_id as string, m]));
  const linked = (members.data ?? []).filter((m) => m.user_id);

  async function grant() {
    const m = linked.find((x) => x.id === pick); if (!m?.user_id) return;
    const { error } = await supabase.from('user_roles').insert({ assembly_id: assembly!.id, user_id: m.user_id, role, granted_by: user!.id });
    if (error) toast.err(error.message.includes('duplicate') ? 'They already have that role.' : error.message);
    else { toast.ok('Role granted'); setPick(''); void qc.invalidateQueries({ queryKey: ['roles'] }); }
  }
  async function revoke(id: string) {
    if (!confirm('Remove this role?')) return;
    const { error } = await supabase.from('user_roles').delete().eq('id', id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['roles'] });
  }

  return (
    <>
      <PageHeader title="Roles" subtitle="Who can do what. Class teachers and secretaries are assigned under Sunday school, Classes." />
      <Card title="Give a role" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Member (must have a linked login)"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose</option>{linked.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}</Select></Field>
          <Field label="Role" hint={ROLES.find((r) => r.id === role)?.note}><Select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
          <div className="flex items-end"><Button onClick={() => void grant()} disabled={!pick}>Grant role</Button></div>
        </div>
      </Card>
      {roles.isLoading ? <Spinner /> : (roles.data ?? []).length === 0 ? <Empty title="No roles assigned yet" /> : (
        <Card>
          <Table head={['Person', 'Role', '']}>
            {roles.data!.map((r) => (
              <tr key={r.id}><td className="px-3 py-2.5 font-medium">{fullName(byUser.get(r.user_id)) || 'Unlinked user'}{r.user_id === user?.id ? ' (you)' : ''}</td>
                <td className="px-3 py-2.5">{ROLES.find((x) => x.id === r.role)?.label ?? r.role}</td>
                <td className="px-3 py-2.5 text-right">{r.user_id !== user?.id && <Button size="sm" variant="ghost" onClick={() => void revoke(r.id)}>Remove</Button>}</td></tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
