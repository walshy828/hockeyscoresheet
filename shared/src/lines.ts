import type { Player, Side } from './types.ts';

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
