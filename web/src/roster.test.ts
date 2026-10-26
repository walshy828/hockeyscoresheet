import { expect, it } from 'vitest';
import { parseRoster, syncRoster } from './roster.ts';
import type { Player } from '../../shared/src/types.ts';

it('parses pasted roster', () => {
  const r = parseRoster('12 Jane Smith C\n#9, Bob Lee, D\n30 Goalie Guy G\nbad line\n7 Sam');
  expect(r.map((p) => [p.number, p.name, p.pos])).toEqual([['12', 'Jane Smith', 'C'], ['9', 'Bob Lee', 'D'], ['30', 'Goalie Guy', 'G'], ['7', 'Sam', 'F']]);
});

const P = (id: string, number: string, name: string, extra: Partial<Player> = {}): Player => ({ id, number, name, pos: 'F', ...extra });

it('syncRoster adds new players, updates matches, keeps scratches and orphans', () => {
  const game = [P('a', '1', 'Old Name', { scratched: true }), P('b', '2', 'Bee'), P('x', '99', 'Gone')];
  const team = [P('a', '1', 'New Name'), P('b', '2', 'Bee'), P('c', '3', 'Cee')];
  const r = syncRoster(game, team);
  expect(r.added).toBe(1);
  expect(r.updated).toBe(1);
  expect(r.kept).toBe(1);
  expect(r.players.find((p) => p.id === 'a')).toMatchObject({ name: 'New Name', scratched: true });
  expect(r.players.map((p) => p.id)).toEqual(['a', 'b', 'x', 'c']);
  expect(game[0].name).toBe('Old Name'); // input untouched
});

it('syncRoster matches by jersey number when ids differ, without duplicating', () => {
  const r = syncRoster([P('g1', '7', 'Sam')], [P('t1', '7', 'Samuel')]);
  expect(r.players).toHaveLength(1);
  expect(r.players[0]).toMatchObject({ id: 'g1', name: 'Samuel' });
  expect(r.added).toBe(0);
});
