import Dexie, { type Table } from 'dexie';
import type { Game, GameEvent, Team } from '../../shared/src/types.ts';
import { uid } from './ids.ts';

export type LocalEvent = GameEvent & { synced: 0 | 1 };
export type LocalGame = Game & { dirty: 0 | 1; cursor?: number };
export interface Blob { id: string; gameId: string; mime: string; data: Blob_; synced: 0 | 1 }
type Blob_ = globalThis.Blob;
/** Scorekeeper's scratch pad: quick captures to be filed into the scoresheet later. Local to this device. */
export interface ScratchItem {
  id: string; gameId: string; kind: 'text' | 'voice' | 'draw';
  text?: string; blob?: Blob_; period: number; clock: number; created: number;
}
export interface Secret { gameId: string; pin: string }
export interface Kv { key: string; value: unknown }

class AppDb extends Dexie {
  games!: Table<LocalGame, string>;
  events!: Table<LocalEvent, string>;
  teams!: Table<Team, string>;
  blobs!: Table<Blob, string>;
  secrets!: Table<Secret, string>;
  scratch!: Table<ScratchItem, string>;
  kv!: Table<Kv, string>;
  constructor() {
    super('hockeyscoresheet');
    this.version(1).stores({
      games: 'id, updated, dirty, viewToken',
      events: 'id, gameId, synced, [gameId+wall]',
      teams: 'id, updated',
      blobs: 'id, gameId, synced',
      secrets: 'gameId',
      kv: 'key',
    });
    this.version(2).stores({ scratch: 'id, gameId, created' });
  }
}

export const db = new AppDb();

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const r = await db.kv.get(key);
  return (r ? (r.value as T) : fallback);
}
export const kvSet = (key: string, value: unknown) => db.kv.put({ key, value });

let devId: string | undefined;
export async function deviceId(): Promise<string> {
  if (devId) return devId;
  devId = await kvGet<string>('deviceId', '');
  if (!devId) { devId = uid(); await kvSet('deviceId', devId); }
  return devId;
}

export async function saveGame(g: Game) {
  await db.games.put({ ...g, updated: Date.now(), dirty: 1 } as LocalGame);
  kick();
}

export async function addEvent(e: GameEvent) {
  await db.events.add({ ...e, synced: 0 }); // write-ahead: persisted before UI reflects it
  kick();
}

export async function addEvents(es: GameEvent[]) {
  await db.events.bulkAdd(es.map((e) => ({ ...e, synced: 0 as const })));
  kick();
}

// late-bound to avoid circular import
let kickFn: () => void = () => {};
export const setKick = (f: () => void) => { kickFn = f; };
const kick = () => kickFn();

/** Everything on this device, for backup. */
export async function exportAll() {
  const [games, events, teams, secrets] = await Promise.all([db.games.toArray(), db.events.toArray(), db.teams.toArray(), db.secrets.toArray()]);
  return { app: 'hockeyscoresheet', version: 1, exported: new Date().toISOString(), games, events: events.map(({ synced: _s, ...e }) => e), teams, secrets };
}

export async function importAll(data: any) {
  if (data?.app !== 'hockeyscoresheet') throw new Error('Not a scoresheet backup file');
  await db.transaction('rw', db.games, db.events, db.teams, db.secrets, async () => {
    for (const g of data.games ?? []) {
      const cur = await db.games.get(g.id);
      if (!cur || g.updated > cur.updated) await db.games.put({ ...g, dirty: 1 });
    }
    for (const t of data.teams ?? []) {
      const cur = await db.teams.get(t.id);
      if (!cur || t.updated > cur.updated) await db.teams.put(t);
    }
    for (const s of data.secrets ?? []) if (!(await db.secrets.get(s.gameId))) await db.secrets.put(s);
    const have = new Set(await db.events.toCollection().primaryKeys());
    await db.events.bulkAdd((data.events ?? []).filter((e: GameEvent) => !have.has(e.id)).map((e: GameEvent) => ({ ...e, synced: 0 })));
  });
  kick();
}

export async function deleteGame(id: string) {
  const g = await db.games.get(id);
  if (!g) return;
  // soft-delete: tombstone syncs to the server so the viewer link stops working; events are kept for 30d restore
  await db.games.put({ ...g, deleted: true, updated: Date.now(), dirty: 1 });
  kick();
}

export async function restoreGame(id: string) {
  const g = await db.games.get(id);
  if (g) { await db.games.put({ ...g, deleted: false, updated: Date.now(), dirty: 1 }); kick(); }
}
