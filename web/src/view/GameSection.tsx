import { useState } from 'react';
import type { Player, Side } from '../../../shared/src/types.ts';
import { fmtClock, fmtToi } from '../../../shared/src/derive.ts';
import { pct, periodCount, sum, teamPeriods, totalLine, type PeriodLine } from '../../../shared/src/insights.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { pLabel, sideName } from '../describe.ts';
import { sortPlayers } from '../components/ui.tsx';
import { Compare } from '../tabs/Stats.tsx';
import { Card, TeamToggle, svPct, useFocus } from './parts.tsx';

const HOME_FIRST: Side[] = ['home', 'away'];

/** Goals by period and the final, then a box-score comparison. */
function Scoreboard() {
  const { game, d } = useGame();
  const np = periodCount(d, game);
  const periods = Array.from({ length: np }, (_, i) => i);
  return (
    <Card title="Score by period" className="tablewrap">
      <table className="t">
        <thead><tr><th>Team</th>{periods.map((i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}<th>Total</th></tr></thead>
        <tbody>
          {HOME_FIRST.map((s) => (
            <tr key={s}>
              <td><b style={{ color: `var(--${s})` }}>{sideName(game, s)}</b></td>
              {periods.map((i) => <td key={i}>{d.byPeriod.goals[s][i] ?? 0}</td>)}
              <td><b style={{ fontSize: 18 }}>{d.score[s]}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Summary() {
  const { game, d } = useGame();
  const sog = (s: Side) => sum(d.byPeriod.sog[s]);
  const fow = (s: Side) => sum(d.byPeriod.fo[s]);
  const pim = (s: Side) => sum(d.byPeriod.pim[s]);
  return (
    <Card title="Team stats">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b style={{ color: 'var(--home)' }}>{sideName(game, 'home')}</b><b style={{ color: 'var(--away)' }}>{sideName(game, 'away')}</b>
      </div>
      <Compare label="Shots on goal" a={sog('home')} b={sog('away')} />
      <Compare label="Faceoff win %" a={pct(fow('home'), fow('away'))} b={pct(fow('away'), fow('home'))} fmt={(n) => n + '%'} />
      <Compare label="Power-play goals" a={d.ppGoals.home} b={d.ppGoals.away} />
      <Compare label="Penalty minutes" a={pim('home')} b={pim('away')} />
      <div className="muted small" style={{ textAlign: 'center', marginTop: 6 }}>
        Power plays: {sideName(game, 'home')} {d.ppGoals.home}/{d.ppOpps.home} · {sideName(game, 'away')} {d.ppGoals.away}/{d.ppOpps.away} · Timeouts {d.timeouts.home}–{d.timeouts.away}
      </div>
    </Card>
  );
}

type Row = { label: string; get: (l: PeriodLine) => string; hint?: string };

/** Every counting stat for one team, period by period. */
function Breakdown() {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const lines = teamPeriods(d, game, focus);
  const tot = totalLine(lines);
  const rows: Row[] = [
    { label: 'Goals', get: (l) => String(l.goals) },
    { label: 'Shots on goal', get: (l) => String(l.sog) },
    { label: 'Shot attempts', get: (l) => String(l.attempts) },
    { label: 'Missed the net', get: (l) => String(l.missed) },
    { label: 'Blocked (their blocks)', get: (l) => String(l.blocked) },
    { label: 'Blocks (ours)', get: (l) => String(l.blocks) },
    { label: 'Faceoffs won', get: (l) => `${l.fow}/${l.fow + l.fol}` },
    { label: 'Faceoff win %', get: (l) => (l.fow + l.fol ? pct(l.fow, l.fol) + '%' : '–') },
    { label: 'Power play', get: (l) => `${l.ppGoals}/${l.ppOpps}` },
    { label: 'Short-handed goals', get: (l) => String(l.shGoals) },
    { label: 'Penalties', get: (l) => String(l.penalties) },
    { label: 'Penalty minutes', get: (l) => String(l.pim) },
  ];
  return (
    <Card title="Breakdown by period" right={<TeamToggle />} wide className="tablewrap">
      <table className="t">
        <thead><tr><th className="l">{sideName(game, focus)}</th>{lines.map((_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}<th>Total</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}><td>{r.label}</td>{lines.map((l, i) => <td key={i}>{r.get(l)}</td>)}<td><b>{r.get(tot)}</b></td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

type SortKey = 'num' | 'g' | 'a' | 'p' | 'sog' | 'pm' | 'pim';

function Players() {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const [sort, setSort] = useState<SortKey>('num');
  const stat = (p: Player) => d.players.get(p.id);
  const val = (p: Player, k: SortKey) => { const t = stat(p); return !t ? 0 : k === 'p' ? t.g + t.a : k === 'num' ? 0 : t[k]; };
  const all = sortPlayers(game[focus].players).filter((p) => p.pos !== 'G' || stat(p)?.g || stat(p)?.a);
  const rows = sort === 'num' ? all : [...all].sort((a, b) => val(b, sort) - val(a, sort));
  const goalies = game[focus].players.filter((p) => p.pos === 'G' && (stat(p)?.sa || stat(p)?.toi));
  const th = (k: SortKey, l: string) => <th><button className={`vw-sort ${sort === k ? 'on' : ''}`} onClick={() => setSort(sort === k && k !== 'num' ? 'num' : k)} aria-label={`Sort by ${l}`}>{l}{sort === k ? ' ▾' : ''}</button></th>;
  return (
    <Card title="Player stats" sub="Tap a column to sort" right={<TeamToggle />} wide className="tablewrap">
      <table className="t">
        <thead><tr><th className="l">Player</th>{th('g', 'G')}{th('a', 'A')}{th('p', 'P')}{th('sog', 'SOG')}{th('pm', '+/-')}{th('pim', 'PIM')}<th>FO</th><th>TOI</th></tr></thead>
        <tbody>
          {rows.map((p) => { const t = stat(p); return (
            <tr key={p.id}>
              <td>#{p.number} {p.name} <span className="muted small">{p.pos}</span></td>
              <td>{t?.g ?? 0}</td><td>{t?.a ?? 0}</td><td><b>{(t?.g ?? 0) + (t?.a ?? 0)}</b></td><td>{t?.sog ?? 0}</td>
              <td>{t?.pm ? (t.pm > 0 ? '+' : '') + t.pm : 0}</td><td>{t?.pim ?? 0}</td>
              <td>{t && t.fow + t.fol ? `${t.fow}-${t.fol}` : '–'}</td><td>{t?.toi ? fmtToi(t.toi) : '–'}</td>
            </tr>
          ); })}
          {rows.length === 0 && <tr><td colSpan={9} className="muted">No roster.</td></tr>}
        </tbody>
      </table>
      {goalies.length > 0 && (
        <table className="t" style={{ marginTop: 14 }}>
          <thead><tr><th className="l">Goalie</th><th>SA</th><th>SV</th><th>GA</th><th>SV%</th><th>TOI</th></tr></thead>
          <tbody>{goalies.map((p) => { const t = stat(p)!; return (
            <tr key={p.id}><td>#{p.number} {p.name}</td><td>{t.sa}</td><td>{t.sv}</td><td>{t.ga}</td><td>{svPct(t.sv, t.sa)}</td><td>{fmtToi(t.toi)}</td></tr>
          ); })}</tbody>
        </table>
      )}
    </Card>
  );
}

/** Goals and penalties in game order, grouped by period. */
function Summaries() {
  const { game, d } = useGame();
  const np = periodCount(d, game);
  const byPeriod = <T extends { ev: { period: number } }>(items: T[]) => Array.from({ length: np }, (_, i) => ({ period: i + 1, items: items.filter((x) => x.ev.period === i + 1) })).filter((g) => g.items.length);
  const goals = byPeriod(d.goals), pens = byPeriod(d.penalties);
  return (
    <>
      <Card title="Scoring summary">
        {goals.length === 0 && <div className="muted">No goals yet.</div>}
        {goals.map((g) => (
          <div key={g.period}>
            <div className="vw-period">{periodName(g.period, game.rules)}</div>
            {g.items.map((x) => (
              <div className="logrow" key={x.ev.id}>
                <div className="when"><b>{fmtClock(x.ev.clock)}</b></div>
                <span className={`dot ${x.d.team}`} />
                <div className="grow">
                  <b>{x.d.scorer ? pLabel(game, x.d.scorer) : sideName(game, x.d.team)}</b> <span className="muted small">{x.d.strength}</span>
                  <div className="muted small">{x.d.assists?.length ? 'Assists: ' + x.d.assists.map((a) => pLabel(game, a)).join(', ') : 'Unassisted'}{x.goalie !== undefined && ` · vs ${x.goalie ? pLabel(game, x.goalie, true) : 'empty net'}`}</div>
                </div>
                <b>{x.away}–{x.home}</b>
              </div>
            ))}
          </div>
        ))}
      </Card>
      <Card title="Penalties">
        {pens.length === 0 && <div className="muted">No penalties.</div>}
        {pens.map((g) => (
          <div key={g.period}>
            <div className="vw-period">{periodName(g.period, game.rules)}</div>
            {g.items.map((x) => (
              <div className="logrow" key={x.ev.id}>
                <div className="when"><b>{fmtClock(x.ev.clock)}</b></div>
                <span className={`dot ${x.d.team}`} />
                <div className="grow"><b>{x.d.player ? pLabel(game, x.d.player) : sideName(game, x.d.team)}</b><div className="muted small">{x.d.label}{x.endedByGoal ? ' · ended by PP goal' : ''}</div></div>
                <b>{x.d.minutes}′</b>
              </div>
            ))}
          </div>
        ))}
      </Card>
    </>
  );
}

export function GameSection() {
  return (
    <div className="vw-grid">
      <Scoreboard />
      <Summary />
      <Breakdown />
      <Players />
      <Summaries />
    </div>
  );
}
