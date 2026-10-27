import { useEffect, useMemo, useState } from 'react';
import { derive } from '../../../shared/src/derive.ts';
import { compareStats, type CompareRow, type ExtLeague, type ExtPlayer, type ExtTeam, type ExtTeamRef, type LocalLine } from '../../../shared/src/mhl.ts';
import type { Player, Team } from '../../../shared/src/types.ts';
import { db } from '../db.ts';
import { uid } from '../ids.ts';
import { Sheet, toast } from './ui.tsx';

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
  return r.json();
};

/** Season totals from this app's finals for one team, keyed by jersey number. */
async function appStats(team: Team): Promise<LocalLine[]> {
  const games = (await db.games.toArray()).filter((g) => !g.deleted && g.status === 'final' && (g.home.teamId === team.id || g.away.teamId === team.id));
  const lines = new Map<string, LocalLine>();
  for (const g of games) {
    const side = g.home.teamId === team.id ? 'home' : 'away';
    const d = derive(await db.events.where('gameId').equals(g.id).toArray(), g);
    for (const p of g[side].players) {
      if (p.scratched) continue;
      const s = d.players.get(p.id);
      const l = lines.get(p.number) ?? { number: p.number, name: p.name, gp: 0, g: 0, a: 0, pim: 0 };
      l.gp++;
      if (s) { l.g += s.g; l.a += s.a; l.pim += s.pim; }
      lines.set(p.number, l);
    }
  }
  return [...lines.values()];
}

/** Merge online players into the team roster by jersey number; existing ids are kept so past games stay linked. */
function mergeRoster(mine: Player[], online: ExtPlayer[]) {
  const out = mine.map((p) => ({ ...p }));
  let added = 0, updated = 0;
  for (const o of online) {
    const cur = out.find((p) => p.number === o.number);
    if (!cur) { out.push({ id: uid(), number: o.number, name: o.name, pos: o.pos }); added++; continue; }
    if (cur.name !== o.name || (cur.pos !== o.pos && cur.pos === 'F')) { cur.name = o.name; if (cur.pos === 'F') cur.pos = o.pos; updated++; }
  }
  return { players: out, added, updated };
}

