import { useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deviceId, setKick, type LocalEvent } from './db.ts';
import type { Game, GameEvent } from '../../shared/src/types.ts';

export interface SyncStatus { online: boolean; syncing: boolean; pending: number; lastOk: number; error?: string }
let status: SyncStatus = { online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false, pending: 0, lastOk: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<SyncStatus>) => { status = { ...status, ...p }; subs.forEach((f) => f()); };
export const useSyncStatus = (): SyncStatus => {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => status);
  const pending = useLiveQuery(() => pendingCount(), [], 0); // reactive: reflects every local write immediately
  return { ...s, pending };
};

let activeGame: string | undefined;
export const setActiveGame = (id?: string) => { activeGame = id; kick(); };

let timer: ReturnType<typeof setTimeout> | undefined;
let again = false;
let failures = 0;

export function kick() {
  if (timer) return;
  timer = setTimeout(() => { timer = undefined; void syncNow(); }, 300);
}

async function post<T>(url: string, body: unknown, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...init });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function pendingCount() {
  const [e, g, b] = await Promise.all([db.events.where('synced').equals(0).count(), db.games.where('dirty').equals(1).count(), db.blobs.where('synced').equals(0).count()]);
  return e + g + b;
}

export async function syncNow(): Promise<void> {
  if (status.syncing) { again = true; return; }
  set({ syncing: true });
  try {
    // ---- push ----
    const [pendEv, dirty] = await Promise.all([db.events.where('synced').equals(0).limit(1000).toArray(), db.games.where('dirty').equals(1).toArray()]);
    const ids = new Set<string>([...pendEv.map((e) => e.gameId), ...dirty.map((g) => g.id)]);
    const batches: Array<{ gameId: string; pin: string; game?: Game; events: GameEvent[] }> = [];
    const sentEv = new Map<string, LocalEvent[]>();
    const sentGame = new Map<string, number>();
    for (const gameId of ids) {
      const sec = await db.secrets.get(gameId);
      if (!sec) continue;
      const g = dirty.find((x) => x.id === gameId);
      const evs = pendEv.filter((e) => e.gameId === gameId);
      sentEv.set(gameId, evs);
      if (g) { sentGame.set(gameId, g.updated); }
      const { dirty: _d, cursor: _c, ...game } = g ?? ({} as any);
      batches.push({ gameId, pin: sec.pin, game: g ? (game as Game) : undefined, events: evs.map(({ synced: _s, ...e }) => e) });
    }
    if (batches.length) {
      const res = await post<{ results: Array<{ gameId: string; ok: boolean; error?: string }> }>('/api/sync', { deviceId: await deviceId(), batches });
      for (const r of res.results) {
        if (!r.ok) { set({ error: `${r.gameId.slice(0, 6)}: ${r.error}` }); continue; }
        const evs = sentEv.get(r.gameId) ?? [];
        await db.events.bulkUpdate(evs.map((e) => ({ key: e.id, changes: { synced: 1 as const } })));
        const upd = sentGame.get(r.gameId);
        if (upd !== undefined) {
          const cur = await db.games.get(r.gameId);
          if (cur && cur.updated === upd) await db.games.update(r.gameId, { dirty: 0 }); // else edited meanwhile: stay dirty
        }
      }
    }
    // ---- audio blobs ----
    for (const b of await db.blobs.where('synced').equals(0).toArray()) {
      const sec = await db.secrets.get(b.gameId);
      if (!sec) continue;
      const r = await fetch(`/api/audio/${b.id}?game=${encodeURIComponent(b.gameId)}&pin=${encodeURIComponent(sec.pin)}`, { method: 'PUT', headers: { 'Content-Type': b.mime || 'audio/webm' }, body: b.data });
      if (r.ok) await db.blobs.update(b.id, { synced: 1 });
    }
    // ---- pull for the open game (second scorer device / recovery) ----
    if (activeGame) {
      const g = await db.games.get(activeGame);
      if (g && !g.dirty) {
        const r = await fetch(`/api/view/${g.viewToken}?since=${g.cursor ?? 0}`);
        if (r.ok) {
          const j: { game: Game; events: GameEvent[]; now: number } = await r.json();
          const have = new Set(await db.events.where('gameId').equals(g.id).primaryKeys());
          const fresh = j.events.filter((e) => !have.has(e.id));
          if (fresh.length) await db.events.bulkAdd(fresh.map(({ recv: _r, ...e }) => ({ ...e, synced: 1 as const })));
          const maxRecv = j.events.reduce((m, e) => Math.max(m, e.recv ?? 0), g.cursor ?? 0);
          const newer = j.game.updated > g.updated;
          await db.games.update(g.id, { cursor: maxRecv, ...(newer ? { ...j.game } : {}) });
        }
      }
    }
    failures = 0;
    set({ online: true, lastOk: Date.now(), error: undefined });
  } catch (e) {
    failures++;
    set({ online: false, error: (e as Error).message });
    timer = setTimeout(() => { timer = undefined; void syncNow(); }, Math.min(60_000, 2000 * 2 ** Math.min(failures, 5)));
  } finally {
    set({ syncing: false, pending: await pendingCount() });
    if (again) { again = false; kick(); }
  }
}

export function startSync() {
  setKick(kick);
  window.addEventListener('online', () => { set({ online: true }); void syncNow(); });
  window.addEventListener('offline', () => set({ online: false }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  setInterval(() => void syncNow(), 15_000);
  void syncNow();
  // Ask the browser not to evict our database
  void navigator.storage?.persist?.();
}
