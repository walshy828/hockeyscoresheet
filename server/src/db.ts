import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Game, GameEvent } from '../../shared/src/types.ts';

export interface Store {
  db: DatabaseSync;
  dir: string;
  getGame(id: string): { doc: Game; pinHash: string; deleted: boolean } | undefined;
  getByToken(token: string): { doc: Game; deleted: boolean } | undefined;
  putGame(doc: Game, pinHash?: string): void;
  insertEvents(gameId: string, events: GameEvent[], recv: number): GameEvent[];
  events(gameId: string, since?: number): GameEvent[];
  putAudio(id: string, gameId: string, mime: string, data: Buffer): void;
  getAudio(id: string): { mime: string; data: Uint8Array } | undefined;
  backup(): string;
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pin, salt, 32).toString('hex')}`;
}

export function checkPin(pin: string, stored: string): boolean {
  const [s, h] = stored.split(':');
  if (!s || !h) return false;
  const a = scryptSync(String(pin), Buffer.from(s, 'hex'), 32);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function openStore(dir: string): Store {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'scoresheet.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY, view_token TEXT UNIQUE NOT NULL, pin_hash TEXT NOT NULL,
      doc TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL, json TEXT NOT NULL, recv INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_game ON events(game_id, recv);
    CREATE TABLE IF NOT EXISTS audio (
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL
    );
  `);
  const q = {
    game: db.prepare('SELECT doc, pin_hash, deleted FROM games WHERE id = ?'),
    token: db.prepare('SELECT doc, deleted FROM games WHERE view_token = ?'),
    upsert: db.prepare(`INSERT INTO games (id, view_token, pin_hash, doc, deleted, updated) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, deleted = excluded.deleted, updated = excluded.updated`),
    ins: db.prepare('INSERT OR IGNORE INTO events (id, game_id, json, recv) VALUES (?,?,?,?)'),
    events: db.prepare('SELECT json, recv FROM events WHERE game_id = ? AND recv > ? ORDER BY recv, rowid'),
    audioPut: db.prepare('INSERT OR REPLACE INTO audio (id, game_id, mime, data) VALUES (?,?,?,?)'),
    audioGet: db.prepare('SELECT mime, data FROM audio WHERE id = ?'),
  };
  return {
    db, dir,
    getGame(id) {
      const r = q.game.get(id) as any;
      return r && { doc: JSON.parse(r.doc), pinHash: r.pin_hash, deleted: !!r.deleted };
    },
    getByToken(token) {
      const r = q.token.get(token) as any;
      return r && { doc: JSON.parse(r.doc), deleted: !!r.deleted };
    },
    putGame(doc, pinHash) {
      const existing = q.game.get(doc.id) as any;
      q.upsert.run(doc.id, doc.viewToken, pinHash ?? existing.pin_hash, JSON.stringify(doc), doc.deleted ? 1 : 0, doc.updated);
    },
    insertEvents(gameId, events, recv) {
      const fresh: GameEvent[] = [];
      db.exec('BEGIN');
      try {
        for (const e of events) {
          const r = q.ins.run(e.id, gameId, JSON.stringify(e), recv);
          if (Number(r.changes) > 0) fresh.push({ ...e, recv });
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return fresh;
    },
    events(gameId, since = 0) {
      return (q.events.all(gameId, since) as any[]).map((r) => ({ ...JSON.parse(r.json), recv: r.recv }));
    },
    putAudio(id, gameId, mime, data) { q.audioPut.run(id, gameId, mime, data); },
    getAudio(id) { return q.audioGet.get(id) as any; },
    backup() {
      const bdir = join(dir, 'backups');
      mkdirSync(bdir, { recursive: true });
      const name = `scoresheet-${new Date().toISOString().slice(0, 10)}.db`;
      const file = join(bdir, name);
      rmSync(file, { force: true });
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      const files = readdirSync(bdir).filter((f) => f.endsWith('.db')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - 14))) rmSync(join(bdir, f), { force: true });
      return file;
    },
  };
}
