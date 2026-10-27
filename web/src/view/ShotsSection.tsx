import { useMemo, useState } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { pct, periodCount, shotZones, teamPeriods, totalLine, type PeriodLine } from '../../../shared/src/insights.ts';
import { rinkEnds } from '../../../shared/src/rink.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { pLabel, sideName } from '../describe.ts';
import { Rink, type Marker } from '../components/Rink.tsx';
import { MarkerInfo, MarkerTip } from '../components/MarkerInfo.tsx';
import { useMarkers } from '../tabs/Score.tsx';
import { Card, Seg } from './parts.tsx';

type Kind = Marker['kind'];
const KINDS: [Kind, string][] = [['goal', 'Goals'], ['shot', 'On net'], ['miss', 'Missed'], ['block', 'Blocked']];

export function ShotsSection() {
  const { game, d } = useGame();
  const all = useMarkers();
  const np = periodCount(d, game);
  const [team, setTeam] = useState<'all' | Side>('all');
  const [period, setPeriod] = useState(0);
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(KINDS.map(([k]) => k)));
  const [heat, setHeat] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const { leftTeam, leftLabel, rightLabel } = rinkEnds(game);

  const periodOf = useMemo(() => new Map(d.events.map((e) => [e.id, e.period])), [d]);
  const markers = useMemo(() => all.filter((m) => (team === 'all' || m.team === team) && (!period || periodOf.get(m.id) === period) && kinds.has(m.kind)), [all, team, period, kinds, periodOf]);
  const toggle = (k: Kind) => setKinds((cur) => { const n = new Set(cur); if (!n.delete(k)) n.add(k); return n; });

  // totals for the chosen scope (team + period), from every recorded shot — not only the ones with a location
  const sides: Side[] = team === 'all' ? ['home', 'away'] : [team];
  const scoped = (s: Side): PeriodLine => (period ? teamPeriods(d, game, s)[period - 1] : totalLine(teamPeriods(d, game, s)));
  const unplaced = d.shots.length + d.goals.length - all.length;

  return (
    <div className="vw-grid">
      <Card title="Shots by period" wide className="tablewrap">
        <table className="t">
          <thead><tr><th className="l">Shots on goal</th>{Array.from({ length: np }, (_, i) => <th key={i}>{periodName(i + 1, game.rules)}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {(['home', 'away'] as Side[]).map((s) => {
              const ls = teamPeriods(d, game, s);
              return <tr key={s}><td><b style={{ color: `var(--${s})` }}>{sideName(game, s)}</b></td>{ls.map((l, i) => <td key={i}>{l.sog}</td>)}<td><b>{totalLine(ls).sog}</b></td></tr>;
            })}
          </tbody>
        </table>
      </Card>

      <Card wide>
        <div className="vw-filters">
          <Seg label="Team" value={team} onChange={setTeam} items={[['all', 'Both teams'], ['home', sideName(game, 'home')], ['away', sideName(game, 'away')]]} />
          <Seg label="Period" value={period} onChange={setPeriod} items={[[0, 'All periods'], ...Array.from({ length: np }, (_, i) => [i + 1, periodName(i + 1, game.rules)] as [number, string])]} />
        </div>
        <div className="vw-filters">
          <div className="vw-chips" role="group" aria-label="Shot types">
            {KINDS.map(([k, l]) => <button key={k} className={`vw-chip ${kinds.has(k) ? 'on' : ''}`} aria-pressed={kinds.has(k)} onClick={() => toggle(k)}>{l}</button>)}
          </div>
          <button className={`btn sm ${heat ? 'primary' : ''}`} aria-pressed={heat} onClick={() => setHeat(!heat)}>🔥 Heat map</button>
        </div>
        <div className="vw-rink">
          <Rink vertical={false} markers={markers} heat={heat} maxVh={58} legend leftTeam={leftTeam} leftLabel={leftLabel} rightLabel={rightLabel}
            tipFor={(id) => <MarkerTip id={id} />} onTipDetails={setInfo} />
        </div>
        <div className="muted small" style={{ textAlign: 'center' }}>
          {markers.length} shown{unplaced > 0 ? ` · ${unplaced} recorded without a location` : ''} · {game[leftTeam].name || leftTeam} defends the left end
        </div>
        {info && <MarkerInfo id={info} onClose={() => setInfo(null)} />}
      </Card>

      <Card title="Shot summary" sub={period ? periodName(period, game.rules) : 'Whole game'} className="tablewrap">
        <table className="t">
          <thead><tr><th className="l" />{sides.map((s) => <th key={s} style={{ color: `var(--${s})` }}>{sideName(game, s)}</th>)}</tr></thead>
          <tbody>
            {([['Goals', (l: PeriodLine) => l.goals], ['Shots on goal', (l) => l.sog], ['Attempts', (l) => l.attempts], ['Missed', (l) => l.missed], ['Blocked', (l) => l.blocked], ['Shooting %', (l) => (l.sog ? pct(l.goals, l.sog - l.goals) + '%' : '–')]] as [string, (l: PeriodLine) => number | string][]).map(([label, get]) => (
              <tr key={label}><td>{label}</td>{sides.map((s) => <td key={s}>{get(scoped(s))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ShotLocations sides={sides} />
      <Shooters team={team} period={period} />
    </div>
  );
}

/** Where shots were taken from: in the slot, mid-range, or from the outside. */
function ShotLocations({ sides }: { sides: Side[] }) {
  const { game, d } = useGame();
  return (
    <Card title="Where shots come from" sub="Distance from the net, shots with a location only">
      {sides.map((s) => {
        const z = shotZones(d, game, s);
        const seg = [['Slot', z.slot, 'var(--ok-fill)'], ['Mid-range', z.mid, 'var(--warn-fill)'], ['Outside', z.outside, 'var(--bad-fill)']] as const;
        return (
          <div key={s} style={{ marginBottom: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ color: `var(--${s})` }}>{sideName(game, s)}</b><span className="muted small">{z.located} located</span></div>
            <div className="vw-bar" aria-hidden="true">{z.located ? seg.map(([l, n, c]) => n > 0 && <i key={l} style={{ width: `${(n / z.located) * 100}%`, background: c }} />) : null}</div>
            <div className="row wrap small muted" style={{ gap: 12 }}>{seg.map(([l, n]) => <span key={l}>{l} <b style={{ color: 'var(--text)' }}>{n}</b>{z.located ? ` (${Math.round((n / z.located) * 100)}%)` : ''}</span>)}</div>
          </div>
        );
      })}
    </Card>
  );
}

function Shooters({ team, period }: { team: 'all' | Side; period: number }) {
  const { game, d } = useGame();
  const rows = useMemo(() => {
    const m = new Map<string, { side: Side; att: number; sog: number; g: number; miss: number; block: number }>();
    const get = (side: Side, id: string) => { let r = m.get(id); if (!r) { r = { side, att: 0, sog: 0, g: 0, miss: 0, block: 0 }; m.set(id, r); } return r; };
    const ok = (side: Side, p: number) => (team === 'all' || team === side) && (!period || p === period);
    for (const g of d.goals) if (g.d.scorer && ok(g.d.team, g.ev.period)) { const r = get(g.d.team, g.d.scorer); r.att++; r.sog++; r.g++; }
    for (const s of d.shots) if (s.d.player && ok(s.d.team, s.ev.period)) {
      const r = get(s.d.team, s.d.player); r.att++;
      if (s.d.result === 'save') r.sog++; else if (s.d.result === 'miss') r.miss++; else r.block++;
    }
    return [...m.entries()].sort((a, b) => b[1].sog - a[1].sog || b[1].att - a[1].att).slice(0, 14);
  }, [d, team, period]);
  return (
    <Card title="Shooters" className="tablewrap">
      {rows.length === 0 ? <div className="muted">No shooters recorded for this view.</div> : (
        <table className="t">
          <thead><tr><th className="l">Player</th><th>Att</th><th>SOG</th><th>G</th><th>Miss</th><th>Blk</th></tr></thead>
          <tbody>{rows.map(([id, r]) => (
            <tr key={id}><td><i className={`dot ${r.side}`} style={{ display: 'inline-block', marginRight: 6 }} />{pLabel(game, id)}</td><td>{r.att}</td><td>{r.sog}</td><td>{r.g}</td><td>{r.miss}</td><td>{r.block}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}
