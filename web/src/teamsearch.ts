import { useLiveQuery } from 'dexie-react-hooks';
import type { Team } from '../../shared/src/types.ts';
import { db, kvGet, kvSet } from './db.ts';

const MY_TEAM = 'myTeamId';

/** The team the scorekeeper follows; every tracked game should include it. */
export function useMyTeamId(): string | undefined {
  return useLiveQuery(() => kvGet<string>(MY_TEAM, ''), [])?.valueOf() || undefined;
}
export const setMyTeamId = (id: string | undefined) => kvSet(MY_TEAM, id ?? '');

/** Does the team's name, league, or any player's name/number match the query? */
export function teamMatches(t: Team, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return `${t.name} ${t.league ?? ''}`.toLowerCase().includes(n)
    || t.players.some((p) => p.name.toLowerCase().includes(n) || p.number === n.replace(/^#/, ''));
}

/** My team first, then favorites, then A–Z. */
export function sortTeams(teams: Team[], myId?: string): Team[] {
  const rank = (t: Team) => (t.id === myId ? 0 : t.favorite ? 1 : 2);
  return [...teams].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function useMyTeam(): Team | undefined {
  return useLiveQuery(async () => { const id = await kvGet<string>(MY_TEAM, ''); return id ? db.teams.get(id) : undefined; }, []);
}
