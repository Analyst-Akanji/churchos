import { Link } from 'react-router-dom';
import { Cloud, CloudOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { useSyncState } from '@/lib/offline/outbox';

export function SyncBadge() {
  const s = useSyncState();
  let icon = <Cloud className="h-4 w-4" />; let text = 'Synced'; let cls = 'bg-emerald-50 text-emerald-800';
  if (s.failed) { icon = <AlertTriangle className="h-4 w-4" />; text = `${s.failed} need attention`; cls = 'bg-red-50 text-red-800'; }
  else if (!s.online) { icon = <CloudOff className="h-4 w-4" />; text = s.pending ? `Offline, ${s.pending} saved on phone` : 'Offline'; cls = 'bg-amber-50 text-amber-800'; }
  else if (s.syncing) { icon = <RefreshCw className="h-4 w-4 animate-spin" />; text = 'Syncing'; cls = 'bg-sky-50 text-sky-800'; }
  else if (s.pending) { icon = <RefreshCw className="h-4 w-4" />; text = `${s.pending} waiting to sync`; cls = 'bg-sky-50 text-sky-800'; }
  return (
    <Link to="/app/sync" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cls}`} title="Sync status">
      {icon}<span className="hidden sm:inline">{text}</span>
    </Link>
  );
}
