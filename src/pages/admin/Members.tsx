import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Trash2, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { inviteCode } from '@/lib/uid';
import { fmtDate, fullName } from '@/lib/format';
import { activationMessage, toWaNumber, waLink } from '@/lib/whatsapp';
import { useMemberPositions, usePositions } from '@/lib/positions';
import { useRemovedMembers } from '@/lib/removed';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useMembersLite } from '../sundayschool/hooks';
import type { AgeGroup, MemberInvite } from '@/types/db';

interface GLink { id: string; child_member_id: string }
type Lite = NonNullable<ReturnType<typeof useMembersLite>['data']>[number];

export default function Members() {
  const { assembly, isOffice, isAdmin, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const members = useMembersLite();
  const positions = usePositions();
  const memberPositions = useMemberPositions();
  const removed = useRemovedMembers();
  const [view, setView] = useState<'active' | 'removed'>('active');
  const [removeFor, setRemoveFor] = useState<Lite | null>(null); const [reason, setReason] = useState('');
  const [term, setTerm] = useState(''); const [posFilter, setPosFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ first_name: '', last_name: '', gender: '', age_group: 'adult' as AgeGroup, phone: '', whatsapp: '', email: '', date_of_birth: '' });
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ m: Lite; code: string } | null>(null);
  const [parent, setParent] = useState<Lite | null>(null); const [childPick, setChildPick] = useState('');
  const [posFor, setPosFor] = useState<Lite | null>(null); const [posPick, setPosPick] = useState(''); const [newPos, setNewPos] = useState('');

  const invites = useQuery({
    queryKey: ['invites', assembly?.id], enabled: !!assembly && isOffice,
    queryFn: () => q<MemberInvite[]>(supabase.from('member_invites').select('*').eq('assembly_id', assembly!.id).is('claimed_at', null).gt('expires_at', new Date().toISOString())),
  });
  const links = useQuery({
    queryKey: ['guardian-links', parent?.id], enabled: !!parent,
    queryFn: () => q<GLink[]>(supabase.from('member_guardians').select('id, child_member_id').eq('guardian_member_id', parent!.id)),
  });

  const codeFor = new Map((invites.data ?? []).map((i) => [i.member_id, i.code]));
  const posName = new Map((positions.data ?? []).map((p) => [p.id, p.name]));
  const heldBy = new Map<string, { id: string; position_id: string }[]>();
  (memberPositions.data ?? []).forEach((mp) => heldBy.set(mp.member_id, [...(heldBy.get(mp.member_id) ?? []), { id: mp.id, position_id: mp.position_id }]));

  const list = (members.data ?? []).filter((m) =>
    fullName(m).toLowerCase().includes(term.toLowerCase()) && (!posFilter || (heldBy.get(m.id) ?? []).some((h) => h.position_id === posFilter)));

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.from('members').insert({
      assembly_id: assembly!.id, first_name: f.first_name.trim(), last_name: f.last_name.trim(), gender: f.gender || null, age_group: f.age_group,
      phone: f.phone.trim() || null, whatsapp: f.whatsapp.trim() || null, email: f.email.trim() || null, date_of_birth: f.date_of_birth || null,
    });
    setBusy(false);
    if (error) { setErr(new Error(error.message)); return; }
    toast.ok('Member added'); setAdding(false); setF({ first_name: '', last_name: '', gender: '', age_group: 'adult', phone: '', whatsapp: '', email: '', date_of_birth: '' });
    void qc.invalidateQueries({ queryKey: ['members-lite'] });
  }
  async function makeInvite(m: Lite) {
    const code = inviteCode();
    const { error } = await supabase.from('member_invites').insert({ assembly_id: assembly!.id, member_id: m.id, code, created_by: user!.id });
    if (error) { toast.err(error.message); return; }
    setInvite({ m, code }); void qc.invalidateQueries({ queryKey: ['invites'] });
  }
  async function linkChild() {
    if (!parent || !childPick) return;
    const { error } = await supabase.from('member_guardians').insert({ assembly_id: assembly!.id, guardian_member_id: parent.id, child_member_id: childPick, relationship: 'parent' });
    if (error) toast.err(error.message.includes('duplicate') ? 'Already linked.' : error.message); else { setChildPick(''); void qc.invalidateQueries({ queryKey: ['guardian-links'] }); }
  }
  async function unlink(id: string) {
    const { error } = await supabase.from('member_guardians').delete().eq('id', id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['guardian-links'] });
  }
  async function givePosition() {
    if (!posFor || !posPick) return;
    const { error } = await supabase.from('member_positions').insert({ assembly_id: assembly!.id, member_id: posFor.id, position_id: posPick });
    if (error) toast.err(error.message.includes('duplicate') ? 'Already has that position.' : error.message); else { setPosPick(''); void qc.invalidateQueries({ queryKey: ['member-positions'] }); }
  }
  async function takePosition(id: string) {
    const { error } = await supabase.from('member_positions').delete().eq('id', id);
    if (error) toast.err(error.message); else void qc.invalidateQueries({ queryKey: ['member-positions'] });
  }
  async function createPosition() {
    if (!newPos.trim()) return;
    const { error } = await supabase.from('church_positions').insert({ assembly_id: assembly!.id, name: newPos.trim(), sort_order: (positions.data?.length ?? 0) + 1 });
    if (error) toast.err(error.message.includes('duplicate') ? 'That position already exists.' : error.message); else { setNewPos(''); void qc.invalidateQueries({ queryKey: ['positions'] }); }
  }

  const refreshPeople = () => { void qc.invalidateQueries({ queryKey: ['members-lite'] }); void qc.invalidateQueries({ queryKey: ['removed-members'] }); void qc.invalidateQueries({ queryKey: ['member-positions'] }); void qc.invalidateQueries({ queryKey: ['invites'] }); };
  async function removeMember() {
    if (!removeFor) return;
    if (!reason.trim()) { toast.err('Please give a reason. It is kept in the record.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('remove_member', { p_member: removeFor.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { toast.err(error.message); return; }
    toast.ok(`${fullName(removeFor)} has been removed`); setRemoveFor(null); refreshPeople();
  }
  async function restore(id: string, name: string) {
    if (!confirm(`Restore ${name}? They will be an ordinary member again. Roles and positions must be given again.`)) return;
    const { error } = await supabase.rpc('restore_member', { p_member: id });
    if (error) toast.err(error.message); else { toast.ok('Member restored'); refreshPeople(); }
  }
  async function deleteForever(id: string, name: string) {
    if (!confirm(`Permanently delete ${name}? This cannot be undone. It is only allowed for records with no attendance, Sunday school or giving history.`)) return;
    const { error } = await supabase.rpc('delete_member_permanently', { p_member: id });
    if (error) toast.err(error.message); else { toast.ok('Deleted permanently'); refreshPeople(); }
  }

  const inviteNum = invite ? toWaNumber(invite.m.whatsapp ?? invite.m.phone) : null;
  const inviteMsg = invite ? activationMessage(invite.m.first_name, assembly?.name ?? 'the church', invite.code, window.location.origin) : '';

  return (
    <>
      <PageHeader title="Members" subtitle={`${members.data?.length ?? 0} people`} actions={isOffice ? <>{(removed.data ?? []).length > 0 || view === 'removed' ? <Button variant="secondary" onClick={() => setView(view === 'removed' ? 'active' : 'removed')}>{view === 'removed' ? 'Back to members' : `Removed (${(removed.data ?? []).length})`}</Button> : null}<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add member</Button></> : undefined} />
      <div className="mb-4 flex flex-wrap gap-3">
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name" className="max-w-xs" />
        <Select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} className="max-w-[12rem]"><option value="">All positions</option>{(positions.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      </div>
      {view === 'removed' ? (
        <Card title="Removed members">
          <p className="mb-3 text-sm text-gray-600">These people no longer have any access. Their past attendance and records are kept so history stays correct.</p>
          {(removed.data ?? []).length === 0 ? <p className="text-sm text-gray-500">Nobody has been removed.</p> : (
            <ul className="divide-y divide-gray-100">
              {removed.data!.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0"><div className="font-medium">{r.first_name} {r.last_name}</div><div className="text-sm text-gray-600">Removed {r.removed_at ? fmtDate(r.removed_at) : ''}{r.removal_reason ? ` · ${r.removal_reason}` : ''}</div></div>
                  {isAdmin && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => void restore(r.id, `${r.first_name} ${r.last_name}`)}>Restore</Button><Button size="sm" variant="ghost" onClick={() => void deleteForever(r.id, `${r.first_name} ${r.last_name}`)}>Delete permanently</Button></div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : members.isLoading ? <Spinner /> : (
        <Card>
          <Table head={['Name', 'Group', 'WhatsApp / phone', 'Login', '']}>
            {list.slice(0, 200).map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{fullName(m)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{(heldBy.get(m.id) ?? []).map((h) => <Badge key={h.id} tone="purple">{posName.get(h.position_id) ?? 'Position'}</Badge>)}</div>
                </td>
                <td className="px-3 py-2.5 capitalize">{m.age_group}</td>
                <td className="px-3 py-2.5 text-gray-600">{m.whatsapp ?? m.phone ?? ''}</td>
                <td className="px-3 py-2.5">{m.user_id ? <Badge tone="green">Activated</Badge> : codeFor.get(m.id) ? <Badge tone="amber">Code sent</Badge> : <Badge>None</Badge>}</td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2.5 text-right">
                  {isOffice && <Button size="sm" variant="ghost" onClick={() => setPosFor(m)}>Positions</Button>}
                  {isOffice && m.age_group !== 'child' && <Button size="sm" variant="ghost" onClick={() => setParent(m)}>Children</Button>}
                  {isOffice && !m.user_id && m.age_group !== 'child' && <Button size="sm" variant="secondary" onClick={() => void makeInvite(m)}>{codeFor.get(m.id) ? 'New code' : 'Code'}</Button>}
                  {isAdmin && m.user_id !== user?.id && <Button size="sm" variant="ghost" className="text-crimson-500" onClick={() => { setRemoveFor(m); setReason(''); }}>Remove</Button>}
                </td>
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
          <div className="grid grid-cols-2 gap-3"><Field label="WhatsApp"><Input inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field><Field label="Phone (if different)"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Date of birth"><Input type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} /></Field><Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
          {err != null && <ErrorBox error={err} />}
          <Button type="submit" loading={busy}>Save member</Button>
        </form>
      </Modal>

      <Modal open={!!removeFor} title={`Remove ${removeFor ? fullName(removeFor) : ''}?`} onClose={() => setRemoveFor(null)}>
        {removeFor && (<div className="space-y-4">
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
            This takes away all of their access straight away: their login is blocked, their roles, positions, class assignments and any pending activation code are removed, and they are withdrawn from this quarter's classes. Their past attendance, points and records are kept.
          </div>
          <Field label="Reason (kept in the record, visible to the office only)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Acting against the interests of the church" /></Field>
          <p className="text-xs text-gray-500">You can restore them later from the Removed list if this was a mistake.</p>
          <div className="flex gap-2"><Button variant="danger" onClick={() => void removeMember()} loading={busy}>Remove member</Button><Button variant="secondary" onClick={() => setRemoveFor(null)}>Cancel</Button></div>
        </div>)}
      </Modal>

      <Modal open={!!posFor} title={`Positions: ${posFor ? fullName(posFor) : ''}`} onClose={() => setPosFor(null)}>
        {posFor && (<div className="space-y-4">
          <ul className="divide-y divide-gray-100 text-sm">
            {(heldBy.get(posFor.id) ?? []).length === 0 && <li className="py-2 text-gray-500">No position assigned.</li>}
            {(heldBy.get(posFor.id) ?? []).map((h) => <li key={h.id} className="flex items-center justify-between py-2"><span className="font-medium">{posName.get(h.position_id)}</span><button onClick={() => void takePosition(h.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button></li>)}
          </ul>
          <div className="flex gap-2">
            <Select value={posPick} onChange={(e) => setPosPick(e.target.value)}><option value="">Add a position</option>{(positions.data ?? []).filter((p) => !(heldBy.get(posFor.id) ?? []).some((h) => h.position_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Button onClick={() => void givePosition()} disabled={!posPick}>Add</Button>
          </div>
          <div className="border-t border-gray-100 pt-3"><div className="mb-2 text-xs font-medium text-gray-600">Need another position (for example Evangelist or Usher leader)?</div>
            <div className="flex gap-2"><Input value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="New position name" /><Button variant="secondary" onClick={() => void createPosition()} disabled={!newPos.trim()}>Create</Button></div></div>
          <p className="text-xs text-gray-500">Positions identify people in the church. What someone can do in the app is set separately under Roles, and class teachers and secretaries are assigned under Sunday school, Classes.</p>
        </div>)}
      </Modal>

      <Modal open={!!parent} title={`Children of ${parent ? fullName(parent) : ''}`} onClose={() => setParent(null)}>
        <p className="mb-3 text-sm text-gray-600">Linked children appear in this parent's "Sunday school" screen so they can follow progress.</p>
        <ul className="mb-4 divide-y divide-gray-100 text-sm">
          {(links.data ?? []).length === 0 && <li className="py-2 text-gray-500">No children linked yet.</li>}
          {(links.data ?? []).map((l) => { const c = (members.data ?? []).find((x) => x.id === l.child_member_id); return <li key={l.id} className="flex items-center justify-between py-2"><span className="font-medium">{c ? fullName(c) : 'Unknown'}</span><button onClick={() => void unlink(l.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Unlink"><Trash2 className="h-4 w-4" /></button></li>; })}
        </ul>
        <div className="flex gap-2">
          <Select value={childPick} onChange={(e) => setChildPick(e.target.value)}><option value="">Add a child or youth</option>{(members.data ?? []).filter((c) => c.age_group !== 'adult' && c.id !== parent?.id && !(links.data ?? []).some((l) => l.child_member_id === c.id)).map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}</Select>
          <Button onClick={() => void linkChild()} disabled={!childPick}>Link</Button>
        </div>
      </Modal>

      <Modal open={!!invite} title="Activation code" onClose={() => setInvite(null)}>
        {invite && (<div className="space-y-4 text-center">
          <p className="text-sm text-gray-600">Give this code to {invite.m.first_name}. It works once and expires in 14 days.</p>
          <div className="rounded-xl bg-brand-50 py-4 text-3xl font-bold tracking-[0.3em] text-brand-900">{invite.code}</div>
          <a href={waLink(inviteNum, inviteMsg)} target="_blank" rel="noreferrer" className={clsx('inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white')}><MessageCircle className="h-4 w-4" />{inviteNum ? `Send on WhatsApp to +${inviteNum}` : 'Share on WhatsApp'}</a>
        </div>)}
      </Modal>
    </>
  );
}
