import { useQuery, useQueryClient } from '@tanstack/react-query';
import { discardItem, flush, listItems, retryItem, useSyncState } from '@/lib/offline/outbox';
import { fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, Empty, PageHeader } from '@/components/ui';

export default function SyncPage() {
  const s = useSyncState();
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ['outbox', s.pending, s.failed, s.syncing], queryFn: listItems });
  const refresh = () => qc.invalidateQueries({ queryKey: ['outbox'] });
  return (
    <>
      <PageHeader title="Sync status" subtitle="Everything you enter is saved on this phone first, then sent when you are online."
        actions={<Button onClick={() => void flush()} loading={s.syncing}>Sync now</Button>} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Badge tone={s.online ? 'green' : 'amber'}>{s.online ? 'Online' : 'Offline'}</Badge>
        <Badge tone="blue">{s.pending} waiting</Badge>
        {s.failed > 0 && <Badge tone="red">{s.failed} need attention</Badge>}
        {s.lastSyncedAt && <Badge>Last sync {fmtDateTime(new Date(s.lastSyncedAt))}</Badge>}
      </div>
      {(items.data ?? []).length === 0 ? <Empty title="All caught up" hint="Nothing is waiting to be sent." /> : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {items.data!.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div><div className="font-medium">{i.label}</div><div className="text-xs text-gray-500">{fmtDateTime(new Date(i.createdAt))}</div>
                  {i.error && <div className="mt-1 text-xs text-red-700">{i.error}</div>}</div>
                <div className="flex items-center gap-2">
                  <Badge tone={i.status === 'failed' ? 'red' : 'blue'}>{i.status === 'failed' ? 'Needs attention' : 'Waiting'}</Badge>
                  {i.status === 'failed' && <Button size="sm" variant="secondary" onClick={async () => { await retryItem(i.id); void refresh(); }}>Retry</Button>}
                  {i.status === 'failed' && <Button size="sm" variant="ghost" onClick={async () => { if (confirm('Discard this change? It will not be saved to the server.')) { await discardItem(i.id); void refresh(); } }}>Discard</Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-xs text-gray-500">A change "needs attention" when the server refused it, for example because the session was locked by the superintendent. Ask them to reopen it, then press Retry.</p>
    </>
  );
}
