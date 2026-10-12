import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface OutboxItem {
  id: string;
  userId: string;
  /** Same key = same logical record: a newer write replaces the older queued one. */
  key: string;
  label: string;
  op: 'upsert' | 'update';
  table: string;
  payload: Record<string, unknown>;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  match?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'failed';
  error?: string;
}

interface Schema extends DBSchema {
  outbox: { key: string; value: OutboxItem; indexes: { 'by-key': string } };
  cache: { key: string; value: { key: string; value: unknown; savedAt: number } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function db() {
  dbp ??= openDB<Schema>('churchos', 1, {
    upgrade(d) {
      const o = d.createObjectStore('outbox', { keyPath: 'id' });
      o.createIndex('by-key', 'key');
      d.createObjectStore('cache', { keyPath: 'key' });
    },
  });
  return dbp;
}
