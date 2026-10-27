import { describe, expect, it } from 'vitest';
import { derive, strengthNow } from './derive.ts';
import { PRESETS } from './rules.ts';
import type { Game, GameEvent } from './types.ts';
import { parseVoice } from './voice.ts';
import { planSwap, unitSize } from './lines.ts';

const mk = (n: string, pos: any = 'F') => ({ id: n, number: n, name: n, pos });
const game: Game = {
  id: 'g', viewToken: 't', date: '', venue: '', level: '', officials: '', scorekeeper: '',
  rules: PRESETS.highschool,
  home: { name: 'H', color: '#f00', players: [mk('h1'), mk('h2'), mk('hg', 'G')] },
  away: { name: 'A', color: '#00f', players: [mk('a1'), mk('ag', 'G')] },
  status: 'live', notes: '', created: 0, updated: 0,
};
let n = 0;
const ev = (type: any, period: number, clock: number, data: any, wall = ++n): GameEvent => ({ id: `e${++n}`, gameId: 'g', deviceId: 'd', type, period, clock, wall, data });

describe('derive', () => {
  it('applies shift changes in entry order even if the clock was moved back', () => {
    const evs = [
      ev('shift', 1, 600, { team: 'home', player: 'h1', action: 'on' }),
      // clock reset earlier, then the line is changed
      ev('shift', 1, 800, { team: 'home', player: 'h1', action: 'off' }),
      ev('shift', 1, 800, { team: 'home', player: 'h2', action: 'on' }),
    ];
    const d = derive(evs, game, 0);
    expect([...d.onIce.home]).toEqual(['h2']);
  });

  it('scores goals, stats, TOI, +/-', () => {
    const evs = [
      ev('clock', 1, 900, { running: false, remaining: 900, period: 1 }),
      ev('shift', 1, 900, { team: 'home', player: 'h1', action: 'on' }),
      ev('shift', 1, 900, { team: 'away', player: 'ag', action: 'on' }),
      ev('shift', 1, 900, { team: 'home', player: 'hg', action: 'on' }),
      ev('goal', 1, 600, { team: 'home', scorer: 'h1', assists: ['h2'], strength: 'EV' }),
      ev('shot', 1, 500, { team: 'home', player: 'h1', result: 'save' }),
      ev('shift', 1, 300, { team: 'home', player: 'h1', action: 'off' }),
    ];
    const d = derive(evs, game, 0);
    expect(d.score).toEqual({ home: 1, away: 0 });
    const h1 = d.players.get('h1')!;
    expect(h1.g).toBe(1); expect(h1.sog).toBe(2); expect(h1.pm).toBe(1);
    expect(h1.toi).toBe(600);
    expect(d.players.get('h2')!.a).toBe(1);
    const ag = d.players.get('ag')!;
    expect(ag.sa).toBe(2); expect(ag.sv).toBe(1); expect(ag.ga).toBe(1);
    expect(d.byPeriod.sog.home[0]).toBe(2);
  });

  it('void and edit are honoured', () => {
    const g = ev('goal', 1, 600, { team: 'home', assists: [], strength: 'EV' });
    const g2 = ev('goal', 2, 600, { team: 'away', assists: [], strength: 'EV' });
    const evs = [g, g2, ev('void', 1, 0, { target: g.id }), ev('edit', 1, 0, { target: g2.id, patch: { team: 'home' }, clock: 100 })];
    const d = derive(evs, game, 0);
    expect(d.score).toEqual({ home: 1, away: 0 });
    expect(d.goals[0].ev.clock).toBe(100);
  });

  it('minor penalty ends on power-play goal; strength tracking', () => {
    const evs = [
      ev('clock', 1, 900, { running: false, remaining: 900, period: 1 }),
      ev('penalty', 1, 800, { team: 'away', code: 'TRIP', label: 'Tripping', minutes: 2 }),
      ev('clock', 1, 700, { running: false, remaining: 700, period: 1 }),
    ];
    let d = derive(evs, game, 0);
    expect(strengthNow(d, 'home')).toBe('PP');
    expect(strengthNow(d, 'away')).toBe('SH');
    evs.splice(2, 0, ev('goal', 1, 750, { team: 'home', assists: [], strength: 'PP' }));
    d = derive(evs, game, 0);
    expect(strengthNow(d, 'home')).toBe('EV');
    expect(d.ppGoals.home).toBe(1);
    expect(d.ppOpps.home).toBe(1);
  });

  it('running clock is computed from anchor', () => {
    const evs = [ev('clock', 1, 900, { running: true, remaining: 900, period: 1 }, 1000)];
    expect(derive(evs, game, 11000).clock.remaining).toBe(890);
    expect(derive(evs, game, 1e9).clock.remaining).toBe(0);
  });

  it('idempotent under duplicate and shuffled events', () => {
    const evs = [ev('goal', 1, 600, { team: 'home', assists: [], strength: 'EV' }), ev('goal', 1, 300, { team: 'away', assists: [], strength: 'EV' })];
    const a = derive(evs, game, 0).score;
    const dedup = [...evs].reverse();
    expect(derive(dedup, game, 0).score).toEqual(a);
  });
});

