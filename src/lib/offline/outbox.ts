import { useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { uid } from '../uid';
import { db, type OutboxItem } from './db';

export interface SyncState {
  pending: number;
  failed: number;
  syncing: boolean;
  online: boolean;
  lastSyncedAt: number | null;
}

let state: SyncState = {
  pending: 0, failed: 0, syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSyncedAt: null,
};
const listeners = new Set<() => void>();
const flushedListeners = new Set<() => void>();
let currentUserId: string | null = null;
let started = false;
let flushing = false;

function setState(p: Partial<SyncState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
async function refreshCounts() {
  const all = (await (await db()).getAll('outbox')).filter((i) => i.userId === currentUserId);
  setState({ pending: all.filter((i) => i.status === 'pending').length, failed: all.filter((i) => i.status === 'failed').length });
}

export const useSyncState = (): SyncState =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

/** Called after a flush that actually sent something, so screens can refetch. */
export function onFlushed(cb: () => void) { flushedListeners.add(cb); return () => { flushedListeners.delete(cb); }; }

export interface EnqueueInput {
  key: string;
  label: string;
  op?: 'upsert' | 'update';
  table: string;
  payload: Record<string, unknown>;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  match?: Record<string, unknown>;
}

/** Save a write locally first. It is sent now if online, otherwise as soon as the network returns. */
export async function enqueue(input: EnqueueInput): Promise<void> {
  if (!currentUserId) throw new Error('Not signed in');
  const d = await db();
  const existing = (await d.getAllFromIndex('outbox', 'by-key', input.key)).find((e) => e.userId === currentUserId);
  const item: OutboxItem = existing
    ? { ...existing, ...input, op: input.op ?? 'upsert', status: 'pending', error: undefined, attempts: 0 }
    : { ...input, id: uid(), userId: currentUserId, createdAt: Date.now(), attempts: 0, status: 'pending', op: input.op ?? 'upsert' };
  await d.put('outbox', item);
  await refreshCounts();
  void flush();
}

function isTransient(message: string): boolean {
  return !navigator.onLine ||
    /failed to fetch|networkerror|network request failed|load failed|timeout|fetch/i.test(message) ||
    /jwt expired/i.test(message) || /\b5\d\d\b/.test(message);
}

async function send(it: OutboxItem): Promise<{ error: { message: string } | null }> {
  const t = supabase.from(it.table);
  if (it.op === 'update') return await t.update(it.payload).match(it.match ?? {});
  return await t.upsert(it.payload, { onConflict: it.onConflict, ignoreDuplicates: it.ignoreDuplicates });
}

export async function flush(): Promise<void> {
  if (flushing || !currentUserId) return;
  if (!navigator.onLine) { setState({ online: false }); return; }
  flushing = true;
  setState({ syncing: true, online: true });
  let sent = 0;
  try {
    const d = await db();
    const items = (await d.getAll('outbox'))
      .filter((i) => i.userId === currentUserId && i.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const it of items) {
      let error: { message: string } | null;
      try { ({ error } = await send(it)); } catch (e) { error = { message: String(e) }; }
      if (!error) { await d.delete('outbox', it.id); sent++; continue; }
      if (isTransient(error.message)) { await d.put('outbox', { ...it, attempts: it.attempts + 1 }); break; }
      await d.put('outbox', { ...it, status: 'failed', attempts: it.attempts + 1, error: error.message });
    }
    if (sent) setState({ lastSyncedAt: Date.now() });
  } finally {
    flushing = false;
    setState({ syncing: false });
    await refreshCounts();
    if (sent) flushedListeners.forEach((l) => l());
  }
}

export async function listItems(): Promise<OutboxItem[]> {
  return (await (await db()).getAll('outbox')).filter((i) => i.userId === currentUserId).sort((a, b) => a.createdAt - b.createdAt);
}
/** Queued (not yet synced) writes for one table, so screens can show them after a reload while offline. */
export async function pendingFor(table: string): Promise<OutboxItem[]> {
  return (await listItems()).filter((i) => i.table === table);
}
export async function retryItem(id: string) {
  const d = await db(); const it = await d.get('outbox', id);
  if (it) await d.put('outbox', { ...it, status: 'pending', error: undefined });
  await refreshCounts(); void flush();
}
export async function discardItem(id: string) { await (await db()).delete('outbox', id); await refreshCounts(); }

/** Bind the outbox to the signed-in user and start background syncing. */
export function startOutbox(userId: string | null) {
  currentUserId = userId;
  void refreshCounts();
  if (!userId) return;
  if (!started) {
    started = true;
    window.addEventListener('online', () => { setState({ online: true }); void flush(); });
    window.addEventListener('offline', () => setState({ online: false }));
    setInterval(() => { void flush(); }, 20000);
  }
  void flush();
}
