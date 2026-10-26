import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import type { Game, GameEvent } from '../../shared/src/types.ts';
import { checkPin, hashPin, type Store } from './db.ts';

const EVENT_TYPES = new Set(['clock', 'goal', 'shot', 'faceoff', 'penalty', 'shift', 'goalie', 'timeout', 'note', 'void', 'edit']);

interface Batch { gameId: string; pin: string; game?: Game; events?: GameEvent[] }

type Listener = (msg: { game?: Game; events?: GameEvent[] }) => void;

function validEvent(e: any, gameId: string): e is GameEvent {
  return e && typeof e.id === 'string' && e.id.length > 8 && e.id.length < 80 && e.gameId === gameId
    && EVENT_TYPES.has(e.type) && Number.isFinite(e.period) && Number.isFinite(e.clock)
    && Number.isFinite(e.wall) && e.data && typeof e.data === 'object';
}

export function buildApp(store: Store, opts: { staticDir?: string; logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 12 * 1024 * 1024 });
  const listeners = new Map<string, Set<Listener>>(); // by view token
  const fails = new Map<string, { n: number; until: number }>();

  const broadcast = (token: string, msg: Parameters<Listener>[0]) => listeners.get(token)?.forEach((l) => l(msg));

  app.addContentTypeParser(/^(audio|application\/octet-stream)/, { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.get('/api/health', async () => ({ ok: true, now: Date.now() }));

  app.post('/api/sync', async (req, reply) => {
    const body = req.body as { batches?: Batch[] };
    if (!Array.isArray(body?.batches)) return reply.code(400).send({ error: 'bad request' });
    const results: Array<{ gameId: string; ok: boolean; error?: string }> = [];
    for (const b of body.batches) {
      try {
        if (!b || typeof b.gameId !== 'string' || typeof b.pin !== 'string' || b.pin.length < 4) {
          results.push({ gameId: b?.gameId, ok: false, error: 'pin required (min 4 chars)' });
          continue;
        }
        const existing = store.getGame(b.gameId);
        if (existing) {
          if (!checkPin(b.pin, existing.pinHash)) { results.push({ gameId: b.gameId, ok: false, error: 'wrong pin' }); continue; }
        } else if (!b.game || b.game.id !== b.gameId || typeof b.game.viewToken !== 'string' || b.game.viewToken.length < 16) {
          results.push({ gameId: b.gameId, ok: false, error: 'unknown game; send game doc' });
          continue;
        }
        let gameOut: Game | undefined;
        if (b.game && b.game.id === b.gameId) {
          const cur = existing?.doc;
          if (!cur || b.game.updated >= cur.updated) {
            if (cur && cur.viewToken !== b.game.viewToken) b.game.viewToken = cur.viewToken; // token is immutable
            store.putGame(b.game, existing ? undefined : hashPin(b.pin));
            gameOut = b.game;
          }
        }
        const evs = (b.events ?? []).filter((e) => validEvent(e, b.gameId));
        const fresh = evs.length ? store.insertEvents(b.gameId, evs, Date.now()) : [];
        const token = (gameOut ?? existing?.doc ?? store.getGame(b.gameId)!.doc).viewToken;
        if (gameOut || fresh.length) broadcast(token, { game: gameOut?.deleted ? undefined : gameOut, events: fresh });
        results.push({ gameId: b.gameId, ok: true });
      } catch (err) {
        req.log.error(err);
        results.push({ gameId: b?.gameId, ok: false, error: 'server error' });
      }
    }
    return { results, now: Date.now() };
  });

  // Join as scorer from another device: view token + pin => full game + events
  app.post('/api/claim', async (req, reply) => {
    const { viewToken, pin } = (req.body ?? {}) as { viewToken?: string; pin?: string };
    const key = req.ip;
    const f = fails.get(key);
    if (f && f.n >= 5 && f.until > Date.now()) return reply.code(429).send({ error: 'too many attempts' });
    const g = typeof viewToken === 'string' ? store.getByToken(viewToken) : undefined;
    const full = g && store.getGame(g.doc.id);
    if (!g || !full || g.deleted || typeof pin !== 'string' || !checkPin(pin, full.pinHash)) {
      fails.set(key, { n: (f?.n ?? 0) + 1, until: Date.now() + 60_000 });
      return reply.code(403).send({ error: 'invalid link or pin' });
    }
    fails.delete(key);
    return { game: g.doc, events: store.events(g.doc.id) };
  });

  app.get('/api/view/:token', async (req, reply) => {
    const g = store.getByToken((req.params as any).token);
    if (!g || g.deleted) return reply.code(404).send({ error: 'not found' });
    const since = Number((req.query as any).since) || 0;
    return { game: g.doc, events: store.events(g.doc.id, since), now: Date.now() };
  });

  app.get('/api/view/:token/stream', (req, reply) => {
    const token = (req.params as any).token as string;
    const g = store.getByToken(token);
    if (!g || g.deleted) return reply.code(404).send({ error: 'not found' });
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const l: Listener = (m) => res.write(`data: ${JSON.stringify({ ...m, now: Date.now() })}\n\n`);
    let set = listeners.get(token);
    if (!set) listeners.set(token, (set = new Set()));
    set.add(l);
    const hb = setInterval(() => res.write(': hb\n\n'), 20_000);
    req.raw.on('close', () => { clearInterval(hb); set!.delete(l); if (!set!.size) listeners.delete(token); });
  });

  app.put('/api/audio/:id', async (req, reply) => {
    const q = req.query as { game?: string; pin?: string };
    const g = q.game ? store.getGame(q.game) : undefined;
    if (!g || !q.pin || !checkPin(q.pin, g.pinHash)) return reply.code(403).send({ error: 'forbidden' });
    const id = (req.params as any).id as string;
    if (!/^[\w-]{8,80}$/.test(id) || !Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'bad request' });
    store.putAudio(id, q.game!, String(req.headers['content-type'] ?? 'audio/webm').split(';')[0], req.body);
    return { ok: true };
  });

  app.get('/api/audio/:id', async (req, reply) => {
    const a = store.getAudio((req.params as any).id);
    if (!a) return reply.code(404).send({ error: 'not found' });
    return reply.header('Content-Type', a.mime).header('Cache-Control', 'public, max-age=31536000, immutable').send(Buffer.from(a.data));
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.register(fastifyStatic, { root: opts.staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

