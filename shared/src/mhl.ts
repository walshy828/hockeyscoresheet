/**
 * MyHockeyLive (MIAA section) adapter: pure HTML parsers plus the stat comparison.
 * MyHockeyLive is the public site that carries MIAA rosters, schedules, standings and player stats
 * for every boys and girls ice hockey program in Massachusetts.
 */
import type { Position } from './types.ts';

export const MHL_BASE = 'https://www.myhockeylive.com';

export interface ExtTeamRef { ref: string; name: string; gender: 'Boys' | 'Girls' | '' }
export interface ExtLeague { id: string; name: string }
export interface ExtPlayer { number: string; name: string; year: string; pos: Position; gp?: number; g?: number; a?: number; pts?: number; pim?: number }
export interface ExtTeam {
  provider: 'myhockeylive';
  ref: string;
  name: string;
  season: string;
  url: string;
  players: ExtPlayer[];
}

const decode = (s: string) =>
  s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export const REF_RE = /^\d+-[a-z0-9-]+$/;
export const LEAGUE_RE = /^\d+-[a-z0-9-]+$/;
export const SEASON_RE = /^\d{4}-\d{2}$/;

export const teamUrl = (ref: string) => `${MHL_BASE}/miaa/teams/${ref}`;

export function parseDirectory(html: string): ExtTeamRef[] {
  const out: ExtTeamRef[] = [];
  const re = /<strong><a href="\/miaa\/teams\/(\d+-[a-z0-9-]+)">([^<]+)<\/a><\/strong>\s*(?:–|&ndash;|-)?\s*(Boys|Girls)?/g;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) out.push({ ref: m[1], name: decode(m[2]), gender: (m[3] as 'Boys' | 'Girls') ?? '' });
  return out;
}

export function parseLeagues(html: string): ExtLeague[] {
  const seen = new Map<string, string>();
  const re = /league=(\d+-[a-z0-9-]+)(?:&amp;season=[\d-]+)?"><span class='icon-clipboard'><\/span>\s*([^<]+)</g;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) if (!seen.has(m[1])) seen.set(m[1], decode(m[2]));
  return [...seen].map(([id, name]) => ({ id, name }));
}

const POS: Record<string, Position> = { C: 'C', LW: 'LW', RW: 'RW', W: 'LW', D: 'D', G: 'G', F: 'F' };
const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));

export function parseTeamPage(html: string, ref: string): ExtTeam {
  const title = /<title>[^<]*?–\s*([^<]+)<\/title>/.exec(html)?.[1] ?? '';
  const h1 = /<article class="team full">\s*<h1>([^<]+)<\/h1>/.exec(html)?.[1] ?? title;
  const full = decode(h1);
  const season = /(\d{4}-\d{2})\s*$/.exec(full)?.[1] ?? '';
  const name = full.replace(/\s*\d{4}-\d{2}\s*$/, '').trim();
  const table = /<table class="player_stats"[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1] ?? '';
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? '';
  const players: ExtPlayer[] = [];
  for (const row of body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const c = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
    if (c.length < 4 || !c[1]) continue;
    players.push({ number: c[0], name: c[1], year: c[2], pos: POS[c[3].toUpperCase()] ?? 'F', gp: num(c[4] ?? ''), g: num(c[5] ?? ''), a: num(c[6] ?? ''), pts: num(c[7] ?? ''), pim: num(c[8] ?? '') });
  }
  return { provider: 'myhockeylive', ref, name, season, url: teamUrl(ref), players };
}

/* ---------- comparison ---------- */

export interface LocalLine { number: string; name: string; gp: number; g: number; a: number; pim: number }
export type CompareKind = 'match' | 'diff' | 'onlyApp' | 'onlyOnline';
export interface CompareRow {
  kind: CompareKind;
  number: string;
  name: string;
  nameOnline?: string;
  app?: LocalLine;
  online?: ExtPlayer;
  /** stat columns that disagree (online blanks count as 0) */
  diffs: Array<'gp' | 'g' | 'a' | 'pim'>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Match by jersey number; a differing name is flagged through `nameOnline`. */
export function compareStats(local: LocalLine[], online: ExtPlayer[]): CompareRow[] {
  const on = new Map(online.map((p) => [p.number, p]));
  const rows: CompareRow[] = [];
  for (const l of local) {
    const o = on.get(l.number);
    on.delete(l.number);
    if (!o) { rows.push({ kind: 'onlyApp', number: l.number, name: l.name, app: l, diffs: [] }); continue; }
    const diffs = (['gp', 'g', 'a', 'pim'] as const).filter((k) => (o[k] ?? 0) !== l[k]);
    rows.push({ kind: diffs.length ? 'diff' : 'match', number: l.number, name: l.name, nameOnline: norm(o.name) === norm(l.name) ? undefined : o.name, app: l, online: o, diffs });
  }
  for (const o of on.values()) rows.push({ kind: 'onlyOnline', number: o.number, name: o.name, online: o, diffs: [] });
  return rows.sort((a, b) => Number(a.number) - Number(b.number) || a.number.localeCompare(b.number));
}
