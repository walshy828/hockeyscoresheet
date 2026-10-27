import type { Game, Side } from './types.ts';
import { other, type Derived, type FaceoffRec, type Shift } from './derive.ts';
import { periodName } from './rules.ts';
import { FACEOFF_DOTS, nearestDot, rinkEnds, type FaceoffDot } from './rink.ts';

/* ------------------------------------------------------------------ helpers */

export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
/** `a` as a whole-number percentage of `a + b` (0 when there is nothing to divide) */
export const pct = (a: number, b: number) => (a + b ? Math.round((a / (a + b)) * 100) : 0);

export interface WL { w: number; l: number }
const wl = (): WL => ({ w: 0, l: 0 });

export const periodCount = (d: Derived, game: Game) => Math.max(game.rules.periods, d.clock.period, ...d.events.map((e) => e.period));

const playerSide = (game: Game, id: string): Side | undefined => (game.home.players.some((p) => p.id === id) ? 'home' : game.away.players.some((p) => p.id === id) ? 'away' : undefined);
const label = (game: Game, id: string) => { const p = game.home.players.concat(game.away.players).find((x) => x.id === id); return p ? `#${p.number}${p.name ? ' ' + p.name : ''}` : '#?'; };
const posOf = (game: Game, id: string) => game.home.players.concat(game.away.players).find((x) => x.id === id)?.pos;

/* ------------------------------------------------------------------ period breakdown */

export interface PeriodLine {
  goals: number; sog: number; attempts: number; missed: number;
  /** this team's shots that a defender blocked */
  blocked: number;
  /** shots this team's defenders blocked */
  blocks: number;
  fow: number; fol: number;
  ppGoals: number; ppOpps: number; shGoals: number;
  pim: number; penalties: number;
}

const emptyLine = (): PeriodLine => ({ goals: 0, sog: 0, attempts: 0, missed: 0, blocked: 0, blocks: 0, fow: 0, fol: 0, ppGoals: 0, ppOpps: 0, shGoals: 0, pim: 0, penalties: 0 });

/** One line per period for `side`; mirrors how `derive` counts power-play opportunities. */
export function teamPeriods(d: Derived, game: Game, side: Side): PeriodLine[] {
  const np = periodCount(d, game);
  const lines = Array.from({ length: np }, emptyLine);
  const at = (p: number) => lines[Math.min(np, Math.max(1, p)) - 1];
  for (const g of d.goals) {
    if (g.d.team === side) {
      const l = at(g.ev.period);
      l.goals++; l.sog++; l.attempts++;
      if (g.d.strength === 'PP') l.ppGoals++;
      if (g.d.strength === 'SH') l.shGoals++;
    }
  }
  for (const s of d.shots) {
    const l = at(s.ev.period);
    if (s.d.team === side) {
      l.attempts++;
      if (s.d.result === 'save') l.sog++;
      else if (s.d.result === 'miss') l.missed++;
      else l.blocked++;
    } else if (s.d.result === 'block') l.blocks++;
  }
  for (const f of d.faceoffs) { const l = at(f.ev.period); if (f.d.team === side) l.fow++; else l.fol++; }
  const { minorMinutes, majorMinutes } = game.rules;
  for (const p of d.penalties) {
    const l = at(p.ev.period);
    if (p.d.team === side) { l.pim += p.d.minutes; l.penalties++; }
    else if (!p.d.noPP && (p.d.minutes <= 2 * minorMinutes || p.d.minutes === majorMinutes)) l.ppOpps++;
  }
  return lines;
}

export function totalLine(lines: PeriodLine[]): PeriodLine {
  const t = emptyLine();
  for (const l of lines) for (const k of Object.keys(t) as (keyof PeriodLine)[]) t[k] += l[k];
  return t;
}

/* ------------------------------------------------------------------ shot geometry */

/** Distance (ft) from a shot at (x, y) to the net the shooting team was attacking. */
export function shotDistance(game: Game, team: Side, x: number, y: number): number {
  const attackRight = rinkEnds(game).leftTeam === team; // the left-end team defends left, so it attacks right
  return Math.hypot(x - (attackRight ? 189 : 11), y - 42.5);
}
export type ShotZone = 'slot' | 'mid' | 'outside';
export const SLOT_FT = 25;
export const MID_FT = 45;
export const shotZone = (ft: number): ShotZone => (ft <= SLOT_FT ? 'slot' : ft <= MID_FT ? 'mid' : 'outside');

