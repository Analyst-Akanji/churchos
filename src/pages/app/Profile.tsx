import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { Button, Card, Empty, ErrorBox, Field, Input, PageHeader } from '@/components/ui';
import { useToast } from '@/components/toast';

export default function Profile() {
  const { member, user, reload, signOut } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ phone: '', email: '', address: '', date_of_birth: '', wedding_anniversary: '' });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ a: '', b: '' }); const [pwErr, setPwErr] = useState<unknown>(null); const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => { if (member) setF({ phone: member.phone ?? '', email: member.email ?? '', address: member.address ?? '', date_of_birth: member.date_of_birth ?? '', wedding_anniversary: member.wedding_anniversary ?? '' }); }, [member]);

  const kids = useQuery({
    queryKey: ['my-children', member?.id], enabled: !!member,
    queryFn: async () => {
      const links = await q<{ child_member_id: string }[]>(supabase.from('member_guardians').select('child_member_id').eq('guardian_member_id', member!.id));
      if (!links.length) return [];
      return q<{ id: string; first_name: string; last_name: string }[]>(supabase.from('members').select('id, first_name, last_name').in('id', links.map((l) => l.child_member_id)));
    },
  });

  async function save(e: FormEvent) {
    e.preventDefault(); if (!member) return; setBusy(true);
    const { error } = await supabase.from('members').update({ phone: f.phone || null, email: f.email || null, address: f.address || null, date_of_birth: f.date_of_birth || null, wedding_anniversary: f.wedding_anniversary || null }).eq('id', member.id);
    setBusy(false);
    if (error) toast.err(error.message); else { toast.ok('Saved'); await reload(); }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault(); setPwErr(null);
    if (pw.a.length < 8) { setPwErr(new Error('Use at least 8 characters.')); return; }
    if (pw.a !== pw.b) { setPwErr(new Error('The two passwords do not match.')); return; }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setPwBusy(false);
    if (error) setPwErr(new Error(error.message)); else { toast.ok('Password changed'); setPw({ a: '', b: '' }); }
  }

  if (!member) return <Empty title="Link your account first" hint="Go to Home and enter your invite code." />;
  return (
    <>
      <PageHeader title="My profile" subtitle={`${member.first_name} ${member.last_name}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Contact details">
          <form onSubmit={save} className="space-y-3">
            <Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Home address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Birthday"><Input type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} /></Field>
              <Field label="Wedding anniversary"><Input type="date" value={f.wedding_anniversary} onChange={(e) => setF({ ...f, wedding_anniversary: e.target.value })} /></Field>
            </div>
            <Button type="submit" loading={busy}>Save changes</Button>
            <p className="text-xs text-gray-500">To correct your name or group, please ask the church office.</p>
          </form>
        </Card>

        <div className="space-y-4">
          <Card title="My children">
            {(kids.data ?? []).length === 0 ? <p className="text-sm text-gray-500">No children are linked to your profile. If you have children in Sunday school, ask the church office to link them so you can see their progress.</p> : (
              <ul className="divide-y divide-gray-100 text-sm">{kids.data!.map((k) => <li key={k.id} className="py-2.5 font-medium">{k.first_name} {k.last_name}</li>)}</ul>
            )}
          </Card>
          <Card title="Sign-in">
            <p className="mb-3 text-sm text-gray-600">Signed in as {user?.email}</p>
            <form onSubmit={changePassword} className="space-y-3">
              <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
              <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
              {pwErr != null && <ErrorBox error={pwErr} />}
              <div className="flex gap-2"><Button type="submit" variant="secondary" loading={pwBusy}>Change password</Button><Button type="button" variant="ghost" onClick={async () => { await signOut(); nav('/'); }}>Sign out</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
