import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, saveGame } from '../db.ts';
import { token, uid } from '../ids.ts';
import { DEFAULT_PRESET, PRESETS } from '../../../shared/src/rules.ts';
import type { Game, Roster, Team } from '../../../shared/src/types.ts';
import { toast } from '../components/ui.tsx';
import { useMyTeamId } from '../teamsearch.ts';

const GAMES = 20;
const thisSeason = () => { const y = new Date().getFullYear(); return `${y}-${String(y + 1).slice(2)}`; };
const asRoster = (t: Team): Roster => ({ teamId: t.id, name: t.name, color: t.color, players: t.players.map((p) => ({ ...p })) });

interface Row { opp: string; home: boolean; date: string }
const blankRows = (): Row[] => Array.from({ length: GAMES }, () => ({ opp: '', home: true, date: '' }));

/** Enter a whole season at once: one row per game for my team. Each filled row becomes a scheduled game. */
export function Schedule() {
  const nav = useNavigate();
  const myId = useMyTeamId();
  const teams = (useLiveQuery(() => db.teams.toArray(), []) ?? []).filter((t) => !t.deleted);
  const games = useLiveQuery(() => db.games.toArray(), []) ?? [];
  const me = teams.find((t) => t.id === myId);
  const [season, setSeason] = useState(thisSeason);
  const [rows, setRows] = useState(blankRows);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const taken = new Set(games.filter((g) => !g.deleted && g.season === season).map((g) => g.gameNo));
  const filled = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r, n }) => r.opp.trim() && !taken.has(n));

  if (!me) {
    return (
      <div className="page">
        <div className="topbar"><button className="btn icon ghost" aria-label="Back" onClick={() => nav('/')}>‹</button><h1>Season schedule</h1></div>
        <div className="card col"><span className="muted">Pick “my team” first so every scheduled game includes it.</span><button className="btn primary" onClick={() => nav('/teams')}>Choose my team</button></div>
      </div>
    );
  }

  const create = async () => {
    const preset = PRESETS[DEFAULT_PRESET];
    for (const { r, n } of filled) {
      const opp = teams.find((t) => t.name.trim().toLowerCase() === r.opp.trim().toLowerCase());
      const oppRoster: Roster = opp ? asRoster(opp) : { name: r.opp.trim(), color: '#2f6df6', players: [] };
      const mine = asRoster(me);
      const id = uid();
      const g: Game = {
        id, viewToken: token(), date: r.date ? `${r.date}T19:00` : `${new Date().toISOString().slice(0, 10)}T19:00`, venue: '', level: me.league ?? '', officials: '', scorekeeper: '',
        rules: { ...preset }, home: r.home ? mine : oppRoster, away: r.home ? oppRoster : mine,
        season, gameNo: n, status: 'scheduled', notes: '', created: Date.now(), updated: Date.now(),
      };
      await db.secrets.put({ gameId: id, pin: String(Math.floor(1000 + Math.random() * 9000)) });
      await saveGame(g);
    }
    toast(`${filled.length} game${filled.length === 1 ? '' : 's'} scheduled`);
    nav('/');
  };

  return (
    <div className="page">
      <div className="topbar"><button className="btn icon ghost" aria-label="Back" onClick={() => nav('/')}>‹</button><h1>Season schedule</h1></div>
      <div className="col">
        <div className="card col">
          <div className="row">
            <label className="field grow"><span>Season</span><input value={season} onChange={(e) => setSeason(e.target.value)} /></label>
            <label className="field grow"><span>My team</span><input value={me.name} readOnly /></label>
          </div>
          <span className="muted small">Type each opponent. Names matching one of your teams use that roster; others start with an empty roster. Games already scheduled for this season are skipped.</span>
        </div>
        <datalist id="opp-teams">{teams.filter((t) => t.id !== me.id).map((t) => <option key={t.id} value={t.name} />)}</datalist>
        {rows.map((r, i) => (
          <div key={i} className="card row" style={{ opacity: taken.has(i + 1) ? 0.5 : 1 }}>
            <b style={{ width: 28 }}>{i + 1}</b>
            <input className="grow" list="opp-teams" placeholder="Opponent" aria-label={`Game ${i + 1} opponent`} disabled={taken.has(i + 1)} value={taken.has(i + 1) ? 'Already scheduled' : r.opp} onChange={(e) => set(i, { opp: e.target.value })} />
            <button type="button" className="btn sm" aria-label={`Game ${i + 1} ${r.home ? 'home' : 'away'}`} onClick={() => set(i, { home: !r.home })}>{r.home ? 'Home' : 'Away'}</button>
            <input type="date" aria-label={`Game ${i + 1} date`} style={{ width: 140 }} value={r.date} onChange={(e) => set(i, { date: e.target.value })} />
          </div>
        ))}
        <button className="btn primary" disabled={filled.length === 0} onClick={create}>Create {filled.length} game{filled.length === 1 ? '' : 's'}</button>
      </div>
    </div>
  );
}