/** Located shots and goals for a side, bucketed by distance from the net. */
export function shotZones(d: Derived, game: Game, side: Side): Record<ShotZone, number> & { located: number } {
  const z = { slot: 0, mid: 0, outside: 0, located: 0 };
  const add = (x: number | undefined, y: number | undefined) => { if (x === undefined || y === undefined) return; z[shotZone(shotDistance(game, side, x, y))]++; z.located++; };
  for (const g of d.goals) if (g.d.team === side) add(g.d.x, g.d.y);
  for (const s of d.shots) if (s.d.team === side) add(s.d.x, s.d.y);
  return z;
}

/* ------------------------------------------------------------------ faceoffs */

export type Zone = 'OZ' | 'NZ' | 'DZ';
export const ZONE_LABEL: Record<Zone, string> = { OZ: 'Offensive zone', NZ: 'Neutral zone', DZ: 'Defensive zone' };

export function faceoffDot(f: FaceoffRec): FaceoffDot | undefined {
  const byId = f.d.dot ? FACEOFF_DOTS.find((x) => x.id === f.d.dot) : undefined;
  if (byId) return byId;
  return f.d.x != null && f.d.y != null ? nearestDot(f.d.x, f.d.y) : undefined;
}

/** Which zone a draw at `dot` is for `side`: its own end is the defensive zone, the far end the offensive. */
export function dotZone(game: Game, dot: FaceoffDot, side: Side): Zone {
  if (dot.x >= 75 && dot.x <= 125) return 'NZ';
  const { leftTeam } = rinkEnds(game);
  const ownEnd = side === leftTeam ? dot.x < 100 : dot.x > 100;
  return ownEnd ? 'DZ' : 'OZ';
}

export interface FaceoffSummary {
  total: WL;
  zones: Record<Zone, WL>;
  /** by dot id, from this side's point of view */
  dots: Record<string, WL>;
  /** draws with no recorded location */
  unplaced: WL;
}

export function faceoffSummary(d: Derived, game: Game, side: Side, period?: number): FaceoffSummary {
  const out: FaceoffSummary = { total: wl(), zones: { OZ: wl(), NZ: wl(), DZ: wl() }, dots: {}, unplaced: wl() };
  for (const f of d.faceoffs) {
    if (period && f.ev.period !== period) continue;
    const won = f.d.team === side;
    const bump = (r: WL) => { if (won) r.w++; else r.l++; };
    bump(out.total);
    const dot = faceoffDot(f);
    if (!dot) { bump(out.unplaced); continue; }
    bump(out.zones[dotZone(game, dot, side)]);
    bump((out.dots[dot.id] ??= wl()));
  }
  return out;
}

export interface FaceoffPlayer { id: string; total: WL; zones: Record<Zone, WL> }

/** Each of `side`'s players who took a draw (as winner or loser), with their zone splits. */
export function faceoffPlayers(d: Derived, game: Game, side: Side): FaceoffPlayer[] {
  const m = new Map<string, FaceoffPlayer>();
  const get = (id: string) => { let p = m.get(id); if (!p) { p = { id, total: wl(), zones: { OZ: wl(), NZ: wl(), DZ: wl() } }; m.set(id, p); } return p; };
  for (const f of d.faceoffs) {
    const won = f.d.team === side;
    const id = won ? f.d.player : f.d.loser;
    if (!id || playerSide(game, id) !== side) continue;
    const p = get(id);
    const dot = faceoffDot(f);
    const z = dot ? p.zones[dotZone(game, dot, side)] : undefined;
    if (won) { p.total.w++; if (z) z.w++; } else { p.total.l++; if (z) z.l++; }
  }
  return [...m.values()].sort((a, b) => (b.total.w + b.total.l) - (a.total.w + a.total.l) || pct(b.total.w, b.total.l) - pct(a.total.w, a.total.l));
}

