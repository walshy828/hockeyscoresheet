import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, saveGame } from '../db.ts';
import { token, uid } from '../ids.ts';
import { DEFAULT_PRESET, PRESETS, PRESET_LABELS } from '../../../shared/src/rules.ts';
import type { Game, Roster, Rules, Side, Team } from '../../../shared/src/types.ts';
import { RosterEditor } from '../components/RosterEditor.tsx';
import { kvGet } from '../db.ts';
import { syncRoster } from '../roster.ts';
import { Confirm, toast } from '../components/ui.tsx';

const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));
const blank = (name: string, color: string): Roster => ({ name, color, players: [] });
const copyTeam = (t: Team): Roster => ({ teamId: t.id, name: t.name, color: t.color, players: t.players.map((p) => ({ ...p })) });

export function GameForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const editing = !!id;
  const teams = (useLiveQuery(() => db.teams.toArray(), []) ?? []).filter((t) => !t.deleted);
  const existing = useLiveQuery(() => (id ? db.games.get(id) : undefined), [id]);
  const [g, setG] = useState<Game | null>(null);
  const [pin, setPin] = useState(randomPin);
  const [syncing, setSyncing] = useState<Side | null>(null);
  // switching teams on a game that already has events would orphan the players they reference
  const hasEvents = useLiveQuery(() => (id ? db.events.where('gameId').equals(id).count().then((n) => n > 0) : false), [id]) ?? false;

  useEffect(() => {
    if (editing) { if (existing && !g) setG(existing); return; }
    if (g) return;
    void kvGet('defaultPreset', DEFAULT_PRESET).then((preset) => setG({
      id: uid(), viewToken: token(), date: localNow(), venue: '', level: '', officials: '', scorekeeper: '',
      rules: { ...PRESETS[preset] ?? PRESETS[DEFAULT_PRESET] }, home: blank('Home', '#d6322e'), away: blank('Away', '#2f6df6'),
      status: 'scheduled', notes: '', created: Date.now(), updated: Date.now(),
    }));
  }, [editing, existing, g]);

  if (!g) return <div className="page muted">Loading…</div>;
  const setRules = (patch: Partial<Rules>) => setG({ ...g, rules: { ...g.rules, ...patch } });
  const setSide = (s: Side, r: Roster) => setG({ ...g, [s]: r });
  const valid = g.home.name.trim() && g.away.name.trim() && (editing || pin.length >= 4);

  const save = async () => {
    if (!editing) await db.secrets.put({ gameId: g.id, pin });
    await saveGame(g);
    nav(editing ? `/game/${g.id}` : `/game/${g.id}`, { replace: true });
  };

  const saveAsTeam = async (s: Side) => {
    const r = g[s];
    const t: Team = { id: uid(), name: r.name.trim(), color: r.color, players: r.players.map(({ scratched: _s, ...p }) => p), updated: Date.now() };
    await db.teams.put(t);
    setSide(s, { ...r, teamId: t.id });
    toast(`Saved "${t.name}" to My teams`);
  };

  const syncPreview = syncing ? (() => { const t = teams.find((x) => x.id === g[syncing].teamId); return t ? { t, r: syncRoster(g[syncing].players, t.players) } : null; })() : null;

  const sideEditor = (s: Side) => {
    const linked = teams.find((t) => t.id === g[s].teamId);
    return (
    <div className="card col">
      <h3>{s === 'home' ? 'Home' : 'Away'} team</h3>
      {(teams.length > 0 || g[s].teamId) && (
        <label className="field"><span>Team</span>
          <select value={teams.some((t) => t.id === g[s].teamId) ? g[s].teamId : ''} disabled={editing && hasEvents} onChange={(e) => { const t = teams.find((x) => x.id === e.target.value); setSide(s, t ? copyTeam(t) : { ...blank(s === 'home' ? 'Home' : 'Away', g[s].color) }); }}>
            <option value="">— not from my teams —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {editing && hasEvents && <small className="muted">Scoring has started, so the team can't be swapped. You can still sync its roster.</small>}
        </label>
      )}
      {linked && (
        <button type="button" className="btn" onClick={() => setSyncing(s)}>↻ Sync roster from {linked.name || 'team'}</button>
      )}
      {!g[s].teamId && g[s].name.trim() && (
        <button type="button" className="btn" onClick={() => saveAsTeam(s)}>＋ Save as new team</button>
      )}
      <div className="row">
        <label className="field grow"><span>Name</span><input value={g[s].name} onChange={(e) => setSide(s, { ...g[s], name: e.target.value })} /></label>
        <label className="field" style={{ width: 80 }}><span>Color</span><input type="color" style={{ padding: 2 }} value={g[s].color} onChange={(e) => setSide(s, { ...g[s], color: e.target.value })} /></label>
      </div>
      <details>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>Roster ({g[s].players.filter((p) => !p.scratched).length} playing of {g[s].players.length})</summary>
        <p className="muted small">Uncheck a player who isn't playing in this game. This game keeps its own roster copy; team changes only arrive when you sync.</p>
        <RosterEditor perGame players={g[s].players} onChange={(players) => setSide(s, { ...g[s], players })} />
      </details>
    </div>
    );
  };

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" aria-label="Back" onClick={() => nav(-1)}>‹</button>
        <h1>{editing ? 'Edit game' : 'New game'}</h1>
      </div>
      <div className="col">
        {sideEditor('home')}
        {sideEditor('away')}
        <div className="card col">
          <span className="muted small">Which team are you scoring for? Offense/defense on the rink is shown from their view.</span>
          <div className="seg">{(['home', 'away'] as Side[]).map((s) => <button key={s} type="button" className={`${s} ${(g.myTeam ?? 'home') === s ? 'on' : ''}`} onClick={() => setG({ ...g, myTeam: s })}>{g[s].name || (s === 'home' ? 'Home' : 'Away')}</button>)}</div>
        </div>
        <div className="card col">
          <label className="field"><span>Date &amp; time</span><input type="datetime-local" value={g.date} onChange={(e) => setG({ ...g, date: e.target.value })} /></label>
          <label className="field"><span>Venue / rink</span><input value={g.venue} onChange={(e) => setG({ ...g, venue: e.target.value })} /></label>
          <label className="field"><span>Level / league</span><input value={g.level} onChange={(e) => setG({ ...g, level: e.target.value })} placeholder="Varsity, 14U AA…" /></label>
        </div>
        <div className="card col">
          <h3>Rules</h3>
          <label className="field"><span>Preset</span>
            <select value={g.rules.preset} onChange={(e) => { const p = PRESETS[e.target.value]; if (p) setG({ ...g, rules: { ...p } }); }}>
              {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{PRESET_LABELS[k]}</option>)}
              {g.rules.preset === 'custom' && <option value="custom">Custom</option>}
            </select>
          </label>
          <div className="row">
            <label className="field grow"><span>Periods</span><input inputMode="numeric" value={g.rules.periods} onChange={(e) => setRules({ preset: 'custom', periods: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })} /></label>
            <label className="field grow"><span>Minutes / period</span><input inputMode="numeric" value={g.rules.periodMinutes} onChange={(e) => setRules({ preset: 'custom', periodMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} /></label>
            <label className="field grow"><span>OT minutes</span><input inputMode="numeric" value={g.rules.otMinutes} onChange={(e) => setRules({ preset: 'custom', otMinutes: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} /></label>
          </div>
        </div>
        <details className="card">
          <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>Officials &amp; scorekeeper</summary>
          <div className="col">
            <label className="field"><span>Officials</span><input value={g.officials} onChange={(e) => setG({ ...g, officials: e.target.value })} /></label>
            <label className="field"><span>Scorekeeper</span><input value={g.scorekeeper} onChange={(e) => setG({ ...g, scorekeeper: e.target.value })} /></label>
          </div>
        </details>
        {!editing && (
          <div className="card col">
            <label className="field"><span>Scorer PIN (needed to score this game from another device)</span>
              <input inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            </label>
            <p className="muted small">Coaches get a read-only link — they never need the PIN. Write it down: it can't be recovered.</p>
          </div>
        )}
        <button className="btn primary" disabled={!valid} onClick={save}>{editing ? 'Save changes' : 'Create game & start scoring'}</button>
      </div>
      {syncing && syncPreview && (
        <Confirm title={`Sync ${syncPreview.t.name} roster?`} confirm="Sync"
          body={syncPreview.r.added + syncPreview.r.updated === 0 ? 'This game already matches the team roster.' : `${syncPreview.r.added} player(s) added, ${syncPreview.r.updated} updated.${syncPreview.r.kept ? ` ${syncPreview.r.kept} player(s) not on the team roster are kept.` : ''} Players you marked as not playing stay that way. Nothing is removed.`}
          onNo={() => setSyncing(null)}
          onYes={() => { setSide(syncing, { ...g[syncing], name: syncPreview.t.name, color: syncPreview.t.color, players: syncPreview.r.players }); setSyncing(null); }} />
      )}
    </div>
  );
}
