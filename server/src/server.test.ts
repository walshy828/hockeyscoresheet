import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.ts';
import { openStore } from './db.ts';
import { PRESETS } from '../../shared/src/rules.ts';

const game: any = {
  id: 'game-0001-aaaa', viewToken: 'tok-0123456789abcdef', date: '', venue: '', level: '', officials: '', scorekeeper: '',
  rules: PRESETS.highschool, home: { name: 'H', color: '#f00', players: [] }, away: { name: 'A', color: '#00f', players: [] },
  status: 'live', notes: '', created: 1, updated: 1,
};
const ev = (i: number) => ({ id: `event-id-${i}-xxxx`, gameId: game.id, deviceId: 'd', type: 'goal', period: 1, clock: 600, wall: i, data: { team: 'home', assists: [], strength: 'EV' } });

test('sync is idempotent, pin protected, viewable', async () => {
  const store = openStore(mkdtempSync(join(tmpdir(), 'hs-')));
  const app = buildApp(store);
  const sync = (b: any) => app.inject({ method: 'POST', url: '/api/sync', payload: { batches: [b] } }).then((r) => r.json());

  let r = await sync({ gameId: game.id, pin: '1234', game, events: [ev(1), ev(2)] });
  assert.equal(r.results[0].ok, true);
  // duplicates + out of order replay
  r = await sync({ gameId: game.id, pin: '1234', events: [ev(2), ev(1), ev(3)] });
  assert.equal(r.results[0].ok, true);
  // wrong pin rejected, nothing stored
  r = await sync({ gameId: game.id, pin: '9999', events: [ev(4)] });
  assert.equal(r.results[0].ok, false);
  // invalid event dropped
  await sync({ gameId: game.id, pin: '1234', events: [{ ...ev(5), type: 'nope' }] });

  const view = (await app.inject({ url: `/api/view/${game.viewToken}` })).json();
  assert.equal(view.events.length, 3);
  assert.equal(view.game.id, game.id);

  const claim = await app.inject({ method: 'POST', url: '/api/claim', payload: { viewToken: game.viewToken, pin: '1234' } });
  assert.equal(claim.statusCode, 200);
  const bad = await app.inject({ method: 'POST', url: '/api/claim', payload: { viewToken: game.viewToken, pin: 'nope' } });
  assert.equal(bad.statusCode, 403);

  // soft delete hides the viewer
  await sync({ gameId: game.id, pin: '1234', game: { ...game, deleted: true, updated: 5 } });
  assert.equal((await app.inject({ url: `/api/view/${game.viewToken}` })).statusCode, 404);

  // audio roundtrip
  const put = await app.inject({ method: 'PUT', url: `/api/audio/audio-id-12345?game=${game.id}&pin=1234`, headers: { 'content-type': 'audio/webm' }, payload: Buffer.from('abc') });
  assert.equal(put.statusCode, 200);
  assert.equal((await app.inject({ url: '/api/audio/audio-id-12345' })).body, 'abc');
  assert.ok(store.backup().endsWith('.db'));
});