export interface FaceoffMatrix {
  rows: string[];
  cols: string[];
  /** `cells[row][col]` is the row player's record against that opponent */
  cells: Record<string, Record<string, WL>>;
  /** draws where one of the two players wasn't recorded */
  partial: number;
}

/** `side`'s players (rows) against the opponent's (columns), from draws where both players are known. */
export function faceoffMatrix(d: Derived, game: Game, side: Side): FaceoffMatrix {
  const cells: FaceoffMatrix['cells'] = {};
  let partial = 0;
  for (const f of d.faceoffs) {
    const winner = f.d.player, loser = f.d.loser;
    if (!winner || !loser) { partial++; continue; }
    const mine = f.d.team === side ? winner : loser;
    const theirs = f.d.team === side ? loser : winner;
    if (playerSide(game, mine) !== side || playerSide(game, theirs) !== other(side)) { partial++; continue; }
    const c = ((cells[mine] ??= {})[theirs] ??= wl());
    if (f.d.team === side) c.w++; else c.l++;
  }
  const rows = Object.keys(cells).sort((a, b) => sumWl(Object.values(cells[b])) - sumWl(Object.values(cells[a])));
  const colTotals = new Map<string, number>();
  for (const r of rows) for (const [c, v] of Object.entries(cells[r])) colTotals.set(c, (colTotals.get(c) ?? 0) + v.w + v.l);
  const cols = [...colTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return { rows, cols, cells, partial };
}
const sumWl = (l: WL[]) => l.reduce((n, x) => n + x.w + x.l, 0);

/* ------------------------------------------------------------------ ice time */

export interface IceSplit { ev: number; pp: number; pk: number }
export const emptySplit = (): IceSplit => ({ ev: 0, pp: 0, pk: 0 });

/** Game time up to which shifts and special-teams time are measured. */
export function gameLength(d: Derived): number {
  return Math.max(d.nowElapsed, ...d.shifts.map((s) => s.end), ...d.goals.map((g) => g.t), ...d.penalties.map((p) => p.start), 0);
}

type State = keyof IceSplit;

/** Even-strength / power-play / penalty-kill stretches for `side` between t0 and t1. */
function strengthSegments(d: Derived, side: Side, t0: number, t1: number): { s: State; a: number; b: number }[] {
  const pens = d.penalties.filter((p) => !p.d.noPP);
  const cuts = new Set<number>([t0, t1]);
  for (const p of pens) for (const t of [p.start, p.end]) if (t > t0 && t < t1) cuts.add(t);
  const pts = [...cuts].sort((a, b) => a - b);
  const out: { s: State; a: number; b: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], mid = (a + b) / 2;
    const act = (s: Side) => pens.filter((p) => p.d.team === s && p.start <= mid && mid < p.end).length;
    const own = act(side), opp = act(other(side));
    out.push({ s: opp > own ? 'pp' : own > opp ? 'pk' : 'ev', a, b });
  }
  return out;
}

export interface IceTime {
  players: Map<string, IceSplit>;
  team: Record<Side, IceSplit>;
}

/** Ice time split by strength, for every player and for each team's total game time. */
export function iceTime(d: Derived): IceTime {
  const players = new Map<string, IceSplit>();
  for (const sh of d.shifts) {
    const cur = players.get(sh.player) ?? emptySplit();
    for (const seg of strengthSegments(d, sh.side, sh.start, sh.end)) cur[seg.s] += seg.b - seg.a;
    players.set(sh.player, cur);
  }
  const end = gameLength(d);
  const team = { home: emptySplit(), away: emptySplit() };
  for (const s of ['home', 'away'] as Side[]) for (const seg of strengthSegments(d, s, 0, end)) team[s][seg.s] += seg.b - seg.a;
  return { players, team };
}

export interface ShiftLine { shifts: number; toi: number; avg: number; longest: number }

