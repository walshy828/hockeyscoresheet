import { describe, expect, it } from 'vitest';
import { derive } from './derive.ts';
import { buildInsights, dotZone, faceoffMatrix, faceoffPlayers, faceoffSummary, iceTime, periodReviews, shotDistance, shotZone, teamPeriods, totalLine } from './insights.ts';
import { FACEOFF_DOTS } from './rink.ts';
import { PRESETS } from './rules.ts';
import type { Game, GameEvent } from './types.ts';

const mk = (n: string, pos: any = 'F') => ({ id: n, number: n, name: n, pos });
const game: Game = {
  id: 'g', viewToken: 't', date: '', venue: '', level: '', officials: '', scorekeeper: '',
  rules: PRESETS.highschool,
  home: { name: 'H', color: '#f00', players: [mk('h1'), mk('h2'), mk('hg', 'G')] },
  away: { name: 'A', color: '#00f', players: [mk('a1'), mk('a2'), mk('ag', 'G')] },
  status: 'live', notes: '', created: 0, updated: 0,
};
let n = 0;
const ev = (type: any, period: number, clock: number, data: any): GameEvent => ({ id: `e${++n}`, gameId: 'g', deviceId: 'd', type, period, clock, wall: ++n, data });
const dot = (id: string) => FACEOFF_DOTS.find((x) => x.id === id)!;
const fo = (period: number, clock: number, team: 'home' | 'away', player: string, loser: string, dotId: string) => ev('faceoff', period, clock, { team, player, loser, dot: dotId, x: dot(dotId).x, y: dot(dotId).y });

describe('faceoffs', () => {
  it('maps dots to zones from each side’s point of view (home defends the left end)', () => {
    expect(dotZone(game, dot('EL-U'), 'home')).toBe('DZ');
    expect(dotZone(game, dot('EL-U'), 'away')).toBe('OZ');
    expect(dotZone(game, dot('ER-L'), 'home')).toBe('OZ');
    expect(dotZone(game, dot('NL-U'), 'home')).toBe('NZ');
    expect(dotZone(game, dot('C'), 'away')).toBe('NZ');
    expect(dotZone({ ...game, homeOnLeft: false }, dot('EL-U'), 'home')).toBe('OZ');
  });

  const evs = [
    fo(1, 800, 'home', 'h1', 'a1', 'C'),
    fo(1, 700, 'home', 'h1', 'a1', 'ER-U'),
    fo(1, 600, 'away', 'a1', 'h1', 'EL-L'),
    fo(2, 800, 'away', 'a2', 'h2', 'NL-U'),
    ev('faceoff', 2, 700, { team: 'home' }), // nothing known but the winner
  ];
  const d = derive(evs, game, 0);

  it('summarises wins by zone and dot, counting unplaced draws', () => {
    const s = faceoffSummary(d, game, 'home');
    expect(s.total).toEqual({ w: 3, l: 2 });
    expect(s.zones.OZ).toEqual({ w: 1, l: 0 });
    expect(s.zones.DZ).toEqual({ w: 0, l: 1 });
    expect(s.zones.NZ).toEqual({ w: 1, l: 1 });
    expect(s.dots['ER-U']).toEqual({ w: 1, l: 0 });
    expect(s.unplaced).toEqual({ w: 1, l: 0 });
    expect(faceoffSummary(d, game, 'home', 2).total).toEqual({ w: 1, l: 1 });
  });

  it('tracks a player’s record with zone splits', () => {
    const h1 = faceoffPlayers(d, game, 'home').find((p) => p.id === 'h1')!;
    expect(h1.total).toEqual({ w: 2, l: 1 });
    expect(h1.zones.OZ).toEqual({ w: 1, l: 0 });
    expect(h1.zones.DZ).toEqual({ w: 0, l: 1 });
  });

  it('builds a head-to-head matrix from draws where both players are known', () => {
    const m = faceoffMatrix(d, game, 'home');
    expect(m.cells.h1.a1).toEqual({ w: 2, l: 1 });
    expect(m.cells.h2.a2).toEqual({ w: 0, l: 1 });
    expect(m.rows[0]).toBe('h1');
    expect(m.partial).toBe(1);
    expect(faceoffMatrix(d, game, 'away').cells.a1.h1).toEqual({ w: 1, l: 2 });
  });
});

