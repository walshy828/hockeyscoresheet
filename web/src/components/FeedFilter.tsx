import { useEffect, useMemo, useState } from 'react';
import type { GameEvent, Side } from '../../../shared/src/types.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { sideName } from '../describe.ts';
import { sortPlayers } from './ui.tsx';

export interface Filter { type: string; team: 'all' | Side; period: number | 'all'; player: string }
export const NO_FILTER: Filter = { type: 'all', team: 'all', period: 'all', player: 'all' };

const TYPES = [['all', 'All'], ['goal', 'Goal'], ['shot', 'Shot'], ['penalty', 'Penalty'], ['faceoff', 'Faceoff']] as const;

/** every player id an event mentions (scorer, assists, shooter, blocker, penalised, faceoff pair) */
function involved(e: GameEvent): string[] {
  const x = e.data;
  return [x.scorer, ...(x.assists ?? []), x.player, x.blocker, x.loser, x.servedBy].filter(Boolean);
}

export function matches(e: GameEvent, f: Filter): boolean {
  if (f.type !== 'all' && e.type !== f.type) return false;
  if (f.team !== 'all' && e.data.team !== f.team) return false;
  if (f.period !== 'all' && e.period !== f.period) return false;
  if (f.player !== 'all' && !involved(e).includes(f.player)) return false;
  return true;
}

export const activeCount = (f: Filter) => (Object.keys(NO_FILTER) as (keyof Filter)[]).filter((k) => f[k] !== NO_FILTER[k]).length;

/** Floating filter button that opens an overlaid pane; one filter drives both the feed and the rink. */
export function FeedFilter({ value, onChange, inline }: { value: Filter; onChange: (f: Filter) => void; inline?: boolean }) {
  const { game, d } = useGame();
  const [open, setOpen] = useState(false);
  const n = activeCount(value);
  const set = (p: Partial<Filter>) => onChange({ ...value, ...p });

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const periods = useMemo(() => [...new Set(d.events.map((e) => e.period))].sort((a, b) => a - b), [d]);
  const players = useMemo(() => {
    const sides: Side[] = value.team === 'all' ? ['home', 'away'] : [value.team];
    return sides.flatMap((s) => sortPlayers(game[s].players.filter((p) => !p.scratched)).map((p) => ({ ...p, side: s })));
  }, [game, value.team]);

  const pickTeam = (team: Filter['team']) => {
    // drop a player pick that belongs to the other team
    const keep = value.player === 'all' || team === 'all' || game[team].players.some((p) => p.id === value.player);
    onChange({ ...value, team, player: keep ? value.player : 'all' });
  };

  return (
    <>
      <button className={`ff-btn ${inline ? 'inline' : ''} ${n ? 'on' : ''}`} aria-label={n ? `Filter (${n} active)` : 'Filter'} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" fill={n ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        {n > 0 && <span className="ff-badge">{n}</span>}
      </button>
      {open && (
        <>
          <div className="ff-scrim" onClick={() => setOpen(false)} />
          <div className="ff-pane" role="dialog" aria-label="Filter events">
            <div className="ff-head"><b>Filter</b>
              <button className="btn sm" disabled={!n} onClick={() => { onChange(NO_FILTER); setOpen(false); }}>Clear</button>
              <button className="btn sm primary" onClick={() => setOpen(false)}>Filter</button>
            </div>
            <label className="ff-l">Type</label>
            <div className="seg">
              {TYPES.map(([k, l]) => <button key={k} className={value.type === k ? 'on' : ''} onClick={() => set({ type: k })}>{l}</button>)}
            </div>
            <label className="ff-l">Team</label>
            <div className="seg">
              {([['all', 'All teams'], ['home', sideName(game, 'home')], ['away', sideName(game, 'away')]] as const).map(([k, l]) => <button key={k} className={`${k !== 'all' ? k : ''} ${value.team === k ? 'on' : ''}`} onClick={() => pickTeam(k)}>{l}</button>)}
            </div>
            <div className="ff-two">
              <div>
                <label className="ff-l" htmlFor="ff-per">Period</label>
                <select id="ff-per" value={value.period} onChange={(e) => set({ period: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
                  <option value="all">All periods</option>
                  {periods.map((p) => <option key={p} value={p}>{periodName(p, game.rules)}</option>)}
                </select>
              </div>
              <div>
                <label className="ff-l" htmlFor="ff-pl">Player</label>
                <select id="ff-pl" value={value.player} onChange={(e) => set({ player: e.target.value })}>
                  <option value="all">All players</option>
                  {players.map((p) => <option key={p.id} value={p.id}>{value.team === 'all' ? `${sideName(game, p.side).slice(0, 4)} · ` : ''}#{p.number} {p.name} · {p.pos}</option>)}
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
