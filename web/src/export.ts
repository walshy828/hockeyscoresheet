import type { Game, GameEvent } from '../../shared/src/types.ts';
import { derive, fmtClock, fmtToi, type Derived } from '../../shared/src/derive.ts';
import { periodName } from '../../shared/src/rules.ts';
import { describe, pLabel, sideName } from './describe.ts';

const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;

export function eventsCsv(g: Game, events: GameEvent[]): string {
  const d = derive(events, g);
  const rows = [['period', 'clock', 'type', 'team', 'detail', 'x', 'y'].join(',')];
  for (const e of d.events) {
    const x = describe(g, e);
    rows.push([periodName(e.period, g.rules), fmtClock(e.clock), e.type, x.team ? sideName(g, x.team) : '', x.title + (x.sub ? ' | ' + x.sub : ''), e.data.x ?? '', e.data.y ?? ''].map(q).join(','));
  }
  return rows.join('\n');
}

export function playersCsv(g: Game, events: GameEvent[]): string {
  const d = derive(events, g);
  const rows = [['team', 'number', 'name', 'pos', 'G', 'A', 'PTS', 'SOG', '+/-', 'PIM', 'FOW', 'FOL', 'TOI'].join(',')];
  for (const s of ['home', 'away'] as const) for (const p of g[s].players) {
    const t = d.players.get(p.id);
    if (!t) continue;
    rows.push([sideName(g, s), p.number, p.name, p.pos, t.g, t.a, t.g + t.a, t.sog, t.pm, t.pim, t.fow, t.fol, fmtToi(t.toi)].map(q).join(','));
  }
  return rows.join('\n');
}

export function summaryText(g: Game, events: GameEvent[], link?: string): string {
  const d: Derived = derive(events, g);
  const L: string[] = [];
  const h = sideName(g, 'home'), a = sideName(g, 'away');
  L.push(`${a} ${d.score.away} @ ${h} ${d.score.home}${g.status === 'final' ? ' (Final)' : ''}`);
  L.push(`${g.date.replace('T', ' ')}${g.venue ? ' · ' + g.venue : ''}`);
  L.push('', 'Score by period:');
  for (let p = 0; p < Math.max(g.rules.periods, d.clock.period); p++) L.push(`  ${periodName(p + 1, g.rules)}: ${a} ${d.byPeriod.goals.away[p]} – ${h} ${d.byPeriod.goals.home[p]}`);
  L.push(`Shots: ${a} ${d.byPeriod.sog.away.reduce((x, y) => x + y, 0)} – ${h} ${d.byPeriod.sog.home.reduce((x, y) => x + y, 0)}`);
  L.push('', 'Scoring:');
  for (const gl of d.goals) L.push(`  ${periodName(gl.ev.period, g.rules)} ${fmtClock(gl.ev.clock)} ${sideName(g, gl.d.team)} ${pLabel(g, gl.d.scorer, true)} (${gl.d.strength})${gl.d.assists?.length ? ' A: ' + gl.d.assists.map((x) => pLabel(g, x, true)).join(', ') : ''}${gl.goalie !== undefined ? ` vs ${gl.goalie ? 'G ' + pLabel(g, gl.goalie, true) : 'empty net'}` : ''}`);
  L.push('', 'Penalties:');
  for (const p of d.penalties) L.push(`  ${periodName(p.ev.period, g.rules)} ${fmtClock(p.ev.clock)} ${sideName(g, p.d.team)} ${pLabel(g, p.d.player, true)} ${p.d.label} ${p.d.minutes}min`);
  if (link) L.push('', `Live/box score: ${link}`);
  return L.join('\n');
}

export const viewLink = (g: Game) => `${location.origin}/v/${g.viewToken}`;

export function gameJson(g: Game, events: GameEvent[]) {
  return JSON.stringify({ app: 'hockeyscoresheet', version: 1, exported: new Date().toISOString(), games: [g], events: events.map(({ ...e }) => { delete (e as any).synced; return e; }), teams: [], secrets: [] });
}
