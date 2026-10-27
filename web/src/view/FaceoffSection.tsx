import { useMemo, useState } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { buildInsights, faceoffMatrix, faceoffPlayers, faceoffSummary, pct, periodCount, teamPeriods, totalLine, ZONE_LABEL, type WL, type Zone } from '../../../shared/src/insights.ts';
import { rinkEnds } from '../../../shared/src/rink.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { pLabel, sideName } from '../describe.ts';
import { Rink } from '../components/Rink.tsx';
import { Compare } from '../tabs/Stats.tsx';
import { InsightList } from './InsightsSection.tsx';
import { Card, Seg, TeamToggle, rateBg, useFocus, volumeBg } from './parts.tsx';

type Metric = 'wins' | 'pct';
const ZONES: Zone[] = ['OZ', 'NZ', 'DZ'];
const show = (r: WL | undefined, m: Metric) => (!r || r.w + r.l === 0 ? '–' : m === 'wins' ? `${r.w}-${r.l}` : `${pct(r.w, r.l)}%`);

export function FaceoffSection() {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const [metric, setMetric] = useState<Metric>('wins');
  const total = d.faceoffs.length;
  const metricSeg = <Seg label="Show" value={metric} onChange={setMetric} items={[['wins', 'Wins'], ['pct', 'Win %']]} />;

  if (total === 0) {
    return (
      <div className="vw-grid">
        <Card title="Faceoffs" wide><div className="muted">No faceoffs recorded yet. Winners and where they happened will show up here as they are logged.</div></Card>
      </div>
    );
  }
  return (
    <div className="vw-grid">
      <Summary metric={metric} right={metricSeg} />
      <Insights />
      <Zones />
      <DotMap />
      <Players metric={metric} right={<><TeamToggle />{metricSeg}</>} />
      <Matrix metric={metric} />
    </div>
  );
}

