import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { db } from '../db.ts';
import { uid } from '../ids.ts';
import type { Team } from '../../../shared/src/types.ts';
import { OnlineLink } from '../components/OnlineLink.tsx';
import { RosterEditor } from '../components/RosterEditor.tsx';
import { Confirm, toast } from '../components/ui.tsx';
import { setMyTeamId, sortTeams, teamMatches, useMyTeamId } from '../teamsearch.ts';

export function Teams() {
  const nav = useNavigate();
  const teams = useLiveQuery(() => db.teams.toArray(), []) ?? [];
  const myId = useMyTeamId();
  const [q, setQ] = useState('');
  const all = teams.filter((t) => !t.deleted);
  const live = sortTeams(all.filter((t) => teamMatches(t, q)), myId);
  return (
    <div className="page">
      <div className="topbar"><h1>Teams</h1></div>
      <div className="col">
        {all.length > 0 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams or players" aria-label="Search teams or players" />}
        {all.length > 0 && live.length === 0 && <div className="card muted">No team or player matches “{q}”.</div>}
        {all.length === 0 && <div className="card muted">No teams yet. Add your team and its roster once, then pick it when you create a game.</div>}
        {live.map((t) => (
          <div key={t.id} className="card row" style={{ padding: 0, overflow: 'hidden' }}>
            <button className="tap grow" style={{ all: 'unset', cursor: 'pointer', padding: 14, flex: 1, minWidth: 0 }} onClick={() => nav(`/teams/${t.id}`)}>
              <div className="row"><span className="dot" style={{ background: t.color }} /><b className="grow">{t.name || 'Unnamed'}</b>{t.id === myId && <span className="badge final">My team</span>}<span className="muted small">{t.players.length} players ›</span></div>
              {(t.league || q.trim()) && <div className="muted small" style={{ marginTop: 4 }}>{t.league}{q.trim() && t.players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 3).map((p) => ` · #${p.number} ${p.name}`).join('')}</div>}
            </button>
            <button className="btn ghost icon" style={{ height: 'auto', borderRadius: 0, borderLeft: '1px solid var(--line)', width: 56 }} aria-label={t.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => void db.teams.put({ ...t, favorite: !t.favorite, updated: Date.now() })}>{t.favorite ? '★' : '☆'}</button>
          </div>
        ))}
      </div>
      <button className="btn primary fab" onClick={async () => {
        const t: Team = { id: uid(), name: '', color: '#d6322e', players: [], updated: Date.now() };
        await db.teams.put(t); nav(`/teams/${t.id}`);
      }}>＋ New team</button>
    </div>
  );
}

export function TeamEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const stored = useLiveQuery(() => db.teams.get(id!), [id]);
  const [t, setT] = useState<Team | null>(null);
  const [del, setDel] = useState(false);
  const isMine = useMyTeamId() === id;
  useEffect(() => { if (stored && !t) setT(stored); }, [stored, t]);
  // autosave: edits are persisted as you type
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => void db.teams.put({ ...t, updated: Date.now() }), 250);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return <div className="page muted">Loading…</div>;
  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" aria-label="Back" onClick={() => nav('/teams')}>‹</button>
        <h1>{t.name || 'New team'}</h1>
        <button className="btn danger sm" onClick={() => setDel(true)}>Delete</button>
      </div>
      <div className="col">
        <div className="row">
          <label className="field grow"><span>Team name</span><input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Wildcats 14U" /></label>
          <label className="field" style={{ width: 80 }}><span>Color</span><input type="color" style={{ padding: 2 }} value={t.color} onChange={(e) => setT({ ...t, color: e.target.value })} /></label>
        </div>
        <label className="field"><span>League / division</span><input value={t.league ?? ''} onChange={(e) => setT({ ...t, league: e.target.value })} placeholder="Tuesday Night League" /></label>
        <div className="row">
          <button type="button" className={`btn grow ${isMine ? 'primary' : ''}`} onClick={() => void setMyTeamId(isMine ? undefined : t.id)}>{isMine ? '✓ My team' : 'Set as my team'}</button>
          <button type="button" className={`btn grow ${t.favorite ? 'primary' : ''}`} onClick={() => setT({ ...t, favorite: !t.favorite })}>{t.favorite ? '★ Favorite' : '☆ Favorite'}</button>
        </div>
        <OnlineLink team={t} onChange={setT} />
        <h3>Roster ({t.players.length})</h3>
        <RosterEditor players={t.players} onChange={(players) => setT({ ...t, players })} />
        <p className="muted small">Changes save automatically. Games keep their own copy of the roster, so edits here don't change past games. Open a game's Edit screen and tap Sync roster to pull changes in.</p>
      </div>
      {del && <Confirm danger title="Delete team?" body="Past games keep their own copy of the roster." confirm="Delete" onNo={() => setDel(false)} onYes={async () => { await db.teams.put({ ...t, deleted: true, updated: Date.now() }); toast('Team deleted'); nav('/teams'); }} />}
    </div>
  );
}
