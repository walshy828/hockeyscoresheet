import type { Player, Position } from '../../shared/src/types.ts';
import { uid } from './ids.ts';

const POS_MAP: Record<string, Position> = { C: 'C', CENTER: 'C', LW: 'LW', RW: 'RW', W: 'LW', WING: 'LW', D: 'D', DEF: 'D', DMAN: 'D', G: 'G', GK: 'G', GOALIE: 'G', F: 'F', FWD: 'F' };

/** Parse pasted roster lines: "12 Jane Smith C", "#9, Bob Lee, D", "30 Goalie Guy G". */
export function parseRoster(text: string): Player[] {
  const out: Player[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^#/, '');
    if (!line) continue;
    const parts = line.split(/[,\t]+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
    let toks = parts.length >= 2 ? parts : line.split(/\s+/);
    const num = toks.shift()!.replace(/^#/, '');
    if (!/^\d{1,3}$/.test(num)) continue;
    let pos: Position = 'F';
    const last = toks[toks.length - 1]?.toUpperCase();
    if (last && POS_MAP[last] && toks.length > 1) { pos = POS_MAP[last]; toks = toks.slice(0, -1); }
    out.push({ id: uid(), number: num, name: toks.join(' ').trim(), pos });
  }
  return out;
}

export interface RosterSync { players: Player[]; added: number; updated: number; kept: number }

/**
 * Pull a team's current roster into a game's roster copy without losing history.
 * Players match by id (games copy team ids), else by jersey number. Matched players take the team's
 * number/name/pos/captain but keep their per-game `scratched` flag. Team players not in the game are
 * added. Game players missing from the team are kept, since events may reference them.
 */
export function syncRoster(game: Player[], team: Player[]): RosterSync {
  const out = game.map((p) => ({ ...p }));
  const claimed = new Set<string>();
  let added = 0, updated = 0;
  const same = (a: Player, b: Player) => a.number === b.number && a.name === b.name && a.pos === b.pos && a.captain === b.captain;
  const apply = (g: Player, t: Player) => {
    claimed.add(g.id);
    if (!same(g, t)) { updated++; g.number = t.number; g.name = t.name; g.pos = t.pos; g.captain = t.captain; }
  };
  const rest: Player[] = [];
  for (const t of team) {
    const g = out.find((x) => x.id === t.id);
    if (g) apply(g, t); else rest.push(t);
  }
  for (const t of rest) {
    const g = t.number ? out.find((x) => !claimed.has(x.id) && !team.some((y) => y.id === x.id) && x.number === t.number) : undefined;
    if (g) apply(g, t); else { out.push({ ...t, scratched: undefined }); claimed.add(t.id); added++; }
  }
  return { players: out, added, updated, kept: out.filter((p) => !claimed.has(p.id)).length };
}