describe('period breakdown', () => {
  const evs = [
    ev('penalty', 1, 800, { team: 'away', code: 'TRIP', label: 'Tripping', minutes: 2 }),
    ev('goal', 1, 700, { team: 'home', scorer: 'h1', assists: [], strength: 'PP' }),
    ev('shot', 1, 600, { team: 'home', player: 'h1', result: 'miss' }),
    ev('shot', 1, 500, { team: 'home', player: 'h1', result: 'block', blocker: 'a1' }),
    ev('shot', 1, 400, { team: 'away', player: 'a1', result: 'save' }),
    ev('shot', 2, 400, { team: 'away', player: 'a1', result: 'save' }),
    ev('penalty', 2, 300, { team: 'home', code: 'HOOK', label: 'Hooking', minutes: 2 }),
  ];
  const d = derive(evs, game, 0);

  it('counts attempts, misses, blocks and special teams per period', () => {
    const [p1, p2] = teamPeriods(d, game, 'home');
    expect(p1).toMatchObject({ goals: 1, sog: 1, attempts: 3, missed: 1, blocked: 1, ppGoals: 1, ppOpps: 1, pim: 0 });
    expect(p2).toMatchObject({ pim: 2, penalties: 1, ppOpps: 0 });
    const [a1, a2] = teamPeriods(d, game, 'away');
    expect(a1).toMatchObject({ sog: 1, blocks: 1, pim: 2 });
    expect(a2).toMatchObject({ sog: 1, ppOpps: 1 });
    expect(totalLine(teamPeriods(d, game, 'away')).sog).toBe(2);
  });

  it('reviews a period from the focus team’s side', () => {
    const [r1] = periodReviews(d, game, 'home');
    expect(r1.result).toBe('won');
    expect(r1.score).toEqual([1, 0]);
    expect(r1.good.join()).toMatch(/Won the period 1–0/);
  });
});

describe('shot geometry', () => {
  it('measures distance to the net being attacked', () => {
    // home defends the left end, so it shoots at the right-hand net at x = 189
    expect(shotDistance(game, 'home', 175, 42.5)).toBeCloseTo(14);
    expect(shotDistance(game, 'away', 25, 42.5)).toBeCloseTo(14);
    expect(shotZone(14)).toBe('slot');
    expect(shotZone(40)).toBe('mid');
    expect(shotZone(70)).toBe('outside');
  });
});

describe('ice time', () => {
  it('splits a shift across even-strength, power-play and penalty-kill time', () => {
    const evs = [
      ev('clock', 1, 900, { running: false, remaining: 900, period: 1 }),
      ev('shift', 1, 900, { team: 'home', player: 'h1', action: 'on' }),
      ev('penalty', 1, 840, { team: 'away', code: 'TRIP', label: 'Tripping', minutes: 2 }), // t = 60..180
      ev('shift', 1, 600, { team: 'home', player: 'h1', action: 'off' }), // t = 300
    ];
    const d = derive(evs, game, 0);
    const split = iceTime(d).players.get('h1')!;
    expect(split.pp).toBe(120);
    expect(split.ev).toBe(180);
    expect(split.pk).toBe(0);
    expect(iceTime(d).team.away.pk).toBe(120);
  });
});

describe('buildInsights', () => {
  it('flags a lopsided faceoff night and a matchup to exploit', () => {
    const evs = [
      ...Array.from({ length: 6 }, (_, i) => fo(1, 800 - i * 10, 'home', 'h1', 'a1', 'ER-U')),
      fo(1, 700, 'away', 'a1', 'h1', 'C'),
    ];
    const d = derive(evs, game, 0);
    const ins = buildInsights(d, game, 'home');
    expect(ins.find((i) => i.area === 'Faceoffs' && i.tone === 'good' && /Winning the draw/.test(i.title))).toBeTruthy();
    expect(ins.find((i) => i.tone === 'exploit' && /Matchup edge/.test(i.title))).toBeTruthy();
    const them = buildInsights(d, game, 'away');
    expect(them.find((i) => i.tone === 'bad' && /Losing the draw/.test(i.title))).toBeTruthy();
    expect(them.find((i) => i.tone === 'bad' && /Matchup problem/.test(i.title))).toBeTruthy();
  });

  it('says nothing when there is not enough data', () => {
    expect(buildInsights(derive([], game, 0), game, 'home')).toEqual([]);
  });
});