export function OnlineLink({ team, onChange }: { team: Team; onChange: (t: Team) => void }) {
  const [picking, setPicking] = useState(false);
  const [online, setOnline] = useState<ExtTeam | null>(null);
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const src = team.source;

  const load = async (ref: string) => {
    setBusy(true); setErr('');
    try {
      const { team: t } = await get<{ team: ExtTeam }>(`/api/ext/team/${ref}`);
      setOnline(t);
      setRows(compareStats(await appStats(team), t.players));
      return t;
    } catch (e) { setErr((e as Error).message); return null; }
    finally { setBusy(false); }
  };

  const link = (r: ExtTeamRef | { ref: string; name: string }, season = '') => {
    onChange({ ...team, source: { provider: 'myhockeylive', ref: r.ref, name: r.name, season } });
    setPicking(false); setOnline(null); setRows(null);
  };

  const importRoster = async () => {
    const t = online ?? (src ? await load(src.ref) : null);
    if (!t) return;
    const m = mergeRoster(team.players, t.players);
    onChange({ ...team, players: m.players, source: { ...src!, name: t.name, season: t.season, syncedAt: Date.now() } });
    toast(`Roster synced: ${m.added} added, ${m.updated} updated`);
  };

  const summary = useMemo(() => rows && {
    diff: rows.filter((r) => r.kind === 'diff').length,
    match: rows.filter((r) => r.kind === 'match').length,
    onlyApp: rows.filter((r) => r.kind === 'onlyApp').length,
    onlyOnline: rows.filter((r) => r.kind === 'onlyOnline').length,
  }, [rows]);

  return (
    <div className="card col">
      <div className="row"><h3 className="grow" style={{ margin: 0 }}>Online team (MIAA)</h3>{src && <button className="btn sm" onClick={() => setPicking(true)}>Change</button>}</div>
      {!src && <>
        <p className="muted small" style={{ margin: 0 }}>Link this team to its MyHockeyLive page, the public MIAA source for Massachusetts high school rosters, schedules, standings and player stats. Then import the roster and compare online stats against what you track here, or link an opponent to scout them.</p>
        <button className="btn primary" onClick={() => setPicking(true)}>Find team online</button>
      </>}
      {src && <>
        <div className="small"><b>{src.name}</b>{src.season && ` · ${src.season}`} <a href={`https://www.myhockeylive.com/miaa/teams/${src.ref}`} target="_blank" rel="noreferrer">Open ↗</a></div>
        {src.syncedAt && <div className="muted small">Roster last synced {new Date(src.syncedAt).toLocaleString()}</div>}
        <div className="row">
          <button className="btn grow" disabled={busy} onClick={() => void importRoster()}>Import / sync roster</button>
          <button className="btn grow" disabled={busy} onClick={() => void load(src.ref)}>{busy ? 'Loading…' : 'Compare stats'}</button>
          <button className="btn ghost sm" onClick={() => { onChange({ ...team, source: undefined }); setOnline(null); setRows(null); }}>Unlink</button>
        </div>
      </>}
      {err && <div className="muted small" role="alert">Couldn't reach MyHockeyLive: {err}</div>}
      {rows && summary && <Compare rows={rows} summary={summary} season={online?.season} />}
      {picking && <Picker onPick={link} onClose={() => setPicking(false)} />}
    </div>
  );
}

function Compare({ rows, summary, season }: { rows: CompareRow[]; summary: Record<string, number>; season?: string }) {
  const online = rows.some((r) => r.online?.gp !== undefined);
  const cell = (r: CompareRow, k: 'gp' | 'g' | 'a' | 'pim') => {
    const a = r.app?.[k], o = r.online?.[k];
    const bad = r.diffs.includes(k);
    return <td key={k} style={{ textAlign: 'center', color: bad ? 'var(--danger, #d6322e)' : undefined, fontWeight: bad ? 700 : undefined }}>{a ?? '–'} / {o ?? '–'}</td>;
  };
  return (
    <div className="col">
      <div className="muted small">
        {season && `${season} · `}{summary.match} match · {summary.diff} differ · {summary.onlyApp} only here · {summary.onlyOnline} only online.
        {!online && ' Online stats are blank, which is normal before the season starts or until games are reported.'}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="small" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th>#</th><th style={{ textAlign: 'left' }}>Player</th><th>GP</th><th>G</th><th>A</th><th>PIM</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.number} style={{ opacity: r.kind === 'match' ? 0.6 : 1 }}>
                <td>{r.number}</td>
                <td>{r.name}{r.nameOnline && <span className="muted"> (online: {r.nameOnline})</span>}{r.kind === 'onlyApp' && <span className="muted"> · not online</span>}{r.kind === 'onlyOnline' && <span className="muted"> · not in app</span>}</td>
                {(['gp', 'g', 'a', 'pim'] as const).map((k) => cell(r, k))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted small">Each cell shows this app / online. Players match by jersey number. Online totals only include games the school or league has reported.</div>
    </div>
  );
}

function Picker({ onPick, onClose }: { onPick: (t: ExtTeamRef) => void; onClose: () => void }) {
  const [teams, setTeams] = useState<ExtTeamRef[]>([]);
  const [leagues, setLeagues] = useState<ExtLeague[]>([]);
  const [league, setLeague] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setErr('');
    get<{ teams: ExtTeamRef[]; leagues: ExtLeague[] }>(`/api/ext/directory${league ? `?league=${league}` : ''}`)
      .then((d) => { if (!live) return; setTeams(d.teams); if (!league) setLeagues(d.leagues); })
      .catch((e) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [league]);
  const shown = teams.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title="Find team on MyHockeyLive" onClose={onClose}>
        <div className="col">
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="School or team name" aria-label="School or team name" />
          <select value={league} onChange={(e) => setLeague(e.target.value)} aria-label="League">
            <option value="">All MIAA leagues</option>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {loading && <div className="muted small">Loading teams… the first load can take a few seconds.</div>}
          {err && <div className="muted small" role="alert">Couldn't reach MyHockeyLive: {err}</div>}
          <div style={{ maxHeight: '50vh', overflowY: 'auto' }} className="col">
            {shown.slice(0, 80).map((t) => (
              <button key={t.ref} className="btn" style={{ textAlign: 'left' }} onClick={() => onPick(t)}>{t.name}{t.gender && <span className="muted"> – {t.gender}</span>}</button>
            ))}
            {!loading && !err && shown.length === 0 && <div className="muted small">No match.</div>}
          </div>
        </div>
    </Sheet>
  );
}
