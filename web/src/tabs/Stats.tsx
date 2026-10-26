import { useMemo, useState } from 'react';
import type { Side, Player } from '../../../shared/src/types.ts';
import { fmtClock, fmtToi, type PlayerStat } from '../../../shared/src/derive.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { pLabel, sideName } from '../describe.ts';
import { Rink, type Marker } from '../components/Rink.tsx';
import { AudioPlayer } from '../components/Voice.tsx';
import { sortPlayers } from '../components/ui.tsx';
import { useMarkers, useVertical } from './Score.tsx';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (a: number, b: number) => (a + b ? Math.round((a / (a + b)) * 100) : 0);

function Compare({ label, a, b, fmt = (n: number) => String(n), bar }: { label: string; a: number; b: number; fmt?: (n: number) => string; bar?: boolean }) {
  const total = a + b;
  return (
    <div className="stat-row">
      <div className="lbl">{label}</div>
      <div className="v1">{fmt(a)}</div>
      <div className="bar" style={{ opacity: total ? 1 : 0.3 }}><div style={{ width: `${total ? (a / total) * 100 : 50}%` }} /></div>
      <div className="v2">{fmt(b)}</div>
      {bar === false && null}
    </div>
  );
}

export function StatSeg({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const { canEdit } = useGame();
  if (!canEdit) return null;
  return (
    <div className="seg hide-print" style={{ marginBottom: 12 }}>
      {[['box', 'Box score'], ['faceoffs', 'Faceoffs'], ['ice', 'Ice time']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
    </div>
  );
}

export function BoxTab() {
  const { game, d } = useGame();
  const np = Math.max(game.rules.periods, d.clock.period);
  const periods = Array.from({ length: np }, (_, i) => i);
  const ot = (i: number) => periodName(i + 1, game.rules);
  const shotsT = (s: Side) => sum(d.byPeriod.sog[s]);
  const foW = (s: Side) => sum(d.byPeriod.fo[s]);

  const goalies = (s: Side) => game[s].players.filter((p) => p.pos === 'G' && d.players.get(p.id) && (d.players.get(p.id)!.sa || d.players.get(p.id)!.toi));
  return (
    <div className="col">
      <div className="card tablewrap">
        <table className="t">
          <thead><tr><th>Team</th>{periods.map((i) => <th key={i}>{ot(i)}</th>)}<th>T</th></tr></thead>
          <tbody>
            {(['away', 'home'] as Side[]).map((s) => (
              <tr key={s}><td><b>{sideName(game, s)}</b></td>{periods.map((i) => <td key={i}>{d.byPeriod.goals[s][i]}</td>)}<td><b>{d.score[s]}</b></td></tr>
            ))}
            <tr><td colSpan={np + 2} className="muted small" style={{ paddingTop: 12 }}>SHOTS ON GOAL</td></tr>
            {(['away', 'home'] as Side[]).map((s) => (
              <tr key={'s' + s}><td>{sideName(game, s)}</td>{periods.map((i) => <td key={i}>{d.byPeriod.sog[s][i]}</td>)}<td><b>{shotsT(s)}</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ color: 'var(--home)' }}>{sideName(game, 'home')}</b><b style={{ color: 'var(--away)' }}>{sideName(game, 'away')}</b></div>
        <Compare label="Shots on goal" a={shotsT('home')} b={shotsT('away')} />
        <Compare label="Faceoff win %" a={pct(foW('home'), foW('away'))} b={pct(foW('away'), foW('home'))} fmt={(n) => n + '%'} />
        <Compare label="Power play" a={d.ppGoals.home} b={d.ppGoals.away} fmt={(n) => String(n)} />
        <Compare label="Penalty minutes" a={sum(d.byPeriod.pim.home)} b={sum(d.byPeriod.pim.away)} />
        <div className="muted small" style={{ textAlign: 'center' }}>
          PP: {sideName(game, 'home')} {d.ppGoals.home}/{d.ppOpps.home} · {sideName(game, 'away')} {d.ppGoals.away}/{d.ppOpps.away} · Timeouts {d.timeouts.home}–{d.timeouts.away}
        </div>
      </div>

      <div className="card">
        <h3>Scoring</h3>
        {d.goals.length === 0 && <div className="muted">No goals yet.</div>}
        {d.goals.map((g) => (
          <div className="logrow" key={g.ev.id}>
            <div className="when"><b>{fmtClock(g.ev.clock)}</b><span className="muted small">{periodName(g.ev.period, game.rules)}</span></div>
            <span className={`dot ${g.d.team}`} />
            <div className="grow"><b>{g.d.scorer ? pLabel(game, g.d.scorer) : sideName(game, g.d.team)}</b> <span className="muted small">{g.d.strength}</span>
              <div className="muted small">{g.d.assists?.length ? 'Assists: ' + g.d.assists.map((a) => pLabel(game, a)).join(', ') : 'Unassisted'}{g.goalie !== undefined && ` · vs ${g.goalie ? pLabel(game, g.goalie, true) : 'empty net'}`}</div></div>
            <b>{g.away}–{g.home}</b>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Penalties</h3>
        {d.penalties.length === 0 && <div className="muted">No penalties.</div>}
        {d.penalties.map((p) => (
          <div className="logrow" key={p.ev.id}>
            <div className="when"><b>{fmtClock(p.ev.clock)}</b><span className="muted small">{periodName(p.ev.period, game.rules)}</span></div>
            <span className={`dot ${p.d.team}`} />
            <div className="grow"><b>{p.d.player ? pLabel(game, p.d.player) : sideName(game, p.d.team)}</b><div className="muted small">{p.d.label}{p.endedByGoal ? ' · ended by PP goal' : ''}</div></div>
            <b>{p.d.minutes}′</b>
          </div>
        ))}
      </div>

      {(['home', 'away'] as Side[]).map((s) => (
        <div className="card tablewrap" key={s}>
          <h3 style={{ color: `var(--${s})`, marginBottom: 6 }}>{sideName(game, s)} players</h3>
          <PlayerTable side={s} />
          {goalies(s).length > 0 && (
            <table className="t" style={{ marginTop: 12 }}>
              <thead><tr><th>Goalie</th><th>SA</th><th>SV</th><th>GA</th><th>SV%</th><th>TOI</th></tr></thead>
              <tbody>{goalies(s).map((p) => { const t = d.players.get(p.id)!; return (
                <tr key={p.id}><td>#{p.number} {p.name}</td><td>{t.sa}</td><td>{t.sv}</td><td>{t.ga}</td><td>{t.sa ? (t.sv / t.sa).toFixed(3).replace(/^0/, '') : '–'}</td><td>{fmtToi(t.toi)}</td></tr>
              ); })}</tbody>
            </table>
          )}
        </div>
      ))}

      {d.notes.length > 0 && (
        <div className="card">
          <h3>Notes</h3>
          {d.notes.map((n) => (
            <div className="logrow" key={n.id} style={{ alignItems: 'flex-start' }}>
              <div className="when"><b>{fmtClock(n.clock)}</b><span className="muted small">{periodName(n.period, game.rules)}</span></div>
              <div className="grow">{n.data.text}{n.data.audioId && <AudioPlayer id={n.data.audioId} />}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerTable({ side }: { side: Side }) {
  const { game, d } = useGame();
  const rows = sortPlayers(game[side].players).filter((p: Player) => p.pos !== 'G' || d.players.get(p.id)?.g || d.players.get(p.id)?.a);
  const z = (p: Player): PlayerStat | undefined => d.players.get(p.id);
  return (
    <table className="t">
      <thead><tr><th>Player</th><th>G</th><th>A</th><th>P</th><th>SOG</th><th>+/-</th><th>PIM</th><th>FO</th><th>TOI</th></tr></thead>
      <tbody>
        {rows.map((p) => { const t = z(p); return (
          <tr key={p.id}><td>#{p.number} {p.name} <span className="muted small">{p.pos}</span></td>
            <td>{t?.g ?? 0}</td><td>{t?.a ?? 0}</td><td>{(t?.g ?? 0) + (t?.a ?? 0)}</td><td>{t?.sog ?? 0}</td><td>{t?.pm ?? 0}</td><td>{t?.pim ?? 0}</td>
            <td>{t && t.fow + t.fol ? `${t.fow}-${t.fol}` : '–'}</td><td>{t?.toi ? fmtToi(t.toi) : '–'}</td></tr>
        ); })}
        {rows.length === 0 && <tr><td colSpan={9} className="muted">No roster.</td></tr>}
      </tbody>
    </table>
  );
}

export function ShotsTab() {
  const { game, d } = useGame();
  const all = useMarkers();
  const [team, setTeam] = useState<'all' | Side>('all');
  const [period, setPeriod] = useState(0);
  const [type, setType] = useState<'all' | 'goal' | 'shot'>('all');
  const [heat, setHeat] = useState(false);
  const { vertical, cycle } = useVertical();
  const byId = useMemo(() => new Map(d.events.map((e) => [e.id, e])), [d]);
  const markers = all.filter((m) => (team === 'all' || m.team === team) && (!period || byId.get(m.id)?.period === period) && (type === 'all' || (type === 'goal' ? m.kind === 'goal' : m.kind !== 'goal')));
  const np = Math.max(game.rules.periods, d.clock.period);
  const sog = (s: Side) => d.byPeriod.sog[s];
  const Seg = ({ items, val, set }: { items: [any, string][]; val: any; set: (v: any) => void }) => (
    <div className="seg">{items.map(([k, l]) => <button key={String(k)} className={val === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>
  );
  return (
    <div className="col">
      <div className="card tablewrap">
        <table className="t"><thead><tr><th>SOG</th>{Array.from({ length: np }, (_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}<th>T</th></tr></thead>
          <tbody>{(['home', 'away'] as Side[]).map((s) => <tr key={s}><td><b>{sideName(game, s)}</b></td>{sog(s).slice(0, np).map((n, i) => <td key={i}>{n}</td>)}<td><b>{sum(sog(s))}</b></td></tr>)}</tbody></table>
      </div>
      <Seg items={[['all', 'Both'], ['home', sideName(game, 'home')], ['away', sideName(game, 'away')]]} val={team} set={setTeam} />
      <Seg items={[[0, 'All'], ...Array.from({ length: np }, (_, i) => [i + 1, periodName(i + 1, game.rules)] as [number, string])]} val={period} set={setPeriod} />
      <div className="row">
        <div className="grow"><Seg items={[['all', 'All'], ['goal', 'Goals'], ['shot', 'Shots']]} val={type} set={setType} /></div>
        <button className={`btn ${heat ? 'primary' : ''}`} onClick={() => setHeat(!heat)}>🔥 Heat</button>
        <button className="btn icon" aria-label="Rotate rink" onClick={cycle}>⟳</button>
      </div>
      <Rink vertical={vertical} markers={markers} heat={heat} maxVh={66} />
      <div className="row wrap small muted" style={{ justifyContent: 'center' }}>
        <span>★ goal</span><span>● on goal</span><span>✕ missed</span><span>▪ blocked</span>
        <span style={{ color: 'var(--home)' }}>■ {sideName(game, 'home')}</span><span style={{ color: 'var(--away)' }}>■ {sideName(game, 'away')}</span>
        <span>{markers.length} shown</span>
      </div>
      <Shooters />
    </div>
  );
}

function Shooters() {
  const { game, d } = useGame();
  const rows = [...d.players.entries()].filter(([, t]) => t.att > 0 || t.g > 0).sort((a, b) => b[1].sog - a[1].sog).slice(0, 12);
  if (!rows.length) return null;
  return (
    <div className="card tablewrap">
      <h3>Shooters</h3>
      <table className="t"><thead><tr><th>Player</th><th>Shots</th><th>SOG</th><th>G</th></tr></thead>
        <tbody>{rows.map(([id, t]) => <tr key={id}><td><span className={`dot ${t.side}`} style={{ display: 'inline-block', marginRight: 6 }} />{pLabel(game, id)}</td><td>{t.att}</td><td>{t.sog}</td><td>{t.g}</td></tr>)}</tbody></table>
    </div>
  );
}

export function FaceoffsTab() {
  const { game, d } = useGame();
  const np = Math.max(game.rules.periods, d.clock.period);
  const w = (s: Side) => sum(d.byPeriod.fo[s]);
  const markers: Marker[] = d.faceoffs.filter((f) => f.d.x != null).map((f) => ({ id: f.ev.id, x: f.d.x!, y: f.d.y!, team: f.d.team, kind: 'faceoff' }));
  const { vertical } = useVertical();
  const rows = [...d.players.entries()].filter(([, t]) => t.fow + t.fol > 0).sort((a, b) => b[1].fow - a[1].fow);
  return (
    <div className="col">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ color: 'var(--home)' }}>{sideName(game, 'home')} {w('home')}</b><b style={{ color: 'var(--away)' }}>{w('away')} {sideName(game, 'away')}</b></div>
        <Compare label="Faceoff wins" a={w('home')} b={w('away')} />
        <div className="muted small" style={{ textAlign: 'center' }}>Win %: {pct(w('home'), w('away'))}% – {pct(w('away'), w('home'))}%</div>
      </div>
      <div className="card tablewrap">
        <table className="t"><thead><tr><th>Wins</th>{Array.from({ length: np }, (_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}</tr></thead>
          <tbody>{(['home', 'away'] as Side[]).map((s) => <tr key={s}><td><b>{sideName(game, s)}</b></td>{d.byPeriod.fo[s].slice(0, np).map((n, i) => <td key={i}>{n}</td>)}</tr>)}</tbody></table>
      </div>
      {rows.length > 0 && (
        <div className="card tablewrap">
          <h3>Players</h3>
          <table className="t"><thead><tr><th>Player</th><th>W</th><th>L</th><th>%</th></tr></thead>
            <tbody>{rows.map(([id, t]) => <tr key={id}><td><span className={`dot ${t.side}`} style={{ display: 'inline-block', marginRight: 6 }} />{pLabel(game, id)}</td><td>{t.fow}</td><td>{t.fol}</td><td>{pct(t.fow, t.fol)}%</td></tr>)}</tbody></table>
        </div>
      )}
      {markers.length > 0 && <Rink vertical={vertical} markers={markers} maxVh={55} />}
    </div>
  );
}

export function IceTab() {
  const { game, d } = useGame();
  const np = Math.max(game.rules.periods, d.clock.period);
  return (
    <div className="col">
      {(['home', 'away'] as Side[]).map((s) => {
        const rows = game[s].players.filter((p) => d.players.get(p.id)?.toi).sort((a, b) => d.players.get(b.id)!.toi - d.players.get(a.id)!.toi);
        return (
          <div className="card tablewrap" key={s}>
            <h3 style={{ color: `var(--${s})`, marginBottom: 6 }}>{sideName(game, s)} · ice time</h3>
            <table className="t"><thead><tr><th>Player</th>{Array.from({ length: np }, (_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}<th>Total</th><th>Shifts</th></tr></thead>
              <tbody>{rows.map((p) => { const t = d.players.get(p.id)!; return (
                <tr key={p.id}><td>{d.onIce[s].has(p.id) && <span title="on ice" style={{ color: 'var(--ok)' }}>● </span>}#{p.number} {p.name}</td>
                  {t.toiByPeriod.slice(0, np).map((x, i) => <td key={i}>{x ? fmtToi(x) : '–'}</td>)}<td><b>{fmtToi(t.toi)}</b></td><td>{t.shifts}</td></tr>
              ); })}
                {rows.length === 0 && <tr><td colSpan={np + 3} className="muted">No shifts recorded. Use the Lines tab to track who is on the ice.</td></tr>}</tbody></table>
          </div>
        );
      })}
    </div>
  );
}
