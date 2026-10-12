import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, UserPlus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { inviteCode } from '@/lib/uid';
import { fullName } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useMembersLite } from '../sundayschool/hooks';
import type { AgeGroup, MemberInvite } from '@/types/db';

export default function Members() {
  const { assembly, isOffice, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const members = useMembersLite();
  const [term, setTerm] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ first_name: '', last_name: '', gender: '', age_group: 'adult' as AgeGroup, phone: '', email: '', date_of_birth: '' });
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ name: string; code: string } | null>(null);

  const invites = useQuery({
    queryKey: ['invites', assembly?.id], enabled: !!assembly && isOffice,
    queryFn: () => q<MemberInvite[]>(supabase.from('member_invites').select('*').eq('assembly_id', assembly!.id).is('claimed_at', null).gt('expires_at', new Date().toISOString())),
  });
  const codeFor = new Map((invites.data ?? []).map((i) => [i.member_id, i.code]));

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.from('members').insert({
      assembly_id: assembly!.id, first_name: f.first_name.trim(), last_name: f.last_name.trim(), gender: f.gender || null, age_group: f.age_group,
      phone: f.phone.trim() || null, email: f.email.trim() || null, date_of_birth: f.date_of_birth || null,
    });
    setBusy(false);
    if (error) { setErr(new Error(error.message)); return; }
    toast.ok('Member added'); setAdding(false); setF({ first_name: '', last_name: '', gender: '', age_group: 'adult', phone: '', email: '', date_of_birth: '' });
    void qc.invalidateQueries({ queryKey: ['members-lite'] });
  }
  async function makeInvite(id: string, name: string) {
    const code = inviteCode();
    const { error } = await supabase.from('member_invites').insert({ assembly_id: assembly!.id, member_id: id, code, created_by: user!.id });
    if (error) { toast.err(error.message); return; }
    setInvite({ name, code }); void qc.invalidateQueries({ queryKey: ['invites'] });
  }

  const list = (members.data ?? []).filter((m) => fullName(m).toLowerCase().includes(term.toLowerCase()));
  const shareText = invite ? encodeURIComponent(`Hello ${invite.name}. Your ChurchOS invite code is ${invite.code}. Create an account at ${window.location.origin}/register, sign in, and enter this code to link your account. It expires in 14 days.`) : '';

  return (
    <>
      <PageHeader title="Members" subtitle={`${members.data?.length ?? 0} people`} actions={isOffice ? <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add member</Button> : undefined} />
      <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name" className="mb-4 max-w-sm" />
      {members.isLoading ? <Spinner /> : (
        <Card>
          <Table head={['Name', 'Group', 'Phone', 'Login', '']}>
            {list.slice(0, 200).map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2.5 font-medium">{fullName(m)}</td>
                <td className="px-3 py-2.5 capitalize">{m.age_group}</td>
                <td className="px-3 py-2.5 text-gray-600">{m.phone ?? ''}</td>
                <td className="px-3 py-2.5">{m.user_id ? <Badge tone="green">Linked</Badge> : codeFor.get(m.id) ? <Badge tone="amber">Code {codeFor.get(m.id)}</Badge> : <Badge>None</Badge>}</td>
                <td className="px-3 py-2.5 text-right">{isOffice && !m.user_id && m.age_group !== 'child' && <Button size="sm" variant="secondary" onClick={() => void makeInvite(m.id, m.first_name)}>{codeFor.get(m.id) ? 'New code' : 'Invite'}</Button>}</td>
              </tr>
            ))}
          </Table>
          {list.length > 200 && <p className="mt-3 text-xs text-gray-500">Showing the first 200. Search to narrow down.</p>}
        </Card>
      )}

      <Modal open={adding} title="Add a member" onClose={() => setAdding(false)}>
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Field label="First name"><Input required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field><Field label="Last name"><Input required value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gender"><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Not set</option><option value="male">Male</option><option value="female">Female</option></Select></Field>
            <Field label="Group"><Select value={f.age_group} onChange={(e) => setF({ ...f, age_group: e.target.value as AgeGroup })}><option value="child">Child</option><option value="youth">Youth</option><option value="adult">Adult</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3"><Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="Date of birth"><Input type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} /></Field></div>
          <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          {err != null && <ErrorBox error={err} />}
          <Button type="submit" loading={busy}>Save member</Button>
        </form>
      </Modal>

      <Modal open={!!invite} title="Invite code" onClose={() => setInvite(null)}>
        {invite && (<div className="space-y-4 text-center">
          <p className="text-sm text-gray-600">Give this code to {invite.name}. It works once and expires in 14 days.</p>
          <div className="rounded-xl bg-brand-50 py-4 text-3xl font-bold tracking-[0.3em] text-brand-900">{invite.code}</div>
          <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white"><MessageCircle className="h-4 w-4" />Share on WhatsApp</a>
        </div>)}
      </Modal>
    </>
  );
}
