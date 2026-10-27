import { useMemo } from 'react';
import { fmtToi } from '../../../shared/src/derive.ts';
import { iceTime, longestShifts, periodCount, shiftsByPeriod } from '../../../shared/src/insights.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { sideName } from '../describe.ts';
import { sortPlayers } from '../components/ui.tsx';
import { Card, TeamToggle, useFocus } from './parts.tsx';

const t = (s: number) => (s > 0 ? fmtToi(s) : '–');
/** a shift much longer than a minute and a quarter is where legs start to go */
const LONG = 80;

export function IceSection() {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const np = periodCount(d, game);
  const split = useMemo(() => iceTime(d), [d]);
  const longest = useMemo(() => longestShifts(d), [d]);
  const per = useMemo(() => shiftsByPeriod(d, game, focus), [d, game, focus]);
  const skaters = sortPlayers(game[focus].players).filter((p) => p.pos !== 'G' && d.players.get(p.id)?.toi);
  const team = split.team[focus];
  const gameTime = team.ev + team.pp + team.pk;

  const sum = (f: (l: (typeof per)[number]) => number) => per.reduce((a, l) => a + f(l), 0);
  const totShifts = sum((l) => l.shifts), totToi = sum((l) => l.toi);

  if (!skaters.length) {
    return (
      <div className="vw-grid">
        <Card title="Ice time" right={<TeamToggle />} wide>
          <div className="muted">No shifts recorded for {sideName(game, focus)} yet. Ice time appears once the scorekeeper tracks who is on the ice.</div>
        </Card>
      </div>
    );
  }

  const strengths = [
    ['Even strength', 'full ice', team.ev, 'var(--accent)'],
    ['Power play', 'man advantage', team.pp, 'var(--ok-fill)'],
    ['Penalty kill', 'short-handed', team.pk, 'var(--bad-fill)'],
  ] as const;

  return (
    <div className="vw-grid">
      <Card title="Shifts by period" sub={`${sideName(game, focus)} skaters`} right={<TeamToggle />} wide className="tablewrap">
        <table className="t">
          <thead><tr><th className="l" />{per.map((_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}<th>Game</th></tr></thead>
          <tbody>
            <tr><td>Shifts</td>{per.map((l, i) => <td key={i}>{l.shifts || '–'}</td>)}<td><b>{totShifts}</b></td></tr>
            <tr><td>Time on ice</td>{per.map((l, i) => <td key={i}>{t(l.toi)}</td>)}<td><b>{t(totToi)}</b></td></tr>
            <tr><td>Average shift</td>{per.map((l, i) => <td key={i}>{t(l.avg)}</td>)}<td><b>{t(totShifts ? totToi / totShifts : 0)}</b></td></tr>
            <tr><td>Longest shift</td>{per.map((l, i) => <td key={i}>{t(l.longest)}</td>)}<td><b>{t(Math.max(0, ...per.map((l) => l.longest)))}</b></td></tr>
          </tbody>
        </table>
      </Card>

      <Card title="Game situations" sub={`How ${sideName(game, focus)}'s game time was spent`}>
        <div className="vw-bar tall" aria-hidden="true">{strengths.map(([l, , s, c]) => s > 0 && <i key={l} style={{ width: `${(s / gameTime) * 100}%`, background: c }} />)}</div>
        <table className="t">
          <tbody>
            {strengths.map(([l, sub, s, c]) => (
              <tr key={l}><td><i className="vw-swatch" style={{ background: c }} /> {l} <span className="muted small">{sub}</span></td><td>{t(s)}</td><td className="muted">{gameTime ? Math.round((s / gameTime) * 100) : 0}%</td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Players" sub="Time on ice by period, shift length, and by situation" wide className="tablewrap">
        <table className="t">
          <thead>
            <tr>
              <th className="l">Player</th>{Array.from({ length: np }, (_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}
              <th>Total</th><th>Shifts</th><th>Avg</th><th>Long</th><th title="Even strength">EV</th><th title="Power play">PP</th><th title="Penalty kill">PK</th>
            </tr>
          </thead>
          <tbody>
            {skaters.map((p) => {
              const s = d.players.get(p.id)!, x = split.players.get(p.id);
              const avg = s.shifts ? s.toi / s.shifts : 0;
              return (
                <tr key={p.id}>
                  <td>{d.onIce[focus].has(p.id) && <span title="on ice" style={{ color: 'var(--ok)' }}>● </span>}#{p.number} {p.name}</td>
                  {Array.from({ length: np }, (_, i) => <td key={i}>{t(s.toiByPeriod[i] ?? 0)}</td>)}
                  <td><b>{fmtToi(s.toi)}</b></td><td>{s.shifts}</td>
                  <td style={avg >= LONG ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>{t(avg)}</td>
                  <td>{t(longest.get(p.id) ?? 0)}</td>
                  <td>{t(x?.ev ?? 0)}</td><td>{t(x?.pp ?? 0)}</td><td>{t(x?.pk ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="muted small" style={{ marginTop: 6 }}>Average shifts over {fmtToi(LONG)} are highlighted.</div>
      </Card>
    </div>
  );
}
