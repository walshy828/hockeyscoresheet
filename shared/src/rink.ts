import type { Game, Side, Strength } from './types.ts';

/** Faceoff dots in rink coordinates (200 x 85, horizontal). Ids are stable; they are stored on events. */
export interface FaceoffDot { id: string; x: number; y: number; label: string }

const zone = (x: number) => (x < 75 ? 'Left end' : x > 125 ? 'Right end' : x === 100 ? 'Center' : x < 100 ? 'Left neutral' : 'Right neutral');
const mk = (id: string, x: number, y: number): FaceoffDot => ({ id, x, y, label: x === 100 ? 'Center ice' : `${zone(x)} · ${y < 42.5 ? 'upper' : 'lower'}` });

export const FACEOFF_DOTS: FaceoffDot[] = [
  mk('EL-U', 31, 20.5), mk('EL-L', 31, 64.5),
  mk('NL-U', 80, 20.5), mk('NL-L', 80, 64.5),
  mk('C', 100, 42.5),
  mk('NR-U', 120, 20.5), mk('NR-L', 120, 64.5),
  mk('ER-U', 169, 20.5), mk('ER-L', 169, 64.5),
];

export const dotById = (id?: string | null) => (id ? FACEOFF_DOTS.find((d) => d.id === id) : undefined);

export function nearestDot(x: number, y: number): FaceoffDot {
  return FACEOFF_DOTS.reduce((best, d) => (Math.hypot(d.x - x, d.y - y) < Math.hypot(best.x - x, best.y - y) ? d : best));
}

export const STRENGTH_INFO: Record<Strength, string> = {
  EV: 'Even strength — both teams at full strength',
  PP: 'Power play — scored while the other team is short-handed',
  SH: 'Short-handed — scored while your team is down a player',
  EN: 'Empty net — scored on a net with the goalie pulled',
  PS: 'Penalty shot / shootout',
};

/**
 * The rink is drawn the same way all game: each team owns one end (its defensive zone) regardless of period,
 * so shots at a team's net always land on that team's end.
 */
export function rinkEnds(game: Pick<Game, 'homeOnLeft'> & { home?: { name?: string }; away?: { name?: string } }) {
  const homeLeft = game.homeOnLeft ?? true;
  const leftTeam: Side = homeLeft ? 'home' : 'away';
  const rightTeam: Side = homeLeft ? 'away' : 'home';
  const label = (s: Side) => game[s]?.name?.trim() || (s === 'home' ? 'HOME' : 'AWAY');
  return { leftTeam, rightTeam, leftLabel: label(leftTeam), rightLabel: label(rightTeam) };
}

/** The team defending the end of the rink containing `x`; a shot taken there comes from the other team. */
export function defenderAt(game: Pick<Game, 'homeOnLeft'>, x: number): Side {
  const { leftTeam, rightTeam } = rinkEnds(game);
  return x >= 100 ? rightTeam : leftTeam;
}