describe('goalies', () => {
  const g2: Game = { ...game, home: { ...game.home, players: [...game.home.players, mk('hg2', 'G')] } };
  it('credits goals/saves to the goalie in net at the time, and tracks empty net', () => {
    const evs = [
      ev('clock', 1, 900, { running: false, remaining: 900, period: 1 }),
      ev('goalie', 1, 900, { team: 'home', player: 'hg' }),
      ev('shot', 1, 800, { team: 'away', player: 'a1', result: 'save' }),
      ev('goalie', 1, 600, { team: 'home', player: 'hg2' }),
      ev('goal', 1, 500, { team: 'away', scorer: 'a1', assists: [], strength: 'EV' }),
      ev('goalie', 1, 300, { team: 'home', player: null }),
      ev('goal', 1, 200, { team: 'away', scorer: 'a1', assists: [], strength: 'EN' }),
    ];
    const d = derive(evs, g2, 0);
    expect(d.goalie.home).toBeNull();
    expect(d.goalie.away).toBeUndefined();
    expect(d.goals.map((x) => x.goalie)).toEqual(['hg2', null]);
    expect(d.players.get('hg')).toMatchObject({ sa: 1, sv: 1, ga: 0, toi: 300 });
    expect(d.players.get('hg2')).toMatchObject({ sa: 1, sv: 0, ga: 1, toi: 300 });
    expect(d.goalieLog.map((x) => x.player)).toEqual(['hg', 'hg2', null]);
    expect(strengthNow(d, 'away')).toBe('EN');
  });
  it('falls back to an on-ice G for older games without goalie events', () => {
    const evs = [ev('shift', 1, 900, { team: 'home', player: 'hg', action: 'on' }), ev('goal', 1, 600, { team: 'away', assists: [], strength: 'EV' })];
    expect(derive(evs, game, 0).players.get('hg')!.ga).toBe(1);
  });
});

describe('lines', () => {
  it('swaps only in-scope players', () => {
    const fwd = (id: string) => id.startsWith('f');
    expect(planSwap(['f1', 'f2', 'd1'], ['f3', 'f2'], fwd)).toEqual({ off: ['f1'], on: ['f3'] });
  });
  it('shrinks the PK unit when two men down', () => {
    expect([0, 1, 2, 3].map((n) => unitSize('PK', 5, n))).toEqual([5, 4, 3, 3]);
    expect(unitSize('PP', 5, 2)).toBe(5);
  });
});

describe('voice', () => {
  it('parses goals with assists', () => {
    expect(parseVoice('goal home seventeen assist twenty two nine')).toEqual({ kind: 'goal', team: 'home', scorer: '17', assists: ['22', '9'] });
  });
  it('parses shots, penalties, faceoffs, clock', () => {
    expect(parseVoice('shot away 4')).toMatchObject({ kind: 'shot', team: 'away', player: '4', result: 'save' });
    expect(parseVoice('penalty home 12 tripping two minutes')).toMatchObject({ kind: 'penalty', team: 'home', player: '12', code: 'TRIP', minutes: 2 });
    expect(parseVoice('face off won by away')).toMatchObject({ kind: 'faceoff', team: 'away' });
    expect(parseVoice('set clock 8 14')).toEqual({ kind: 'clock', action: 'set', remaining: 494 });
    expect(parseVoice('stop clock')).toEqual({ kind: 'clock', action: 'stop' });
    expect(parseVoice('note: goalie looks shaky')).toEqual({ kind: 'note', text: 'goalie looks shaky' });
    expect(parseVoice('gibberish')).toBeNull();
  });

  it('noPP penalties do not leave the team short-handed', () => {
    const base = [ev('clock', 1, 700, { running: false, remaining: 700, period: 1 })];
    const pen = (noPP: boolean) => derive([...base, ev('penalty', 1, 800, { team: 'home', code: 'ROUGH', label: 'Roughing', minutes: 2, noPP })], game, 0);
    expect(pen(false).ppOpps.away).toBe(1);
    expect(pen(true).ppOpps.away).toBe(0);
    expect(strengthNow(pen(false), 'away')).toBe('PP');
    expect(strengthNow(pen(true), 'away')).toBe('EV');
  });

  describe('penalty release and removal', () => {
    // clock stopped at 700s left in P1 => 500s elapsed
    const base = () => [ev('clock', 1, 700, { running: false, remaining: 700, period: 1 })];
    const pen = () => ev('penalty', 1, 800, { team: 'home', code: 'TRIP', label: 'Tripping', minutes: 2 });
    const ppGoal = (extra: any = {}) => ev('goal', 1, 750, { team: 'away', assists: [], strength: 'PP', ...extra });

    it('a power-play goal releases the minor by default', () => {
      const d = derive([...base(), pen(), ppGoal()], game, 0);
      expect(d.penalties[0].endedByGoal).toBe(true);
    });
    it('keepPenalty leaves the penalty running', () => {
      const d = derive([...base(), pen(), ppGoal({ keepPenalty: true })], game, 0);
      expect(d.penalties[0].endedByGoal).toBeUndefined();
      expect(d.penalties[0].end).toBe(d.penalties[0].start + 120);
    });
    it('penaltyEnd takes it off the board but keeps PIM; voiding restores it', () => {
      const p = pen();
      const end = ev('penaltyEnd', 1, 700, { target: p.id, team: 'home' });
      const d = derive([...base(), p, end], game, 0);
      expect(d.penalties[0].removed).toBe(true);
      expect(d.byPeriod.pim.home[0]).toBe(2);
      expect(strengthNow(d, 'away')).toBe('EV');
      const back = derive([...base(), p, end, ev('void', 1, 700, { target: end.id })], game, 0);
      expect(strengthNow(back, 'away')).toBe('PP');
    });
  });
});
