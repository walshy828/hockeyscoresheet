import type { ClockData, GameEvent, GoalData, GoalieData, ShiftData, ShotData, Side, Strength, Game, FaceoffData, PenaltyData } from './types.ts';
import { elapsed, periodLength } from './rules.ts';

export interface PlayerStat {
  side: Side;
  id: string;
  g: number; a: number; sog: number; att: number; pim: number;
  fow: number; fol: number; toi: number; pm: number; shifts: number;
  toiByPeriod: number[];
  // goalie
  sa: number; sv: number; ga: number;
}

/** `goalie` is the netminder who was in goal for the team scored against (null = empty net, undefined = not tracked). */
export interface GoalRec { ev: GameEvent; d: GoalData; t: number; home: number; away: number; goalie?: string | null }
export interface GoalieChange { ev: GameEvent; side: Side; player: string | null; t: number }
export interface ShotRec { ev: GameEvent; d: ShotData; t: number }
export interface FaceoffRec { ev: GameEvent; d: FaceoffData; t: number }
export interface PenaltyRec {
  ev: GameEvent; d: PenaltyData; start: number; end: number; /** elapsed time it actually ends (may shorten on PP goal) */
  endedByGoal?: boolean;
}
export interface Shift { side: Side; player: string; start: number; end: number }

export interface ClockState { period: number; running: boolean; remaining: number }

export interface Derived {
  /** non-voided events, edits applied, ordered by game time */
  events: GameEvent[];
  clock: ClockState;
  nowElapsed: number;
  score: Record<Side, number>;
  goals: GoalRec[];
  shots: ShotRec[];
  faceoffs: FaceoffRec[];
  penalties: PenaltyRec[];
  notes: GameEvent[];
  timeouts: Record<Side, number>;
  onIce: Record<Side, Set<string>>;
  /** current goalie in net per side: id, null = pulled/empty net, undefined = never set */
  goalie: Record<Side, string | null | undefined>;
  goalieLog: GoalieChange[];
  players: Map<string, PlayerStat>;
  shifts: Shift[];
  byPeriod: {
    goals: Record<Side, number[]>;
    sog: Record<Side, number[]>;
    pim: Record<Side, number[]>;
    fo: Record<Side, number[]>;
  };
  ppGoals: Record<Side, number>;
  ppOpps: Record<Side, number>;
  maxPeriod: number;
}

const sides: Side[] = ['home', 'away'];
export const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Resolve voids/edits: returns effective events (not including void/edit events themselves). */
export function effectiveEvents(all: GameEvent[]): GameEvent[] {
  const voided = new Set<string>();
  const edits = new Map<string, GameEvent[]>();
  for (const e of all) {
    if (e.type === 'void') voided.add(e.data.target);
    else if (e.type === 'edit') {
      const l = edits.get(e.data.target) ?? [];
      l.push(e);
      edits.set(e.data.target, l);
    }
  }
  const out: GameEvent[] = [];
  for (const e of all) {
    if (e.type === 'void' || e.type === 'edit' || voided.has(e.id)) continue;
    const es = edits.get(e.id);
    if (!es) { out.push(e); continue; }
    es.sort((a, b) => a.wall - b.wall || (a.id < b.id ? -1 : 1));
    let cur = e;
    for (const ed of es) {
      cur = {
        ...cur,
        period: ed.data.period ?? cur.period,
        clock: ed.data.clock ?? cur.clock,
        data: { ...cur.data, ...(ed.data.patch ?? {}) },
      };
    }
    out.push(cur);
  }
  return out;
}

export function emptyStat(side: Side, id: string, periods: number): PlayerStat {
  return { side, id, g: 0, a: 0, sog: 0, att: 0, pim: 0, fow: 0, fol: 0, toi: 0, pm: 0, shifts: 0, toiByPeriod: new Array(periods).fill(0), sa: 0, sv: 0, ga: 0 };
}

export function clockAt(events: GameEvent[], now: number, anchor: 'wall' | 'recv' = 'wall'): ClockState {
  let last: GameEvent | undefined;
  for (const e of events) {
    if (e.type !== 'clock') continue;
    if (!last || e.wall > last.wall || (e.wall === last.wall && e.id > last.id)) last = e;
  }
  if (!last) return { period: 1, running: false, remaining: Infinity };
  const d = last.data as ClockData;
  const a = anchor === 'recv' ? last.recv ?? last.wall : last.wall;
  const remaining = d.running ? Math.max(0, d.remaining - Math.max(0, now - a) / 1000) : d.remaining;
  return { period: d.period, running: d.running && remaining > 0, remaining };
}