/** Overall wins for both teams, and period by period. */
function Summary({ metric, right }: { metric: Metric; right: React.ReactNode }) {
  const { game, d } = useGame();
  const np = periodCount(d, game);
  const lines = (s: Side) => teamPeriods(d, game, s);
  const w = (s: Side) => totalLine(lines(s)).fow;
  return (
    <Card title="Faceoff summary" right={right} wide className="tablewrap">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b style={{ color: 'var(--home)' }}>{sideName(game, 'home')} {w('home')}</b><b style={{ color: 'var(--away)' }}>{w('away')} {sideName(game, 'away')}</b>
      </div>
      <Compare label="Faceoff wins" a={w('home')} b={w('away')} />
      <div className="muted small" style={{ textAlign: 'center', marginBottom: 8 }}>Win %: {pct(w('home'), w('away'))}% – {pct(w('away'), w('home'))}%</div>
      <table className="t">
        <thead><tr><th className="l">{metric === 'wins' ? 'Wins' : 'Win %'}</th>{Array.from({ length: np }, (_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}<th>Game</th></tr></thead>
        <tbody>
          {(['home', 'away'] as Side[]).map((s) => {
            const ls = lines(s);
            const cell = (fow: number, fol: number) => (metric === 'wins' ? String(fow) : fow + fol ? pct(fow, fol) + '%' : '–');
            return <tr key={s}><td><b style={{ color: `var(--${s})` }}>{sideName(game, s)}</b></td>{ls.map((l, i) => <td key={i}>{cell(l.fow, l.fol)}</td>)}<td><b>{cell(totalLine(ls).fow, totalLine(ls).fol)}</b></td></tr>;
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** Offensive / neutral / defensive zone win rate for the focus team. */
function Zones() {
  const { d, game } = useGame();
  const { focus } = useFocus();
  const fo = faceoffSummary(d, game, focus);
  return (
    <Card title="By zone" sub={sideName(game, focus)} right={<TeamToggle />}>
      <div className="vw-zones">
        {ZONES.map((z) => {
          const r = fo.zones[z], n = r.w + r.l;
          return (
            <div key={z} className="vw-zone" style={{ background: rateBg(pct(r.w, r.l), n, 8) }}>
              <small>{ZONE_LABEL[z]}</small>
              <b>{n ? pct(r.w, r.l) + '%' : '–'}</b>
              <span>{n ? `${r.w}-${r.l}` : 'no draws'}</span>
            </div>
          );
        })}
      </div>
      {fo.unplaced.w + fo.unplaced.l > 0 && <div className="muted small" style={{ marginTop: 8 }}>{fo.unplaced.w + fo.unplaced.l} draws have no location and are not counted in a zone.</div>}
    </Card>
  );
}

/** The rink with each dot coloured by how often the focus team wins there. */
function DotMap() {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const np = periodCount(d, game);
  const [period, setPeriod] = useState(0);
  const fo = useMemo(() => faceoffSummary(d, game, focus, period || undefined), [d, game, focus, period]);
  const { leftTeam, leftLabel, rightLabel } = rinkEnds(game);
  return (
    <Card title="Where we win" sub={`${sideName(game, focus)} · green = winning the dot, red = losing it`} right={<TeamToggle />} wide>
      <Seg label="Period" value={period} onChange={setPeriod} items={[[0, 'All periods'], ...Array.from({ length: np }, (_, i) => [i + 1, periodName(i + 1, game.rules)] as [number, string])]} />
      <div className="vw-rink">
        <Rink vertical={false} maxVh={58} leftTeam={leftTeam} leftLabel={leftLabel} rightLabel={rightLabel} dotStats={fo.dots} />
      </div>
      <div className="row wrap small muted" style={{ justifyContent: 'center', gap: 12 }}>
        <span><i className="vw-swatch" style={{ background: 'var(--ok-fill)' }} /> winning</span>
        <span><i className="vw-swatch" style={{ background: 'color-mix(in srgb, var(--ok-fill) 50%, var(--bad-fill))' }} /> even</span>
        <span><i className="vw-swatch" style={{ background: 'var(--bad-fill)' }} /> losing</span>
        <span>Deeper colour = more draws</span>
      </div>
    </Card>
  );
}

function Players({ metric, right }: { metric: Metric; right: React.ReactNode }) {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const rows = faceoffPlayers(d, game, focus);
  return (
    <Card title="Players" sub={sideName(game, focus)} right={right} wide className="tablewrap">
      {rows.length === 0 ? <div className="muted">No faceoff takers recorded for {sideName(game, focus)}.</div> : (
        <table className="t">
          <thead><tr><th className="l">Player</th><th>{metric === 'wins' ? 'W-L' : 'Win %'}</th><th>Draws</th>{ZONES.map((z) => <th key={z} title={ZONE_LABEL[z]}>{z}</th>)}</tr></thead>
          <tbody>
            {rows.map((p) => {
              const n = p.total.w + p.total.l;
              return (
                <tr key={p.id}>
                  <td>{pLabel(game, p.id)}</td>
                  <td style={{ background: rateBg(pct(p.total.w, p.total.l), n) }}><b>{show(p.total, metric)}</b></td>
                  <td>{n}</td>
                  {ZONES.map((z) => <td key={z} style={{ background: rateBg(pct(p.zones[z].w, p.zones[z].l), p.zones[z].w + p.zones[z].l, 4) }}>{show(p.zones[z], metric)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Our players against theirs, from draws where both takers were recorded. */
function Matrix({ metric }: { metric: Metric }) {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const [heat, setHeat] = useState<'rate' | 'volume'>('rate');
  const m = useMemo(() => faceoffMatrix(d, game, focus), [d, game, focus]);
  const opp: Side = focus === 'home' ? 'away' : 'home';
  const maxN = Math.max(1, ...m.rows.flatMap((r) => m.cols.map((c) => (m.cells[r][c]?.w ?? 0) + (m.cells[r][c]?.l ?? 0))));
  const rowTotal = (r: string): WL => m.cols.reduce((a, c) => ({ w: a.w + (m.cells[r][c]?.w ?? 0), l: a.l + (m.cells[r][c]?.l ?? 0) }), { w: 0, l: 0 });
  const colTotal = (c: string): WL => m.rows.reduce((a, r) => ({ w: a.w + (m.cells[r][c]?.w ?? 0), l: a.l + (m.cells[r][c]?.l ?? 0) }), { w: 0, l: 0 });
  const bg = (r: WL) => (heat === 'rate' ? rateBg(pct(r.w, r.l), r.w + r.l, 4) : volumeBg(r.w + r.l, maxN));
  return (
    <Card title="Matchups" sub={`${sideName(game, focus)} (rows) against ${sideName(game, opp)} (columns), each cell is ${metric === 'wins' ? 'wins-losses' : 'win %'}`}
      right={<><TeamToggle /><Seg label="Colour by" value={heat} onChange={setHeat} items={[['rate', 'Win %'], ['volume', 'Draws']]} /></>} wide>
      {m.rows.length === 0 ? (
        <div className="muted">Matchups appear once faceoffs are logged with both players. {m.partial > 0 && `${m.partial} draws so far are missing one of the two.`}</div>
      ) : (
        <>
          <div className="mxwrap">
            <table className="mx">
              <thead>
                <tr><th />{m.cols.map((c) => <th key={c} title={pLabel(game, c)}><span className={`dot ${opp}`} />{pLabel(game, c, true)}</th>)}<th>All</th></tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r}>
                    <th scope="row">{pLabel(game, r)}</th>
                    {m.cols.map((c) => { const v = m.cells[r][c]; return <td key={c} style={{ background: v ? bg(v) : undefined }} title={v ? `${pLabel(game, r)} vs ${pLabel(game, c)}: ${v.w}-${v.l}` : undefined}>{show(v, metric)}</td>; })}
                    <td className="tot" style={{ background: bg(rowTotal(r)) }}>{show(rowTotal(r), metric)}</td>
                  </tr>
                ))}
                <tr className="totrow"><th scope="row">All</th>{m.cols.map((c) => <td key={c} className="tot" style={{ background: bg(colTotal(c)) }}>{show(colTotal(c), metric)}</td>)}<td /></tr>
              </tbody>
            </table>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            {heat === 'rate' ? 'Green = we win this matchup, red = we lose it.' : 'Darker = more draws between the two.'}
            {m.partial > 0 && ` ${m.partial} draws aren't shown because one of the two takers wasn't recorded.`}
          </div>
        </>
      )}
    </Card>
  );
}

/** Faceoff-specific findings: who is winning, where, and which matchups to exploit or avoid. */
function Insights() {
  const { game, d } = useGame();
  const { focus } = useFocus();
  const list = useMemo(() => buildInsights(d, game, focus).filter((i) => i.area === 'Faceoffs'), [d, game, focus]);
  return (
    <Card title="Faceoff insights" sub={sideName(game, focus)} right={<TeamToggle />}>
      <InsightList items={list} empty="Not enough draws yet to call anything out. Insights appear once there are about six faceoffs, and for players after four." />
    </Card>
  );
}