/** Skater shifts per period (a shift crossing a period break counts in both). */
export function shiftsByPeriod(d: Derived, game: Game, side: Side): ShiftLine[] {
  const np = periodCount(d, game);
  const out: ShiftLine[] = Array.from({ length: np }, () => ({ shifts: 0, toi: 0, avg: 0, longest: 0 }));
  let ps = 0;
  const bounds: [number, number][] = [];
  for (let p = 1; p <= np; p++) { const len = (p <= game.rules.periods ? game.rules.periodMinutes : game.rules.otMinutes) * 60; bounds.push([ps, ps + len]); ps += len; }
  const skater = (sh: Shift) => sh.side === side && posOf(game, sh.player) !== 'G';
  for (const sh of d.shifts.filter(skater)) {
    bounds.forEach(([a, b], i) => {
      const ov = Math.min(sh.end, b) - Math.max(sh.start, a);
      if (ov > 0) { const l = out[i]; l.shifts++; l.toi += ov; l.longest = Math.max(l.longest, ov); }
    });
  }
  for (const l of out) l.avg = l.shifts ? l.toi / l.shifts : 0;
  return out;
}

/** Longest single shift per player. */
export function longestShifts(d: Derived): Map<string, number> {
  const m = new Map<string, number>();
  for (const sh of d.shifts) m.set(sh.player, Math.max(m.get(sh.player) ?? 0, sh.end - sh.start));
  return m;
}

/* ------------------------------------------------------------------ insights */

export type Tone = 'good' | 'bad' | 'watch' | 'exploit';
export type Area = 'Faceoffs' | 'Shots' | 'Special teams' | 'Discipline' | 'Goaltending' | 'Scoring' | 'Ice time';
export interface Insight { id: string; tone: Tone; area: Area; title: string; detail: string }

export interface PeriodReview {
  period: number; name: string; result: 'won' | 'lost' | 'even';
  score: [number, number]; good: string[]; bad: string[];
}

/** Draws needed before a faceoff rate is worth calling out. */
const MIN_DRAWS = 6;
const MIN_PLAYER_DRAWS = 4;

const ordinal = (n: number, g: Game) => periodName(n, g.rules);
const rec = (r: WL) => `${r.w}-${r.l}`;