export function derive(allEvents: GameEvent[], game: Game, now: number = Date.now(), anchor: 'wall' | 'recv' = 'wall'): Derived {
  const rules = game.rules;
  const eff = effectiveEvents(allEvents);
  const clock0 = clockAt(eff, now, anchor);
  const clock: ClockState = { ...clock0, remaining: Number.isFinite(clock0.remaining) ? clock0.remaining : periodLength(1, rules) };
  const nowElapsed = elapsed(clock.period, clock.remaining, rules);
  const nPeriods = Math.max(rules.periods + 1, clock.period, ...eff.map((e) => e.period));

  const te = (e: GameEvent) => elapsed(e.period, Math.min(e.clock, periodLength(e.period, rules)), rules);
  const timeline = eff.filter((e) => e.type !== 'clock').sort((a, b) => te(a) - te(b) || a.wall - b.wall || (a.id < b.id ? -1 : 1));

  const zeroBy = () => ({ home: new Array(nPeriods).fill(0), away: new Array(nPeriods).fill(0) });
  const d: Derived = {
    events: timeline,
    clock,
    nowElapsed,
    score: { home: 0, away: 0 },
    goals: [], shots: [], faceoffs: [], penalties: [], notes: [],
    timeouts: { home: 0, away: 0 },
    onIce: { home: new Set(), away: new Set() },
    goalie: { home: undefined, away: undefined },
    goalieLog: [],
    players: new Map(),
    shifts: [],
    byPeriod: { goals: zeroBy(), sog: zeroBy(), pim: zeroBy(), fo: zeroBy() },
    ppGoals: { home: 0, away: 0 },
    ppOpps: { home: 0, away: 0 },
    maxPeriod: nPeriods,
  };

  const posOf = new Map<string, string>();
  for (const s of sides) for (const p of game[s].players) posOf.set(p.id, p.pos);
  const stat = (side: Side, id: string) => {
    let s = d.players.get(id);
    if (!s) { s = emptyStat(side, id, nPeriods); d.players.set(id, s); }
    return s;
  };
  // explicit goalie events win; older games tracked the goalie as an on-ice 'G' player
  const goalieOn = (side: Side): string | undefined => {
    const g = d.goalie[side];
    if (g !== undefined) return g ?? undefined;
    for (const id of d.onIce[side]) if (posOf.get(id) === 'G') return id;
    return undefined;
  };
  const goalieOpen: Partial<Record<Side, { id: string; start: number }>> = {};
  const closeGoalie = (side: Side, end: number) => {
    const o = goalieOpen[side];
    if (!o) return;
    delete goalieOpen[side];
    if (end > o.start) d.shifts.push({ side, player: o.id, start: o.start, end });
  };
  const open = new Map<string, number>();
  const closeShift = (side: Side, player: string, end: number) => {
    const start = open.get(player);
    if (start === undefined) return;
    open.delete(player);
    d.onIce[side].delete(player);
    if (end > start) d.shifts.push({ side, player, start, end });
  };
  const activeAt = (side: Side, t: number) => d.penalties.filter((p) => p.d.team === side && !p.d.noPP && p.start <= t && t < p.end);

  for (const e of timeline) {
    const t = te(e);
    const pi = e.period - 1;
    switch (e.type) {
      case 'shift': {
        const x = e.data as ShiftData;
        if (x.action === 'on') {
          if (!open.has(x.player)) { open.set(x.player, t); d.onIce[x.team].add(x.player); stat(x.team, x.player).shifts++; }
        } else closeShift(x.team, x.player, t);
        break;
      }
      case 'goalie': {
        const x = e.data as GoalieData;
        closeGoalie(x.team, t);
        d.goalie[x.team] = x.player ?? null;
        d.goalieLog.push({ ev: e, side: x.team, player: x.player ?? null, t });
        if (x.player) { goalieOpen[x.team] = { id: x.player, start: t }; stat(x.team, x.player).shifts++; }
        break;
      }
      case 'penalty': {
        const x = e.data as PenaltyData;
        const rec: PenaltyRec = { ev: e, d: x, start: t, end: t + x.minutes * 60 };
        d.penalties.push(rec);
        d.byPeriod.pim[x.team][pi] += x.minutes;
        if (x.player) stat(x.team, x.player).pim += x.minutes;
        if (x.noPP) break;
        if (x.minutes <= 2 * rules.minorMinutes) d.ppOpps[other(x.team)]++;
        else if (x.minutes === rules.majorMinutes) d.ppOpps[other(x.team)]++;
        break;
      }
      case 'goal': {
        const x = e.data as GoalData;
        const opp = other(x.team);
        d.score[x.team]++;
        d.byPeriod.goals[x.team][pi]++;
        d.byPeriod.sog[x.team][pi]++;
        if (x.scorer) { const s = stat(x.team, x.scorer); s.g++; s.sog++; }
        for (const a of x.assists ?? []) if (a) stat(x.team, a).a++;
        const gl = goalieOn(opp);
        if (gl) { const gs = stat(opp, gl); gs.sa++; gs.ga++; }
        // +/- : not awarded on PP goals scored by the power-play team
        if (x.strength !== 'PP' && x.strength !== 'PS') {
          for (const id of d.onIce[x.team]) stat(x.team, id).pm++;
          for (const id of d.onIce[opp]) stat(opp, id).pm--;
        }
        if (x.strength === 'PP') {
          d.ppGoals[x.team]++;
          // a minor (or half a double-minor) ends when the PP team scores
          const act = activeAt(opp, t).filter((p) => p.d.minutes <= 2 * rules.minorMinutes).sort((a, b) => a.end - b.end)[0];
          if (act) {
            if (act.d.minutes === 2 * rules.minorMinutes && act.end - t > rules.minorMinutes * 60) act.end -= rules.minorMinutes * 60;
            else { act.end = t; act.endedByGoal = true; }
          }
        }
        d.goals.push({ ev: e, d: x, t, home: d.score.home, away: d.score.away, goalie: d.goalie[opp] });
        break;
      }
      case 'shot': {
        const x = e.data as ShotData;
        const opp = other(x.team);
        if (x.player) { const s = stat(x.team, x.player); s.att++; if (x.result === 'save') s.sog++; }
        if (x.result === 'save') {
          d.byPeriod.sog[x.team][pi]++;
          const gl = goalieOn(opp);
          if (gl) { const gs = stat(opp, gl); gs.sa++; gs.sv++; }
        }
        d.shots.push({ ev: e, d: x, t });
        break;
      }
      case 'faceoff': {
        const x = e.data as FaceoffData;
        d.byPeriod.fo[x.team][pi]++;
        if (x.player) stat(x.team, x.player).fow++;
        if (x.loser) stat(other(x.team), x.loser).fol++;
        d.faceoffs.push({ ev: e, d: x, t });
        break;
      }
      case 'timeout':
        d.timeouts[(e.data as { team: Side }).team]++;
        break;
      case 'note':
        d.notes.push(e);
        break;
    }
  }

  // close open shifts at "now" (live) or at end of last recorded activity
  const endT = Math.max(nowElapsed, ...timeline.map(te), 0);
  for (const s of sides) for (const id of [...d.onIce[s]]) {
    const start = open.get(id)!;
    d.shifts.push({ side: s, player: id, start, end: Math.max(start, endT) });
  }
  for (const s of sides) closeGoalie(s, Math.max(goalieOpen[s]?.start ?? 0, endT));
  // TOI totals & per period
  for (const sh of d.shifts) {
    const st = stat(sh.side, sh.player);
    let ps = 0;
    for (let p = 1; p <= nPeriods; p++) {
      const pe = ps + periodLength(p, rules);
      const ov = Math.min(sh.end, pe) - Math.max(sh.start, ps);
      if (ov > 0) { st.toiByPeriod[p - 1] += ov; st.toi += ov; }
      ps = pe;
    }
  }
  return d;
}

/** Strength for a goal by `team` if it were scored now. */
export function strengthNow(d: Derived, team: Side): Strength {
  const t = d.nowElapsed;
  const act = (s: Side) => d.penalties.filter((p) => p.d.team === s && !p.d.noPP && p.start <= t && t < p.end).length;
  const own = act(team), opp = act(other(team));
  if (opp > own) return 'PP';
  if (own > opp) return 'SH';
  return d.goalie[other(team)] === null ? 'EN' : 'EV';
}

export function activePenalties(d: Derived) {
  const t = d.nowElapsed;
  return d.penalties.filter((p) => p.start <= t && t < p.end).map((p) => ({ ...p, remaining: p.end - t }));
}

export function fmtClock(sec: number): string {
  if (!Number.isFinite(sec)) return '--:--';
  const s = Math.max(0, sec);
  const w = Math.ceil(s);
  return `${Math.floor(w / 60)}:${String(w % 60).padStart(2, '0')}`;
}

export function fmtToi(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
