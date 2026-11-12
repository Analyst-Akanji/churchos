import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MessageCircle } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { inviteCode } from '@/lib/uid';
import { fmtDate } from '@/lib/format';
import { activationMessage, ageFrom, last10, toWaNumber, waLink } from '@/lib/whatsapp';
import type { RegistrationRequest } from '@/lib/registrations';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Tabs } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useMembersLite } from '../sundayschool/hooks';
import { useRemovedMembers } from '@/lib/removed';
import type { AgeGroup } from '@/types/db';

type Tab = 'pending' | 'approved' | 'rejected';
interface SendInfo { firstName: string; whatsapp: string | null; code: string }
interface MatchRow { request_id: string; member_id: string; first_name: string; last_name: string; age_group: string; date_of_birth: string | null; phone: string | null; class_name: string | null; score: number; reasons: string[] }

export default function Registrations() {
  const { assembly } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const members = useMembersLite();
  const removedList = useRemovedMembers();
  const [tab, setTab] = useState<Tab>('pending');
  const [review, setReview] = useState<RegistrationRequest | null>(null);
  const [form, setForm] = useState({ mode: 'new' as 'new' | 'link', memberId: '', age_group: 'adult' as AgeGroup, gender: '', whatsapp: '' });
  const [send, setSend] = useState<SendInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const reqs = useQuery({
    queryKey: ['registrations', assembly?.id], enabled: !!assembly,
    queryFn: () => q<RegistrationRequest[]>(supabase.from('registration_requests').select('*').eq('assembly_id', assembly!.id).order('created_at', { ascending: false }).limit(300)),
  });
  // Possible existing records (for example a child a class teacher added earlier), scored by the database.
  const matches = useQuery({
    queryKey: ['registration-matches', assembly?.id], enabled: !!assembly,
    queryFn: () => q<MatchRow[]>(supabase.rpc('registration_match_suggestions', { p_assembly: assembly!.id })),
  });
  const matchMap = new Map<string, MatchRow[]>();
  for (const m of matches.data ?? []) { const a = matchMap.get(m.request_id) ?? []; a.push(m); matchMap.set(m.request_id, a); }
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['registration-matches'] }); void qc.invalidateQueries({ queryKey: ['registrations'] }); void qc.invalidateQueries({ queryKey: ['pending-registrations'] }); void qc.invalidateQueries({ queryKey: ['members-lite'] }); };
  const list = (reqs.data ?? []).filter((r) => r.status === tab);
  const counts = { pending: (reqs.data ?? []).filter((r) => r.status === 'pending').length };
  const byId = new Map((members.data ?? []).map((m) => [m.id, m]));

  function matchesFor(r: RegistrationRequest) { return matchMap.get(r.id) ?? []; }
  function removedMatch(r: RegistrationRequest) {
    const name = `${r.first_name} ${r.last_name}`.toLowerCase(); const phone = last10(r.whatsapp);
    return (removedList.data ?? []).find((m) => `${m.first_name} ${m.last_name}`.toLowerCase() === name || (phone.length === 10 && (last10(m.whatsapp) === phone || last10(m.phone) === phone)));
  }
  function openReview(r: RegistrationRequest) {
    const age = ageFrom(r.date_of_birth);
    const top = matchesFor(r)[0];
    const strong = !!top && top.score >= 70; // only pre-select a link when several details agree
    setForm({ mode: strong ? 'link' : 'new', memberId: strong ? top.member_id : '', age_group: age !== null && age < 13 ? 'child' : age !== null && age < 20 ? 'youth' : 'adult', gender: r.gender ?? '', whatsapp: r.whatsapp ?? '' });
    setReview(r);
  }
  async function approve() {
    if (!review) return;
    if (form.mode === 'link' && !form.memberId) { toast.err('Choose the existing member to link, or switch to "Add as new member".'); return; }
    setBusy(true);
    const code = inviteCode();
    const { error } = await supabase.rpc('approve_registration', {
      p_request: review.id, p_code: code, p_member: form.mode === 'link' ? form.memberId : null,
      p_age_group: form.age_group, p_gender: form.gender || null, p_whatsapp: form.whatsapp || null,
    });
    setBusy(false);
    if (error) { toast.err(error.message); return; }
    setSend({ firstName: review.first_name, whatsapp: form.whatsapp || review.whatsapp, code });
    setReview(null); refresh();
  }
  async function reject(r: RegistrationRequest) {
    const note = prompt(`Reject ${r.first_name} ${r.last_name}'s registration? Optionally add a reason (only the office sees it):`);
    if (note === null) return;
    const { error } = await supabase.rpc('reject_registration', { p_request: r.id, p_note: note });
    if (error) toast.err(error.message); else { toast.ok('Registration rejected'); refresh(); }
  }
  async function resend(r: RegistrationRequest) {
    const code = inviteCode();
    const { error } = await supabase.rpc('reissue_registration_code', { p_request: r.id, p_code: code });
    if (error) { toast.err(error.message); return; }
    const m = r.member_id ? byId.get(r.member_id) : undefined;
    setSend({ firstName: r.first_name, whatsapp: m?.whatsapp ?? r.whatsapp, code });
  }

  const msg = send ? activationMessage(send.firstName, assembly?.name ?? 'the church', send.code, window.location.origin) : '';
  const num = toWaNumber(send?.whatsapp);
  const dup = review ? matchesFor(review) : [];

  return (
    <>
      <PageHeader title="Registrations" subtitle="People who signed up on the website. Approve them to create their member record and send an activation code on WhatsApp." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'pending', label: `Waiting (${counts.pending})` }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }]} />

      {reqs.isLoading ? <Spinner /> : list.length === 0 ? <Empty title={tab === 'pending' ? 'No registrations waiting' : 'Nothing here'} hint={tab === 'pending' ? 'New sign-ups appear here automatically.' : undefined} /> : (
        <div className="space-y-3">
          {list.map((r) => {
            const m = r.member_id ? byId.get(r.member_id) : undefined;
            const age = ageFrom(r.date_of_birth);
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-brand-900">{r.first_name} {r.last_name}</div>
                    <div className="text-sm text-gray-600">{r.email}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span>WhatsApp: {r.whatsapp ?? 'not given'}</span>
                      <span>Born: {r.date_of_birth ? `${fmtDate(r.date_of_birth)}${age !== null ? ` (${age})` : ''}` : 'not given'}</span>
                      <span className="capitalize">Gender: {r.gender ?? 'not given'}</span>
                      <span>Signed up {fmtDate(r.created_at)}</span>
                    </div>
                    {tab === 'pending' && removedMatch(r) && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900"><strong>Matches a removed member:</strong> {removedMatch(r)!.first_name} {removedMatch(r)!.last_name}{removedMatch(r)!.removal_reason ? ` (${removedMatch(r)!.removal_reason})` : ''}. Check before approving.</div>}
                    {tab === 'pending' && matchesFor(r).length > 0 && <div className="mt-2"><Badge tone="amber">Possible existing record: {matchesFor(r)[0].first_name} {matchesFor(r)[0].last_name}{matchesFor(r)[0].class_name ? ` (${matchesFor(r)[0].class_name})` : ''}</Badge></div>}
                    {r.status === 'rejected' && r.note && <div className="mt-2 text-sm text-gray-500">Reason: {r.note}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === 'pending' && <><Button size="sm" onClick={() => openReview(r)}>Review and approve</Button><Button size="sm" variant="ghost" onClick={() => void reject(r)}>Reject</Button></>}
                    {r.status === 'approved' && (m?.user_id ? <Badge tone="green">Activated</Badge> : <><Badge tone="amber">Waiting for code</Badge><Button size="sm" variant="secondary" onClick={() => void resend(r)}>Send code again</Button></>)}
                    {r.status === 'rejected' && <Badge tone="red">Rejected</Badge>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!review} title={`Approve ${review?.first_name ?? ''} ${review?.last_name ?? ''}`} onClose={() => setReview(null)}>
        {review && (
          <div className="space-y-4">
            {dup.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <div className="mb-2 font-medium">This person may already be in the member list, for example added earlier by a class teacher. Linking keeps their class and records.</div>
                <div className="flex flex-col gap-2">
                  {dup.map((d) => (
                    <label key={d.member_id} className="flex items-start gap-2 rounded-md bg-white/60 p-2">
                      <input type="radio" className="mt-1" checked={form.mode === 'link' && form.memberId === d.member_id} onChange={() => setForm({ ...form, mode: 'link', memberId: d.member_id })} />
                      <span>
                        <span className="font-medium">Link to {d.first_name} {d.last_name}</span> <Badge>{d.age_group}</Badge>
                        <span className="block text-xs">{[d.class_name ? `In ${d.class_name}` : null, d.date_of_birth ? `Born ${fmtDate(d.date_of_birth)}` : null, d.phone].filter(Boolean).join(' · ')}</span>
                        <span className="block text-xs text-amber-800">{d.reasons.join(' · ')}</span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 p-2"><input type="radio" checked={form.mode === 'new'} onChange={() => setForm({ ...form, mode: 'new', memberId: '' })} />Add as a new member</label>
                </div>
              </div>
            )}
            <Field label="WhatsApp number" hint={toWaNumber(form.whatsapp) ? 'The code will be sent to this number.' : 'This does not look like a valid number. Correct it before sending.'}><Input type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Group"><Select value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value as AgeGroup })}><option value="adult">Adult</option><option value="youth">Youth</option><option value="child">Child</option></Select></Field>
              <Field label="Gender" hint={review?.gender ? 'Chosen by the person at signup. Change only if it is wrong.' : undefined}><Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Not set</option><option value="male">Male</option><option value="female">Female</option></Select></Field>
            </div>
            <p className="text-xs text-gray-500">Approving creates (or links) the member record and prepares an activation code that only this person's account can use.</p>
            <div className="flex gap-2"><Button onClick={() => void approve()} loading={busy}>Approve and get code</Button><Button variant="secondary" onClick={() => setReview(null)}>Cancel</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!send} title="Send the activation code" onClose={() => setSend(null)}>
        {send && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-gray-600">Approved. Send {send.firstName} this code from your WhatsApp.</p>
            <div className="rounded-xl bg-brand-50 py-4 text-3xl font-bold tracking-[0.3em] text-brand-900">{send.code}</div>
            <a href={waLink(num, msg)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle className="h-4 w-4" />{num ? `Send on WhatsApp to +${num}` : 'Open WhatsApp'}</a>
            {!num && <p className="text-xs text-amber-700">No valid WhatsApp number on file. WhatsApp will ask you to choose the contact.</p>}
            <div><Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(send.code); toast.ok('Code copied'); }}><Copy className="h-4 w-4" />Copy code only</Button></div>
            <p className="text-xs text-gray-500">This opens WhatsApp on your phone with the message ready. Press send there. The code works once and expires in 14 days. If you close this window you can use "Send code again".</p>
          </div>
        )}
      </Modal>
    </>
  );
}