/** Facts and suggestions for `focus` (the coach's team) from everything recorded so far. */
export function buildInsights(d: Derived, game: Game, focus: Side): Insight[] {
  const opp = other(focus);
  const mine = teamPeriods(d, game, focus), theirs = teamPeriods(d, game, opp);
  const M = totalLine(mine), T = totalLine(theirs);
  const out: Insight[] = [];
  const add = (tone: Tone, area: Area, title: string, detail: string) => out.push({ id: `${area}-${out.length}`, tone, area, title, detail });
  const name = (s: Side) => game[s].name || (s === 'home' ? 'Home' : 'Away');

  /* --- faceoffs --- */
  const fo = faceoffSummary(d, game, focus);
  const draws = fo.total.w + fo.total.l;
  if (draws >= MIN_DRAWS) {
    const p = pct(fo.total.w, fo.total.l);
    if (p >= 58) add('good', 'Faceoffs', `Winning the draw: ${p}%`, `${rec(fo.total)} on ${draws} draws — more possession to start each shift.`);
    else if (p <= 42) add('bad', 'Faceoffs', `Losing the draw: ${p}%`, `${rec(fo.total)} on ${draws} draws. Consider changing who takes them, or set up the wingers to win the puck on the loss.`);
  }
  const zs = (['OZ', 'NZ', 'DZ'] as Zone[]).map((z) => ({ z, r: fo.zones[z], n: fo.zones[z].w + fo.zones[z].l, p: pct(fo.zones[z].w, fo.zones[z].l) })).filter((x) => x.n >= 3);
  if (zs.length >= 2) {
    const best = [...zs].sort((a, b) => b.p - a.p)[0], worst = [...zs].sort((a, b) => a.p - b.p)[0];
    if (best.p - worst.p >= 20) add('watch', 'Faceoffs', `Zone gap: ${ZONE_LABEL[best.z]} ${best.p}% vs ${ZONE_LABEL[worst.z]} ${worst.p}%`, `${ZONE_LABEL[best.z]} ${rec(best.r)}, ${ZONE_LABEL[worst.z]} ${rec(worst.r)}. The weaker zone is where to put your best taker.`);
  }
  const dz = fo.zones.DZ;
  if (dz.w + dz.l >= 4 && pct(dz.w, dz.l) <= 40) add('bad', 'Faceoffs', 'Losing defensive-zone draws', `${rec(dz)} in your own end — those losses start shifts under pressure.`);
  const oz = fo.zones.OZ;
  if (oz.w + oz.l >= 4 && pct(oz.w, oz.l) >= 60) add('good', 'Faceoffs', 'Winning offensive-zone draws', `${rec(oz)} in the attacking end — set plays off the draw are working.`);

  const fps = faceoffPlayers(d, game, focus).filter((p) => p.total.w + p.total.l >= MIN_PLAYER_DRAWS);
  const byPct = [...fps].sort((a, b) => pct(b.total.w, b.total.l) - pct(a.total.w, a.total.l));
  if (byPct[0] && pct(byPct[0].total.w, byPct[0].total.l) >= 60) add('good', 'Faceoffs', `${label(game, byPct[0].id)} is your best on the dot`, `${rec(byPct[0].total)} (${pct(byPct[0].total.w, byPct[0].total.l)}%).`);
  const worst = byPct[byPct.length - 1];
  if (worst && byPct.length > 1 && pct(worst.total.w, worst.total.l) <= 40) add('bad', 'Faceoffs', `${label(game, worst.id)} is struggling on draws`, `${rec(worst.total)} (${pct(worst.total.w, worst.total.l)}%). Swap them out or have a winger ready to help.`);
  for (const f of fps) {
    const o = f.zones.OZ, de = f.zones.DZ;
    if (o.w + o.l >= 2 && de.w + de.l >= 2 && Math.abs(pct(o.w, o.l) - pct(de.w, de.l)) >= 40) {
      const offBetter = pct(o.w, o.l) > pct(de.w, de.l);
      add('watch', 'Faceoffs', `${label(game, f.id)} is better in the ${offBetter ? 'offensive' : 'defensive'} zone`, `Offensive ${rec(o)} · defensive ${rec(de)}. Use them where they win.`);
      break;
    }
  }
  const mx = faceoffMatrix(d, game, focus);
  const pairs = mx.rows.flatMap((r) => mx.cols.map((c) => ({ r, c, v: mx.cells[r]?.[c] }))).filter((x) => x.v && x.v.w + x.v.l >= 2) as { r: string; c: string; v: WL }[];
  for (const x of pairs.filter((p) => pct(p.v.w, p.v.l) <= 33).sort((a, b) => (b.v.l - b.v.w) - (a.v.l - a.v.w)).slice(0, 2)) add('bad', 'Faceoffs', `Matchup problem: ${label(game, x.r)} vs ${label(game, x.c)}`, `${rec(x.v)} head-to-head. Avoid this matchup if you can.`);
  for (const x of pairs.filter((p) => pct(p.v.w, p.v.l) >= 67).sort((a, b) => (b.v.w - b.v.l) - (a.v.w - a.v.l)).slice(0, 2)) add('exploit', 'Faceoffs', `Matchup edge: ${label(game, x.r)} vs ${label(game, x.c)}`, `${rec(x.v)} head-to-head. Get this matchup when you can.`);
  const theirPlayers = faceoffPlayers(d, game, opp).filter((p) => p.total.w + p.total.l >= MIN_PLAYER_DRAWS);
  const tb = [...theirPlayers].sort((a, b) => pct(b.total.w, b.total.l) - pct(a.total.w, a.total.l))[0];
  if (tb && pct(tb.total.w, tb.total.l) >= 65) add('watch', 'Faceoffs', `${label(game, tb.id)} owns the dot for ${name(opp)}`, `${rec(tb.total)} (${pct(tb.total.w, tb.total.l)}%). Expect a loss — cheat the winger in or send your strongest taker.`);
  const tw = [...theirPlayers].sort((a, b) => pct(a.total.w, a.total.l) - pct(b.total.w, b.total.l))[0];
  if (tw && theirPlayers.length > 1 && pct(tw.total.w, tw.total.l) <= 35) add('exploit', 'Faceoffs', `${label(game, tw.id)} is losing draws for ${name(opp)}`, `${rec(tw.total)} — attack them when they take it.`);

  /* --- shots --- */
  if (M.sog + T.sog >= 8) {
    const p = pct(M.sog, T.sog);
    if (p >= 58) add('good', 'Shots', `Controlling the shot clock: ${M.sog}–${T.sog}`, `${p}% of shots on goal.`);
    else if (p <= 42) add('bad', 'Shots', `Being outshot ${M.sog}–${T.sog}`, `Only ${p}% of the shots on goal — look at breakouts and turnovers.`);
  }
  const diffs = mine.map((l, i) => ({ i, diff: l.sog - theirs[i].sog, played: l.attempts + theirs[i].attempts > 0 }));
  const played = diffs.filter((x) => x.played);
  const wp = [...played].sort((a, b) => a.diff - b.diff)[0], bp = [...played].sort((a, b) => b.diff - a.diff)[0];
  if (played.length > 1 && wp.diff <= -4) add('bad', 'Shots', `${ordinal(wp.i + 1, game)} period was a struggle`, `Outshot ${mine[wp.i].sog}–${theirs[wp.i].sog}. Find out what changed (penalties, shift length, line matchups).`);
  if (played.length > 1 && bp.diff >= 4) add('good', 'Shots', `${ordinal(bp.i + 1, game)} period was the best`, `Outshot ${name(opp)} ${mine[bp.i].sog}–${theirs[bp.i].sog}. Whatever you did then — keep doing it.`);
  if (M.attempts >= 10 && M.blocked / M.attempts >= 0.3) add('watch', 'Shots', `${Math.round((M.blocked / M.attempts) * 100)}% of your shots are being blocked`, `${M.blocked} of ${M.attempts} attempts. Move the puck to open a lane, or shoot off the pass.`);
  if (T.attempts >= 10 && T.blocked / T.attempts >= 0.3) add('good', 'Shots', 'Blocking shots', `${T.blocked} of ${name(opp)}'s ${T.attempts} attempts blocked.`);
  if (M.attempts >= 10 && M.missed / M.attempts >= 0.35) add('watch', 'Shots', `${M.missed} shots missed the net`, `${Math.round((M.missed / M.attempts) * 100)}% of attempts — too many off target; aim for the corners, not the post.`);
  if (M.sog >= 10 && M.goals / M.sog <= 0.05) add('watch', 'Shots', 'Shots are not turning into goals', `${M.goals} on ${M.sog} (${pct(M.goals, M.sog - M.goals)}%). Look at shot quality and traffic in front.`);
  if (M.sog >= 8 && M.goals / M.sog >= 0.25) add('watch', 'Shots', 'Finishing at a hot rate', `${M.goals} goals on ${M.sog} shots — hard to sustain, so keep the volume up.`);
  const zm = shotZones(d, game, focus), zt = shotZones(d, game, opp);
  if (zm.located >= 6) {
    if (zm.slot / zm.located >= 0.5) add('good', 'Shots', 'Getting to the slot', `${zm.slot} of ${zm.located} located shots came from within ${SLOT_FT} ft of the net.`);
    else if (zm.outside / zm.located >= 0.5) add('watch', 'Shots', 'Mostly perimeter shots', `${zm.outside} of ${zm.located} located shots came from beyond ${MID_FT} ft. Drive the net for better chances.`);
  }
  if (zt.located >= 6 && zt.slot - zm.slot >= 3) add('bad', 'Shots', 'Giving up the slot', `${name(opp)} has ${zt.slot} slot shots to your ${zm.slot}. Protect the front of the net.`);
  if (zt.located >= 6 && zt.slot / zt.located <= 0.2 && T.sog >= 6) add('good', 'Shots', 'Keeping shooters outside', `Only ${zt.slot} of ${zt.located} located ${name(opp)} shots came from the slot.`);

  /* --- special teams & discipline --- */
  if (M.ppOpps >= 2) {
    const ppShots = d.shots.filter((s) => s.d.team === focus && s.d.strength === 'PP').length + d.goals.filter((g) => g.d.team === focus && g.d.strength === 'PP').length;
    if (M.ppGoals === 0) add('bad', 'Special teams', `Power play ${M.ppGoals}/${M.ppOpps}`, `No goals${ppShots ? ` on ${ppShots} power-play shots` : ''}. Tweak the setup or the unit.`);
    else if (M.ppGoals / M.ppOpps >= 0.33) add('good', 'Special teams', `Power play ${M.ppGoals}/${M.ppOpps}`, `${pct(M.ppGoals, M.ppOpps - M.ppGoals)}% conversion — keep drawing penalties.`);
  }
  if (T.ppOpps >= 2) {
    const kills = T.ppOpps - T.ppGoals;
    if (T.ppGoals >= 2) add('bad', 'Special teams', `Penalty kill ${kills}/${T.ppOpps}`, `${T.ppGoals} power-play goals against. Revisit the PK structure and who is on it.`);
    else if (kills / T.ppOpps >= 0.85) add('good', 'Special teams', `Penalty kill ${kills}/${T.ppOpps}`, 'Killing penalties well.');
  }
  if (M.pim - T.pim >= 4) add('bad', 'Discipline', `${M.pim} PIM to ${T.pim}`, 'You are giving the other team the power plays. Talk about stick penalties and retaliation.');
  else if (T.pim - M.pim >= 4) add('exploit', 'Discipline', `${name(opp)} has ${T.pim} PIM to your ${M.pim}`, 'They are taking the penalties — keep forcing them to defend.');
  const penCount = new Map<string, { n: number; pim: number }>();
  for (const p of d.penalties) if (p.d.team === focus && p.d.player) { const c = penCount.get(p.d.player) ?? { n: 0, pim: 0 }; c.n++; c.pim += p.d.minutes; penCount.set(p.d.player, c); }
  for (const [id, c] of penCount) if (c.n >= 2) add('watch', 'Discipline', `${label(game, id)} has ${c.n} penalties`, `${c.pim} PIM. Consider a word, or fewer shifts.`);
  const kinds = new Map<string, number>();
  for (const p of d.penalties) if (p.d.team === focus) kinds.set(p.d.label, (kinds.get(p.d.label) ?? 0) + 1);
  const topKind = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topKind && topKind[1] >= 2) add('watch', 'Discipline', `Repeat penalty: ${topKind[0]} ×${topKind[1]}`, 'The same infraction keeps coming up.');

  /* --- goaltending --- */
  const goalieLine = (s: Side) => game[s].players.filter((p) => p.pos === 'G').reduce((a, p) => { const t = d.players.get(p.id); return t ? { sa: a.sa + t.sa, sv: a.sv + t.sv } : a; }, { sa: 0, sv: 0 });
  const gm = goalieLine(focus), gt = goalieLine(opp);
  const svp = (g: { sa: number; sv: number }) => (g.sa ? g.sv / g.sa : 0);
  if (gm.sa >= 8) {
    if (svp(gm) >= 0.92) add('good', 'Goaltending', `Goalie is sharp: ${svp(gm).toFixed(3).replace(/^0/, '')}`, `${gm.sv} saves on ${gm.sa} shots.`);
    else if (svp(gm) <= 0.88) add('bad', 'Goaltending', `Save percentage ${svp(gm).toFixed(3).replace(/^0/, '')}`, `${gm.sa - gm.sv} goals on ${gm.sa} shots. Check rebounds and where the goals are coming from.`);
  }
  if (gt.sa >= 8 && svp(gt) <= 0.85) add('exploit', 'Goaltending', `${name(opp)} goalie is shaky: ${svp(gt).toFixed(3).replace(/^0/, '')}`, `${gt.sa - gt.sv} goals on ${gt.sa} shots — keep shooting and go for rebounds.`);

  /* --- scoring timing --- */
  const len = (p: number) => (p <= game.rules.periods ? game.rules.periodMinutes : game.rules.otMinutes) * 60;
  const late = (g: { ev: { period: number; clock: number } }) => g.ev.clock <= 120;
  const early = (g: { ev: { period: number; clock: number } }) => len(g.ev.period) - g.ev.clock <= 120;
  const against = d.goals.filter((g) => g.d.team === opp), forGoals = d.goals.filter((g) => g.d.team === focus);
  if (against.filter(late).length >= 2) add('bad', 'Scoring', 'Giving up goals late in periods', `${against.filter(late).length} goals against in the last 2:00 of a period. Manage the clock and change lines carefully.`);
  if (against.filter(early).length >= 2) add('bad', 'Scoring', 'Slow starts', `${against.filter(early).length} goals against in the first 2:00 of a period.`);
  if (forGoals.filter(late).length >= 2) add('good', 'Scoring', 'Finishing periods strong', `${forGoals.filter(late).length} goals in the last 2:00 of a period.`);
  if (forGoals.filter(early).length >= 2) add('good', 'Scoring', 'Fast starts', `${forGoals.filter(early).length} goals in the first 2:00 of a period.`);

  /* --- ice time --- */
  const longest = longestShifts(d);
  for (const p of game[focus].players) {
    const st = d.players.get(p.id);
    if (!st || p.pos === 'G' || st.shifts < 3) continue;
    const avg = st.toi / st.shifts;
    if (avg >= 80) add('watch', 'Ice time', `${label(game, p.id)} is staying out long`, `Average shift ${Math.floor(avg / 60)}:${String(Math.round(avg % 60)).padStart(2, '0')} (longest ${Math.floor((longest.get(p.id) ?? 0) / 60)}:${String(Math.round((longest.get(p.id) ?? 0) % 60)).padStart(2, '0')}). Shorter shifts keep legs fresh.`);
  }
  const t = iceTime(d).team[focus], tot = t.ev + t.pp + t.pk;
  if (tot > 0 && t.pk / tot >= 0.2) add('watch', 'Ice time', `${Math.round((t.pk / tot) * 100)}% of the game spent short-handed`, 'That much penalty killing wears out the PK unit.');
  return out;
}

