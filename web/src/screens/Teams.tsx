import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { db } from '../db.ts';
import { uid } from '../ids.ts';
import type { Team } from '../../../shared/src/types.ts';
import { RosterEditor } from '../components/RosterEditor.tsx';
import { Confirm, toast } from '../components/ui.tsx';

export function Teams() {
  const nav = useNavigate();
  const teams = useLiveQuery(() => db.teams.toArray(), []) ?? [];
  const live = teams.filter((t) => !t.deleted);
  return (
    <div className="page">
      <div className="topbar"><h1>Teams</h1></div>
      <div className="col">
        {live.length === 0 && <div className="card muted">No teams yet. Add your team and its roster once, then pick it when you create a game.</div>}
        {live.map((t) => (
          <button key={t.id} className="card tap" onClick={() => nav(`/teams/${t.id}`)}>
            <div className="row"><span className="dot" style={{ background: t.color }} /><b className="grow">{t.name || 'Unnamed'}</b><span className="muted small">{t.players.length} players ›</span></div>
          </button>
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
        <h3>Roster ({t.players.length})</h3>
        <RosterEditor players={t.players} onChange={(players) => setT({ ...t, players })} />
        <p className="muted small">Changes save automatically. Games keep their own copy of the roster, so edits here don't change past games. Open a game's Edit screen and tap Sync roster to pull changes in.</p>
      </div>
      {del && <Confirm danger title="Delete team?" body="Past games keep their own copy of the roster." confirm="Delete" onNo={() => setDel(false)} onYes={async () => { await db.teams.put({ ...t, deleted: true, updated: Date.now() }); toast('Team deleted'); nav('/teams'); }} />}
    </div>
  );
}
