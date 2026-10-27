import type { Game, GameEvent, Player, Side } from '../../shared/src/types.ts';
import { fmtClock } from '../../shared/src/derive.ts';
import { periodName } from '../../shared/src/rules.ts';
import { dotById } from '../../shared/src/rink.ts';
import { shortLabel } from './playerDisplay.ts';

export const sideName = (g: Game, s: Side) => g[s].name || (s === 'home' ? 'Home' : 'Away');

export function findPlayer(g: Game, id?: string): { p: Player; side: Side } | undefined {
  if (!id) return undefined;
  for (const side of ['home', 'away'] as Side[]) {
    const p = g[side].players.find((x) => x.id === id);
    if (p) return { p, side };
  }
}

export function pLabel(g: Game, id?: string, short = false): string {
  const f = findPlayer(g, id);
  if (!f) return id ? '#?' : '';
  return short ? shortLabel(f.p) : `#${f.p.number}${f.p.name ? ' ' + f.p.name : ''}`;
}

/** Home/away players in a faceoff, derived from winner team + winner/loser ids. */
export function faceoffSides(d: { team: Side; player?: string | null; loser?: string | null }) {
  const w = d.player || undefined, l = d.loser || undefined;
  return { home: d.team === 'home' ? w : l, away: d.team === 'away' ? w : l, winner: d.team };
}

export function timeLabel(g: Game, e: GameEvent) {
  return `${periodName(e.period, g.rules)} ${fmtClock(e.clock)}`;
}

export function describe(g: Game, e: GameEvent): { title: string; team?: Side; sub?: string } {
  const d = e.data;
  switch (e.type) {
    case 'goal': {
      const a = (d.assists ?? []).filter(Boolean).map((x: string) => pLabel(g, x, true));
      return { team: d.team, title: `GOAL ${sideName(g, d.team)} ${d.scorer ? pLabel(g, d.scorer) : '(scorer not set)'}`, sub: `${d.strength}${a.length ? ' · A: ' + a.join(', ') : ' · unassisted'}` };
    }
    case 'shot': {
      const r = d.result === 'save' ? 'Shot on goal' : d.result === 'miss' ? 'Shot missed' : 'Shot blocked';
      const sub = [d.blocker ? `blocked by ${pLabel(g, d.blocker, true)}` : '', d.strength && d.strength !== 'EV' ? d.strength : ''].filter(Boolean).join(' · ');
      return { team: d.team, title: `${r} ${sideName(g, d.team)}${d.player ? ' ' + pLabel(g, d.player) : ''}`, sub: sub || undefined };
    }
    case 'faceoff':
      return { team: d.team, title: `Faceoff won ${sideName(g, d.team)}${d.player ? ' ' + pLabel(g, d.player) : ''}`, sub: [d.loser ? `vs ${pLabel(g, d.loser, true)}` : '', dotById(d.dot)?.label ?? ''].filter(Boolean).join(' · ') || undefined };
    case 'penalty':
      return { team: d.team, title: `PENALTY ${sideName(g, d.team)}${d.player ? ' ' + pLabel(g, d.player) : ''}`, sub: [`${d.label} · ${d.minutes} min${d.noPP ? ' · no power play' : ''}`, d.servedBy ? `served by ${pLabel(g, d.servedBy, true)}` : '', d.notes].filter(Boolean).join(' · ') };
    case 'penaltyEnd':
      return { team: d.team, title: `Penalty removed ${sideName(g, d.team)}` };
    case 'shift':
      return { team: d.team, title: `${d.action === 'on' ? 'On ice' : 'Off ice'} ${pLabel(g, d.player)}` };
    case 'goalie':
      return { team: d.team, title: d.player ? `Goalie ${sideName(g, d.team)} ${pLabel(g, d.player)}` : `Goalie pulled ${sideName(g, d.team)}` };
    case 'timeout':
      return { team: d.team, title: `Timeout ${sideName(g, d.team)}` };
    case 'note':
      return { title: d.audioId ? '🎙 Voice note' : '📝 Note', sub: d.text };
    case 'clock':
      return { title: d.running ? 'Clock started' : 'Clock stopped' };
    default:
      return { title: e.type };
  }
}
