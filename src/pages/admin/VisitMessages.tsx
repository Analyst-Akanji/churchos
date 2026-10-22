import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase, q } from '@/lib/supabase';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Button, Card, Empty, PageHeader, Spinner, Table } from '@/components/ui';
import { useToast } from '@/components/toast';

type Status = 'new' | 'read' | 'replied' | 'archived';

type VisitMessage = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  planned_visit: string | null;
  people_count: number | null;
  status: Status;
  created_at: string;
};

const pill: Record<Status, string> = {
  new: 'bg-amber-100 text-amber-800',
  read: 'bg-gray-100 text-gray-700',
  replied: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-500',
};

/** 0803... becomes +234803... for tel: and 234803... for WhatsApp. */
const digits = (p: string) => p.replace(/\D/g, '');
const telHref = (p: string) => `tel:${digits(p).startsWith('0') ? `+234${digits(p).slice(1)}` : `+${digits(p)}`}`;
const waHref = (p: string) => `https://wa.me/${digits(p).startsWith('0') ? `234${digits(p).slice(1)}` : digits(p)}`;

export default function VisitMessages() {
  const a = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<'inbox' | 'archived'>('inbox');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['visit-messages'],
    queryFn: () => q<VisitMessage[]>(supabase.from('visit_messages').select('*').order('created_at', { ascending: false })),
  });

  async function setStatus(id: string, status: Status, quiet = false) {
    const { error } = await supabase
      .from('visit_messages')
      .update({
        status,
        handled_by: status === 'new' ? null : a.user?.id ?? null,
        handled_at: status === 'new' ? null : new Date().toISOString(),
      })
      .eq('id', id);
    if (error) { toast.err(error.message); return; }
    if (!quiet) toast.ok('Updated');
    void qc.invalidateQueries({ queryKey: ['visit-messages'] });
  }

  function toggle(m: VisitMessage) {
    const opening = openId !== m.id;
    setOpenId(opening ? m.id : null);
    if (opening && m.status === 'new') void setStatus(m.id, 'read', true);
  }

  if (list.isLoading) return <Spinner />;

  const all = list.data ?? [];
  const newCount = all.filter((m) => m.status === 'new').length;
  const rows = all.filter((m) => (view === 'archived' ? m.status === 'archived' : m.status !== 'archived'));

  return (
    <>
      <PageHeader
        title="Visit messages"
        subtitle={newCount > 0 ? `${newCount} new` : 'Messages from the Plan a visit form'}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant={view === 'inbox' ? undefined : 'secondary'} onClick={() => setView('inbox')}>Inbox</Button>
            <Button size="sm" variant={view === 'archived' ? undefined : 'secondary'} onClick={() => setView('archived')}>Archived</Button>
          </div>
        }
      />

      <Card>
        {rows.length === 0 ? (
          <Empty title={view === 'inbox' ? 'No messages yet' : 'Nothing archived'} hint="Messages sent from the website will appear here." />
        ) : (
          <Table head={['From', 'Message', 'Visit', 'Received', 'Status']}>
            {rows.map((m) => (
              <Fragment key={m.id}>
                <tr className="cursor-pointer hover:bg-gray-50" onClick={() => toggle(m)}>
                  <td className={`px-3 py-2.5 ${m.status === 'new' ? 'font-semibold' : 'font-medium'}`}>{m.name}</td>
                  <td className="max-w-xs truncate px-3 py-2.5 text-gray-600">{m.message}</td>
                  <td className="px-3 py-2.5 text-gray-600">{m.planned_visit ? fmtDate(m.planned_visit) : ''}</td>
                  <td className="px-3 py-2.5 text-gray-600">{fmtDateTime(m.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${pill[m.status]}`}>{m.status}</span>
                  </td>
                </tr>
                {openId === m.id && (
                  <tr>
                    <td colSpan={5} className="bg-gray-50 px-4 py-4">
                      <p className="whitespace-pre-line text-sm text-gray-800">{m.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                        {m.phone && <a className="font-medium text-brand-700 hover:underline" href={telHref(m.phone)}>Call {m.phone}</a>}
                        {m.phone && <a className="font-medium text-brand-700 hover:underline" href={waHref(m.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
                        {m.email && <a className="font-medium text-brand-700 hover:underline" href={`mailto:${m.email}`}>{m.email}</a>}
                        {m.people_count && <span className="text-gray-600">{m.people_count} {m.people_count === 1 ? 'person' : 'people'}</span>}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {m.status !== 'replied' && <Button size="sm" onClick={() => void setStatus(m.id, 'replied')}>Mark as replied</Button>}
                        {m.status !== 'new' && <Button size="sm" variant="secondary" onClick={() => void setStatus(m.id, 'new')}>Mark as new</Button>}
                        {m.status !== 'archived'
                          ? <Button size="sm" variant="ghost" onClick={() => void setStatus(m.id, 'archived')}>Archive</Button>
                          : <Button size="sm" variant="secondary" onClick={() => void setStatus(m.id, 'read')}>Move to inbox</Button>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
