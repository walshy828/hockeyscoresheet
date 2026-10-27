import type { Game, Player, Roster, Side } from './types.ts';

/** Saved line combinations for one team. Slots hold player ids ('' = empty). */
export interface LineSet { F: string[][]; D: string[][]; PP: string[][]; PK: string[][] }
export type LineKind = keyof LineSet;
export type Lines = Record<Side, LineSet>;

export const LINE_KINDS: LineKind[] = ['F', 'D', 'PP', 'PK'];
export const LINE_SIZE: Record<LineKind, number> = { F: 3, D: 2, PP: 5, PK: 4 };
export const LINE_LABEL: Record<LineKind, string> = { F: 'Forward lines', D: 'Defense pairs', PP: 'Power play', PK: 'Penalty kill' };
/** Lines shown (empty) before the user adds more. */
const DEFAULT_COUNT: Record<LineKind, number> = { F: 3, D: 3, PP: 2, PK: 2 };

export const emptyLineSet = (): LineSet => {
  const out = {} as LineSet;
  for (const k of LINE_KINDS) out[k] = Array.from({ length: DEFAULT_COUNT[k] }, () => []);
  return out;
};
export const emptyLines = (): Lines => ({ home: emptyLineSet(), away: emptyLineSet() });

/** Normalised line set (older games have none). Drops ids that are no longer on the roster. */
export function lineSetFor(lines: Lines | undefined, side: Side, roster: Player[]): LineSet {
  const have = new Set(roster.map((p) => p.id));
  const src = lines?.[side] ?? emptyLineSet();
  const out = {} as LineSet;
  for (const k of LINE_KINDS) out[k] = (src[k] ?? []).map((l) => l.map((id) => (have.has(id) ? id : '')));
  return out;
}

export const isForward = (pos?: string) => pos !== 'D' && pos !== 'G';
export const isSkater = (pos?: string) => pos !== 'G';

/** Players to take off / put on so that the in-scope players on the ice become exactly `target`. */
export function planSwap(onIce: Iterable<string>, target: string[], inScope: (id: string) => boolean) {
  const cur = new Set(onIce);
  const tgt = new Set(target);
  return { off: [...cur].filter((id) => inScope(id) && !tgt.has(id)), on: target.filter((id) => !cur.has(id)) };
}

/** How many skaters a PK/PP unit should put out: PK shrinks when the team is further short-handed. */
export function unitSize(kind: LineKind, skatersOnIce: number, menDown: number): number {
  if (kind === 'PK') return Math.max(3, skatersOnIce - Math.min(2, Math.max(0, menDown)));
  return skatersOnIce;
}

const hasLines = (s?: LineSet) => !!s && LINE_KINDS.some((k) => (s[k] ?? []).some((l) => l.some(Boolean)));

/**
 * Most recent earlier game (by date) in which this team saved any lines. Teams match by library id,
 * falling back to a case-insensitive name for opponents that aren't in My teams.
 */
export function findPriorLines(games: Game[], roster: Roster, excludeId?: string, before?: string): { game: Game; side: Side } | null {
  const name = roster.name.trim().toLowerCase();
  let best: { game: Game; side: Side } | null = null;
  for (const g of games) {
    if (g.deleted || g.id === excludeId || (before && g.date >= before)) continue;
    for (const side of ['home', 'away'] as Side[]) {
      const r = g[side];
      const same = roster.teamId ? r.teamId === roster.teamId : !r.teamId && !!name && r.name.trim().toLowerCase() === name;
      if (!same || !hasLines(g.lines?.[side])) continue;
      if (!best || g.date > best.game.date) best = { game: g, side };
    }
  }
  return best;
}

/** Copy a past game's lines onto a new roster. Players are matched by id, then by number + name; unmatched slots are emptied. */
export function carryLineSet(prev: LineSet, prevRoster: Player[], roster: Player[]): LineSet {
  const map = new Map<string, string>();
  for (const p of prevRoster) {
    const m = roster.find((c) => c.id === p.id) ?? roster.find((c) => c.number === p.number && c.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (m) map.set(p.id, m.id);
  }
  const out = {} as LineSet;
  for (const k of LINE_KINDS) out[k] = (prev[k] ?? []).map((l) => l.map((id) => map.get(id) ?? ''));
  return out;
}