/** What each period looked like for `focus`: the result and what drove it. */
export function periodReviews(d: Derived, game: Game, focus: Side): PeriodReview[] {
  const opp = other(focus);
  const mine = teamPeriods(d, game, focus), theirs = teamPeriods(d, game, opp);
  const reviews: PeriodReview[] = [];
  mine.forEach((m, i) => {
    const t = theirs[i];
    const period = i + 1;
    const any = m.attempts + t.attempts + m.fow + m.fol + m.pim + t.pim + m.goals + t.goals;
    if (!any && period > d.clock.period) return;
    const good: string[] = [], bad: string[] = [];
    if (m.goals > t.goals) good.push(`Won the period ${m.goals}–${t.goals}`);
    else if (m.goals < t.goals) bad.push(`Lost the period ${m.goals}–${t.goals}`);
    if (m.sog - t.sog >= 3) good.push(`Outshot them ${m.sog}–${t.sog}`);
    else if (t.sog - m.sog >= 3) bad.push(`Outshot ${m.sog}–${t.sog}`);
    if (m.fow + m.fol >= 4) {
      const p = pct(m.fow, m.fol);
      if (p >= 58) good.push(`Won ${p}% of faceoffs (${m.fow}-${m.fol})`);
      else if (p <= 42) bad.push(`Won only ${p}% of faceoffs (${m.fow}-${m.fol})`);
    }
    if (m.ppGoals) good.push(`${m.ppGoals} power-play goal${m.ppGoals > 1 ? 's' : ''}`);
    else if (m.ppOpps >= 2) bad.push(`No goals on ${m.ppOpps} power plays`);
    if (m.shGoals) good.push(`${m.shGoals} short-handed goal${m.shGoals > 1 ? 's' : ''}`);
    if (t.ppGoals) bad.push(`${t.ppGoals} power-play goal${t.ppGoals > 1 ? 's' : ''} against`);
    if (m.pim - t.pim >= 4) bad.push(`${m.pim} PIM to ${t.pim}`);
    else if (t.pim - m.pim >= 4) good.push(`Drew penalties: ${t.pim} PIM to ${m.pim}`);
    if (m.blocks >= 4) good.push(`${m.blocks} blocked shots`);
    const result = m.goals > t.goals ? 'won' : m.goals < t.goals ? 'lost' : m.sog - t.sog >= 3 ? 'won' : t.sog - m.sog >= 3 ? 'lost' : 'even';
    reviews.push({ period, name: periodName(period, game.rules), result, score: [m.goals, t.goals], good, bad });
  });
  return reviews;
}
