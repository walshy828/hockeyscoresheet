import { describe, expect, it } from 'vitest';
import { carryLineSet, emptyLineSet, findPriorLines } from './lines.ts';
import type { Game, Player } from './types.ts';

const P = (id: string, number: string, name: string): Player => ({ id, number, name, pos: 'C' });
const game = (id: string, date: string, teamId: string | undefined, name: string, f: string[]): Game => {
  const ls = emptyLineSet(); ls.F[0] = f;
  return { id, date, home: { teamId, name, color: '', players: [] }, away: { name: 'Opp', color: '', players: [] }, lines: { home: ls, away: emptyLineSet() } } as unknown as Game;
};

describe('carry over lines', () => {
  it('finds the latest earlier game with lines, by team id or name', () => {
    const gs = [game('a', '2026-10-01T19:00', 't1', 'Hawks', ['p1']), game('b', '2026-10-10T19:00', 't1', 'Hawks', ['p2']), game('c', '2026-11-01T19:00', 't1', 'Hawks', ['p3'])];
    expect(findPriorLines(gs, { teamId: 't1', name: 'Hawks', color: '', players: [] }, 'new', '2026-10-26T19:00')?.game.id).toBe('b');
    expect(findPriorLines([game('n', '2026-10-01T19:00', undefined, 'Hawks', ['p1'])], { name: ' hawks', color: '', players: [] })?.game.id).toBe('n');
    expect(findPriorLines(gs, { teamId: 't2', name: 'Other', color: '', players: [] })).toBeNull();
  });
  it('remaps players by id, then number + name, and blanks the rest', () => {
    const prev = [P('a', '9', 'Ann'), P('b', '7', 'Bo'), P('c', '1', 'Cy')];
    const now = [P('a', '9', 'Ann'), P('x', '7', 'bo')];
    expect(carryLineSet(game('g', 'd', 't', 'n', ['a', 'b', 'c']).lines!.home, prev, now).F[0]).toEqual(['a', 'x', '']);
  });
});
