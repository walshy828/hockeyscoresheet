import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameEvent, Player, PenaltyCategory, Side, Strength } from '../../../shared/src/types.ts';
import { fmtClock, fmtToi, activePenalties, strengthNow, penaltyReleasedBy, other as otherSide } from '../../../shared/src/derive.ts';
import { defaultCategory, penaltyCategories, penaltyTypes, periodName } from '../../../shared/src/rules.ts';
import { STRENGTH_INFO, rinkEnds } from '../../../shared/src/rink.ts';
import { useGame } from '../ctx.ts';
import { ClockDisplay, useClock } from '../components/Clock.tsx';
import { Rink, RINK_H, RINK_W, type Marker } from '../components/Rink.tsx';
import type { ActionInit } from '../components/ActionSheet.tsx';
import { GoalieSheet, goalieLabel } from '../components/GoalieSheet.tsx';
import { VoiceButton } from '../components/Voice.tsx';
import { PlayerChip, Sheet, TeamName, UndoButton, sortPlayers, toast } from '../components/ui.tsx';
import { describe, pLabel, sideName } from '../describe.ts';
import { teamVars, useIsDark, useLocalSetting } from '../theme.ts';
import { ScratchButton } from '../components/ScratchPad.tsx';
import { EditSheet, LocPin } from './Log.tsx';
import { LinesEditor } from './Lines.tsx';
import { LINE_KINDS, isForward, isSkater, lineSetFor, planSwap, unitSize, type LineKind } from '../../../shared/src/lines.ts';
import { FaceoffFlow } from '../components/FaceoffFlow.tsx';
import { MarkerInfo, MarkerTip } from '../components/MarkerInfo.tsx';
import { FeedFilter, NO_FILTER, matches, type Filter } from '../components/FeedFilter.tsx';
import { InfractionPicker } from '../components/InfractionPicker.tsx';
import { PenaltySheet } from '../components/PenaltySheet.tsx';
import { WhenField } from '../components/WhenField.tsx';
import type { ClockTime } from '../actions.ts';
import { useMarkers } from './Score.tsx';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const STRENGTHS: Strength[] = ['EV', 'PP', 'SH', 'EN', 'PS'];

interface Nav { onSettings: () => void; onHome: () => void; onShare: () => void; toggleMode?: () => void }

/** --home/--away made legible for the theme; pass a team to also tint the surface with that team's colour */
function useTeamVars(team?: Side) {
  const { game } = useGame();
  const dark = useIsDark();
  return teamVars(game.home.color, game.away.color, dark, team) as React.CSSProperties;
}
type Flow = { kind: 'shot' | 'penalty' | 'ice' | 'faceoff'; team: Side; player?: string; result?: 'save' | 'miss' | 'block' | 'goal'; x?: number; y?: number; edit?: GameEvent };

/** Landscape scoring screen: home controls left, away right, feed in the middle; shot/penalty flows overlay it. */
export function LandscapeScore(nav: Nav) {
  const { game, d, actions } = useGame();
  const c = useClock();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [editing, setEditing] = useState<GameEvent | null>(null);
  const [view, setView] = useState<'feed' | 'rink'>('feed');
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [penId, setPenId] = useState<string | null>(null);
  const vars = useTeamVars(filter.team === 'all' ? undefined : filter.team);

  const open = (i: ActionInit) => i.kind === 'faceoff'
    ? setFlow({ kind: 'faceoff', team: i.team, player: i.player, x: i.x, y: i.y })
    : setFlow({ kind: i.kind === 'penalty' ? 'penalty' : 'shot', team: i.team, result: i.kind === 'goal' ? 'goal' : undefined, x: i.x, y: i.y });
  /** goals, shots and penalties reopen their entry screen in edit mode; everything else uses the generic sheet */
  const editEvent = (e: GameEvent) => {
    if (e.type === 'goal') setFlow({ kind: 'shot', team: e.data.team, result: 'goal', edit: e });
    else if (e.type === 'shot') setFlow({ kind: 'shot', team: e.data.team, result: e.data.result, edit: e });
    else if (e.type === 'penalty') setFlow({ kind: 'penalty', team: e.data.team, edit: e });
    else setEditing(e);
  };
  const pens = activePenalties(d);
  const sog = (s: Side) => d.byPeriod.sog[s].reduce((a, b) => a + b, 0);

  const feed = useMemo(() => d.events
    .filter((e) => e.type !== 'shift' && e.type !== 'clock')
    .filter((e) => matches(e, filter))
    .sort((a, b) => b.wall - a.wall), [d, filter]);

  /** seconds each on-ice skater has been out, from their latest shift start */
  const shiftSecs = (s: Side, id: string) => {
    let st = 0;
    for (const sh of d.shifts) if (sh.side === s && sh.player === id) st = Math.max(st, sh.start);
    return Math.max(0, d.nowElapsed - st);
  };
  const shiftTone = (secs: number) => (secs <= 45 ? 'ok' : secs <= 75 ? 'warn' : 'bad');
  /** on-ice skaters ordered LW, C, RW, D, D, then any extra attacker last */
  const orderedOnIce = (s: Side) => {
    const sk = game[s].players.filter((p) => p.pos !== 'G' && d.onIce[s].has(p.id));
    const fwd: (typeof sk[number] | undefined)[] = [undefined, undefined, undefined];
    const slot: Record<string, number> = { LW: 0, C: 1, RW: 2 };
    const spare: typeof sk = [];
    for (const p of sk.filter((q) => q.pos !== 'D')) {
      const i = slot[p.pos];
      if (i !== undefined && !fwd[i]) fwd[i] = p; else spare.push(p);
    }
    for (let i = 0; i < 3 && spare.length; i++) if (!fwd[i]) fwd[i] = spare.shift();
    const dmen = sk.filter((q) => q.pos === 'D');
    return [...fwd.filter((p): p is typeof sk[number] => !!p), ...dmen.slice(0, 2), ...spare, ...dmen.slice(2)];
  };
  const onIceNums = (s: Side) => orderedOnIce(s).map((p, i) => (
    <span key={p.id}>{i > 0 && ' · '}<span className={`shift-${shiftTone(shiftSecs(s, p.id))}`}>{p.number}</span></span>
  ));

  /** longest current shift among skaters on the ice (game-clock seconds), or null if nobody is out */
  const shiftTime = (s: Side) => {
    const ids = new Set(game[s].players.filter((p) => p.pos !== 'G' && d.onIce[s].has(p.id)).map((p) => p.id));
    if (!ids.size) return null;
    const latest = new Map<string, number>();
    for (const sh of d.shifts) if (sh.side === s && ids.has(sh.player)) latest.set(sh.player, Math.max(latest.get(sh.player) ?? 0, sh.start));
    return Math.max(0, ...[...latest.values()].map((st) => d.nowElapsed - st));
  };

  const col = (s: Side) => (
    <div className={`ls-col ${s}`}>
      <button className="ls-btn shot" onClick={() => setFlow({ kind: 'shot', team: s })}>SHOT</button>
      <button className="ls-btn goal" onClick={() => setFlow({ kind: 'shot', team: s, result: 'goal' })}>GOAL</button>
      <button className="ls-btn pen" onClick={() => setFlow({ kind: 'penalty', team: s })}>PENALTY</button>
      <button className="ls-btn ice" onClick={() => setFlow({ kind: 'ice', team: s })}>ON ICE<small className="ls-ice">{onIceNums(s).length ? onIceNums(s) : 'none set'}</small>{shiftTime(s) !== null && <small className="ls-shift">⏱ {fmtToi(shiftTime(s)!)}</small>}</button>
      {s === 'home'
        ? <button className="ls-btn foff" onClick={() => setFlow({ kind: 'faceoff', team: 'home' })}>FACEOFF</button>
        : <button className={`ls-btn clk ${c.running ? 'stop' : 'go'}`} onClick={() => void actions.toggleClock()}>{c.running ? 'STOP CLOCK' : 'START CLOCK'}</button>}
    </div>
  );

  return (
    <div className={`ls ${filter.team === 'all' ? '' : 'team-tint'}`} style={vars}>
      <header className="ls-top">
        <button className="ls-menu" aria-label="All games" onClick={nav.onHome}>🏠</button>
        <div className="ls-team home"><TeamName color={game.home.color}>{sideName(game, 'home')}</TeamName><small>SOG {sog('home')}</small></div>
        <div className="ls-score home">{d.score.home}</div>
        <ClockDisplay compact />
        <div className="ls-score away">{d.score.away}</div>
        <div className="ls-team away"><TeamName color={game.away.color}>{sideName(game, 'away')}</TeamName><small>SOG {sog('away')}</small></div>
        <div className="ls-util">
          <ScratchButton />
          <button className="btn sm icon" aria-label="Share and export" onClick={nav.onShare}>⤴</button>
          {nav.toggleMode && (
            <div className="seg ls-mode" role="radiogroup" aria-label="Mode">
              <button className="on" aria-checked="true" role="radio">Score</button>
              <button aria-checked="false" role="radio" onClick={nav.toggleMode}>View</button>
            </div>
          )}
        </div>
      </header>
      {pens.length > 0 && <div className="pens ls-pens">{pens.map((p) => { const num = (id?: string) => pLabel(game, id, true); return (
        <button key={p.ev.id} className={`pen ${p.d.team}`} aria-label="Penalty details" onClick={() => setPenId(p.ev.id)}>{p.d.player ? num(p.d.player) : p.d.servedBy ? '' : sideName(game, p.d.team).slice(0, 4)}{p.d.servedBy ? (p.d.player ? ' srv ' : 'srv ') + num(p.d.servedBy) : ''} {p.d.minutes}′ {fmtToi(p.remaining)}</button>); })}</div>}
      <div className="ls-main">
        {col('home')}
        <section className="ls-mid">
          {view === 'feed' && <FeedFilter value={filter} onChange={setFilter} />}
          {view === 'feed' ? (
            <div className="ls-feed">
              {feed.length === 0 && <div className="muted" style={{ padding: 12 }}>{d.events.length ? 'No events match the filter.' : 'Nothing recorded yet.'}</div>}
              {feed.map((e) => { const x = describe(game, e); return (
                <button key={e.id} className="ls-row" onClick={() => editEvent(e)}>
                  <b>{periodName(e.period, game.rules)} {fmtClock(e.clock)}</b>{x.team ? <i className={`dot ${x.team}`} /> : <i className="dot" />}
                  <span>{x.title}{x.sub && <small>{x.sub}</small>}</span>
                  <LocPin e={e} />
                </button>); })}
            </div>
          ) : <MapView filter={filter} onFilter={setFilter} />}
          <div className="ls-tools">
            <UndoButton className="btn sm" onUndo={() => void actions.undoLast()} />
            <button className="btn sm" onClick={() => setView(view === 'feed' ? 'rink' : 'feed')}>{view === 'feed' ? <><RinkIcon /> Rink</> : '📋 Feed'}</button>
            <VoiceButton onOpenAction={open} />
            <button className="btn sm" onClick={nav.onSettings}>⚙ Game settings</button>
          </div>
        </section>
        {col('away')}
      </div>

      {flow && (flow.kind === 'faceoff' ? <FaceoffFlow key="f" init={{ team: flow.team, player: flow.player, x: flow.x, y: flow.y }} onClose={() => setFlow(null)} /> : flow.kind === 'ice' ? <IceFlow key="i" init={flow} onClose={() => setFlow(null)} /> : flow.kind === 'shot' ? <ShotFlow key="s" init={flow} onClose={() => setFlow(null)} /> : <PenaltyFlow key="p" init={flow} onClose={() => setFlow(null)} />)}
      {editing && <EditSheet e={editing} onClose={() => setEditing(null)} />}
      {penId && <PenaltySheet id={penId} onClose={() => setPenId(null)} onEdit={() => { const e = d.events.find((x) => x.id === penId); setPenId(null); if (e) editEvent(e); }} />}
    </div>
  );
}

function RinkIcon() {
  return (
    <svg viewBox="0 0 40 20" width="22" height="11" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <rect x="1" y="1" width="38" height="18" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="20" y1="1" x2="20" y2="19" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const ZOOM_STEPS = [2, 3, 4, 6];
const MAX_ZOOM = 8;

/** touch screens zoom by pinching; the +/- stepper and picture-in-picture are desktop-only */
function useCoarse() {
  const q = '(pointer: coarse)';
  const [coarse, setCoarse] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(q);
    const on = () => setCoarse(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return coarse;
}

type Zoom = { x: number; y: number; level: number };

/** two-finger pinch zooms (and drags to pan) the rink stage */
function usePinch(zoom: Zoom | null, setZoom: (z: Zoom | null) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef(zoom);
  live.current = zoom;
  const g = useRef<{ d: number; level: number; mx: number; my: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const two = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) { g.current = null; return; }
      const r = el.getBoundingClientRect();
      const t = two(e);
      const z = live.current;
      const level = z?.level ?? 1;
      // rink point under the fingers, so zooming from the full view lands where you pinch
      const x = z ? z.x : ((t.mx - r.left) / r.width) * RINK_W;
      const y = z ? z.y : ((t.my - r.top) / r.height) * RINK_H;
      g.current = { ...t, level, x, y };
    };
    const move = (e: TouchEvent) => {
      const s = g.current;
      if (!s || e.touches.length !== 2) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const t = two(e);
      const level = Math.min(MAX_ZOOM, Math.max(1, s.level * (t.d / s.d)));
      if (level < 1.05) { setZoom(null); return; }
      // drag the midpoint to pan: px -> rink units at the current level
      const k = RINK_W / level / r.width;
      setZoom({ level, x: s.x - (t.mx - s.mx) * k, y: s.y - (t.my - s.my) * k });
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) g.current = null; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [setZoom]);
  return ref;
}

/** picture-in-picture of the whole rink with a red box over the zoomed area; tap or drag to move the view */
function MiniMap({ markers, zoom, onMove }: { markers: Marker[]; zoom: { x: number; y: number; level: number }; onMove: (x: number, y: number) => void }) {
  const PAD = 3;
  const w = RINK_W / zoom.level, h = RINK_H / zoom.level;
  const left = Math.min(RINK_W - w, Math.max(0, zoom.x - w / 2));
  const top = Math.min(RINK_H - h, Math.max(0, zoom.y - h / 2));
  const pct = (v: number, total: number) => `${((v + PAD) / (total + 2 * PAD)) * 100}%`;
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * (RINK_W + 2 * PAD) - PAD;
    const y = ((e.clientY - r.top) / r.height) * (RINK_H + 2 * PAD) - PAD;
    onMove(Math.round(Math.min(RINK_W, Math.max(0, x)) * 10) / 10, Math.round(Math.min(RINK_H, Math.max(0, y)) * 10) / 10);
  };
  return (
    <div className="rink-mini" role="slider" aria-label="Zoomed area; tap or drag to move"
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e); }}
      onClick={(e) => e.stopPropagation()}>
      <Rink vertical={false} markers={markers} maxVh={100} />
      <div className="rink-mini-box" style={{ left: pct(left, RINK_W), top: pct(top, RINK_H), width: `${(w / (RINK_W + 2 * PAD)) * 100}%`, height: `${(h / (RINK_H + 2 * PAD)) * 100}%` }} />
    </div>
  );
}

function MapView({ filter, onFilter }: { filter: Filter; onFilter: (f: Filter) => void }) {
  const base = useMarkers();
  const { game, d } = useGame();
  const c = useClock();
  // by default only the period in play; an explicit period in the filter wins
  const [allPeriods, setAllPeriods] = useState(false);
  const [highlight, setHighlight] = useState<Set<Marker['kind']>>(new Set());
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const coarse = useCoarse();
  const stage = usePinch(zoom, setZoom);
  const scoped = !allPeriods && filter.period === 'all';
  const markers = useMemo(() => {
    const ok = new Set(d.events.filter((e) => matches(e, filter) && (!scoped || e.period === c.period)).map((e) => e.id));
    const fo = d.faceoffs.filter((f) => f.d.x != null).map((f): Marker => ({ id: f.ev.id, x: f.d.x!, y: f.d.y!, team: f.d.team, kind: 'faceoff' }));
    return [...base, ...fo].filter((m) => ok.has(m.id));
  }, [base, d, filter, scoped, c.period]);
  const { leftTeam, leftLabel, rightLabel } = rinkEnds(game);
  const [info, setInfo] = useState<string | null>(null);
  const step = (dir: 1 | -1) => setZoom((z) => {
    const i = z ? ZOOM_STEPS.indexOf(z.level) + dir : 0;
    return i < 0 ? null : { x: z?.x ?? 100, y: z?.y ?? 42.5, level: ZOOM_STEPS[Math.min(i, ZOOM_STEPS.length - 1)] };
  });
  return (
    <div className="ls-feed" style={{ display: 'grid', placeItems: 'center' }}>
      <div className="rink-bar">
        <div className="rink-bar-l">
          <FeedFilter value={filter} onChange={onFilter} inline />
          <div className="seg">
            <button className={scoped ? 'on' : ''} disabled={filter.period !== 'all'} onClick={() => setAllPeriods(false)}>{periodName(c.period, game.rules)}</button>
            <button className={!scoped ? 'on' : ''} onClick={() => setAllPeriods(true)}>All periods</button>
          </div>
        </div>
        <div className="rink-bar-r">
          {zoom && !coarse && <div className="seg rink-zoom" aria-label="Magnification">
            <button aria-label="Less magnification" onClick={() => step(-1)}>−</button>
            <span className="lvl">{zoom.level}×</span>
            <button aria-label="More magnification" disabled={zoom.level === ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => step(1)}>+</button>
          </div>}
          {(!coarse || zoom) && <button className="rink-ico" aria-label={zoom ? 'Zoom out' : 'Zoom in'} onClick={() => setZoom(zoom ? null : { x: 100, y: 42.5, level: ZOOM_STEPS[0] })}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d={zoom ? 'M7 10h6M15 15l5 5' : 'M7 10h6M10 7v6M15 15l5 5'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>}
        </div>
      </div>
      <div className="rink-stage" ref={stage} style={coarse ? { touchAction: 'none' } : undefined}>
        <Rink vertical={false} markers={markers} maxVh={50} legend leftTeam={leftTeam} leftLabel={leftLabel} rightLabel={rightLabel}
          tipFor={(id) => <MarkerTip id={id} />} onTipDetails={setInfo}
          zoom={zoom} onLongPress={(x, y) => setZoom((z) => ({ x, y, level: z?.level ?? ZOOM_STEPS[1] }))}
          highlight={highlight} onHighlight={setHighlight} />
        {zoom && !coarse && <MiniMap markers={markers} zoom={zoom} onMove={(x, y) => setZoom({ ...zoom, x, y })} />}
      </div>
      <div className="muted small">{coarse ? 'Pinch to zoom, drag with two fingers to pan' : zoom ? 'Press and hold to re-centre the zoom' : 'Press and hold the ice to zoom in'}</div>
      {info && <MarkerInfo id={info} onClose={() => setInfo(null)} />}
    </div>
  );
}

/** header shared by both flows: Cancel · team toggle · Done (plus a two-tap Delete when editing) */
function FlowHead({ team, setTeam, onClose, onDone, canDone, label, onDelete }: { team: Side; setTeam: (s: Side) => void; onClose: () => void; onDone: () => void; canDone: boolean; label: string; onDelete?: () => void }) {
  const { game } = useGame();
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDel]);
  return (
    <div className="lf-head" style={onDelete ? { gridTemplateColumns: 'auto 1fr auto' } : undefined}>
      <button className="btn danger" onClick={onClose}>Cancel</button>
      <div className="seg lf-team" role="radiogroup" aria-label="Team">
        {(['home', 'away'] as Side[]).map((s) => <button key={s} className={`${s} ${team === s ? 'on' : ''}`} onClick={() => setTeam(s)}>{sideName(game, s)}</button>)}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {onDelete && <button className="btn danger" onClick={() => { if (!confirmDel) setConfirmDel(true); else onDelete(); }}>{confirmDel ? 'Tap again' : 'Delete'}</button>}
        <button className="btn primary" disabled={!canDone} onClick={onDone}>{label}</button>
      </div>
    </div>
  );
}

type Slot = 'shooter' | 'a1' | 'a2' | 'blocker';

function ShotFlow({ init, onClose }: { init: Flow; onClose: () => void }) {
  const edit = init.edit;
  const ed = edit?.data;
  const { game, d, actions } = useGame();
  const c = useClock();
  const [team, setTeam] = useState(init.team);
  const [result, setResult] = useState<'save' | 'miss' | 'block' | 'goal'>(init.result ?? 'save');
  const [loc, setLoc] = useState<{ x: number; y: number } | null>(() => {
    const x = init.x ?? ed?.x, y = init.y ?? ed?.y;
    return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
  });
  const [who, setWho] = useState<Partial<Record<Slot, string>>>(() => !ed ? {} : {
    shooter: (edit!.type === 'goal' ? ed.scorer : ed.player) ?? undefined,
    a1: ed.assists?.[0], a2: ed.assists?.[1], blocker: ed.blocker ?? undefined,
  });
  const [active, setActive] = useState<Slot>('shooter');
  const [strength, setStrength] = useState<Strength | null>(ed?.strength ?? null);
  const [goalieOpen, setGoalieOpen] = useState(false);
  const [atTime, setAtTime] = useState<ClockTime | null>(edit ? { period: edit.period, clock: edit.clock } : null);
  const [release, setRelease] = useState(true);
  const vars = useTeamVars(team);
  const auto = strengthNow(d, team);
  const str = strength ?? auto;
  const { leftTeam, leftLabel, rightLabel } = rinkEnds(game);
  const slots: Slot[] = result === 'goal' ? ['shooter', 'a1', 'a2'] : result === 'block' ? ['shooter', 'blocker'] : ['shooter'];
  const cur: Slot = slots.includes(active) ? active : 'shooter';
  const side = cur === 'blocker' ? other(team) : team;
  const roster = sortPlayers(game[side].players.filter((p) => !p.scratched)).sort((a, b) => Number(d.onIce[side].has(b.id)) - Number(d.onIce[side].has(a.id)));
  const label: Record<Slot, string> = { shooter: result === 'goal' ? 'Scorer' : 'Shooter', a1: 'Assist', a2: 'Assist', blocker: 'Blocker' };
  const num = (id?: string) => (id ? pLabel(game, id, true) : '?');

  const pick = (id?: string) => {
    const next = { ...who };
    for (const k of Object.keys(next) as Slot[]) if (next[k] === id && k !== cur) delete next[k]; // a player holds one slot
    if (id === undefined || next[cur] === id) delete next[cur]; else next[cur] = id;
    setWho(next);
    if (id !== undefined && next[cur]) setActive(slots[slots.indexOf(cur) + 1] ?? cur); // advance to the next slot
  };
  const changeTeam = (s: Side) => { if (s !== team) { setTeam(s); setWho({}); setActive('shooter'); setStrength(null); } };
  const changeResult = (r: typeof result) => { setResult(r); if (r !== 'goal') setWho((w) => ({ ...w, a1: undefined, a2: undefined })); if (r !== 'block') setWho((w) => ({ ...w, blocker: undefined })); };

  const done = async () => {
    const at = loc ?? {};
    const when = atTime ?? undefined;
    if (edit) {
      // null (not undefined) so cleared values survive JSON sync
      const loc2 = { x: loc?.x ?? null, y: loc?.y ?? null };
      const patch = result === 'goal'
        ? { team, scorer: who.shooter ?? null, assists: [who.a1, who.a2].filter(Boolean), strength: str, ...loc2 }
        : { team, player: who.shooter ?? null, result, blocker: result === 'block' ? who.blocker ?? null : null, strength: str, ...loc2 };
      await actions.edit(edit.id, patch, when?.period, when?.clock);
    } else if (result === 'goal') await actions.goal({ team, scorer: who.shooter, assists: [who.a1, who.a2].filter(Boolean) as string[], strength: str, ...(rel && !release ? { keepPenalty: true } : {}), ...at }, when);
    else await actions.shot({ team, player: who.shooter, result, blocker: result === 'block' ? who.blocker : undefined, strength: str, ...at }, when);
    onClose();
  };
  const remove = async () => { await actions.voidEvent(edit!.id); onClose(); };
  const opp = other(team);
  const rel = !edit && result === 'goal' && str === 'PP' ? penaltyReleasedBy(d, team, game.rules.minorMinutes) : undefined;

  return (
    <div className="lf team-tint" style={vars} role="dialog" aria-modal="true" aria-label="Shot details">
      <FlowHead team={team} setTeam={changeTeam} onClose={onClose} onDone={() => void done()} canDone label="Done" onDelete={edit ? () => void remove() : undefined} />
      <div className="lf-body">
        <div className="lf-rink">
          <Rink vertical={false} maxVh={62} pending={loc} perspective={team} leftTeam={leftTeam} leftLabel={leftLabel} rightLabel={rightLabel} onTap={(x, y) => setLoc({ x, y })} />
          <div className="muted small">{loc ? <>Location set · <button className="btn sm ghost" onClick={() => setLoc(null)}>clear</button></> : '① Tap the ice where it happened (optional), then ② result and ③ players on the right'}</div>
        </div>
        <div className="lf-who">
          <div className="seg lf-res">
            {([['save', 'On net'], ['miss', 'Missed'], ['block', 'Blocked'], ['goal', 'GOAL']] as const).filter(([k]) => !edit || (k === 'goal') === (result === 'goal')).map(([k, l]) => <button key={k} className={`${k} ${result === k ? 'on' : ''}`} onClick={() => changeResult(k)}>{l}</button>)}
          </div>
          <div className="lf-slots">
            {slots.map((s) => <button key={s} className={`lf-slot ${cur === s ? 'on' : ''}`} onClick={() => setActive(s)}><small>{label[s]}</small><b>{num(who[s])}</b></button>)}
          </div>
          <div className="chips">
            <button className={`chip ${who[cur] === undefined ? 'on' : ''}`} onClick={() => pick(undefined)}><span>?</span><small>unknown</small></button>
            {roster.map((p) => <PlayerChip key={p.id} p={p} ice={d.onIce[side].has(p.id)} on={who[cur] === p.id} onTap={() => pick(p.id)} />)}
          </div>
          {rel && (
            <label className="lf-opt"><input type="checkbox" checked={release} onChange={(e) => setRelease(e.target.checked)} />
              End {sideName(game, rel.d.team)}{rel.d.player ? ' ' + pLabel(game, rel.d.player, true) : ''} {rel.d.label} penalty (power-play goal)</label>
          )}
          <div className="seg">
            {STRENGTHS.map((s) => <button key={s} className={str === s ? 'on' : ''} title={STRENGTH_INFO[s]} onClick={() => setStrength(s)}>{s === 'EV' ? 'Even' : s === 'PP' ? 'Power play' : s === 'SH' ? 'Short-handed' : s === 'EN' ? 'Empty net' : 'Pen. shot'}{s === auto && strength === null && auto !== 'EV' ? ' •' : ''}</button>)}
          </div>
          <div className="lf-meta">
            <div className="lf-def">Defending goalie: <b>{goalieLabel(game, d.goalie[opp])}</b> <button className="btn sm ghost" onClick={() => setGoalieOpen(true)}>change</button></div>
            <WhenField value={atTime} onChange={setAtTime} />
          </div>
        </div>
      </div>
      {goalieOpen && <GoalieSheet side={opp} onClose={() => setGoalieOpen(false)} />}
    </div>
  );
}

function PenaltyFlow({ init, onClose }: { init: Flow; onClose: () => void }) {
  const { game, d, actions } = useGame();
  const edit = init.edit;
  const ed = edit?.data;
  const [team, setTeam] = useState(init.team);
  const [player, setPlayer] = useState<string | undefined>(ed?.player ?? undefined);
  const [servedBy, setServedBy] = useState<string | undefined>(ed?.servedBy ?? undefined);
  const [serveOpen, setServeOpen] = useState(!!ed?.servedBy);
  const [type, setType] = useState<ReturnType<typeof penaltyTypes>[number] | null>(() => !ed ? null : penaltyTypes(game.rules).find((t) => t.code === ed.code) ?? ({ code: ed.code, label: ed.label, minutes: ed.minutes } as any));
  const [cat, setCat] = useState<PenaltyCategory>(ed?.category ?? 'minor');
  const [custom, setCustom] = useState(ed && ed.category === 'custom' ? String(ed.minutes) : '2');
  const [noPP, setNoPP] = useState<boolean | null>(ed ? !!ed.noPP : null);
  const [notes, setNotes] = useState(ed?.notes ?? '');
  const vars = useTeamVars(team);
  const [at, setAt] = useState<ClockTime | null>(edit ? { period: edit.period, clock: edit.clock } : null);
  const cats = penaltyCategories(game.rules);
  const ci = cats.find((x) => x.id === cat)!;
  const minutes = cat === 'custom' ? Math.round(Number(custom) * 10) / 10 : ci.minutes;
  const noPower = noPP === null ? !ci.shorts : noPP;
  const sorted = sortPlayers(game[team].players.filter((p) => !p.scratched)).sort((a, b) => Number(d.onIce[team].has(b.id)) - Number(d.onIce[team].has(a.id)));
  const pickType = (t: NonNullable<typeof type>) => {
    setType(t); setCat(defaultCategory(t, game.rules)); setNoPP(null);
    if (t.code === 'TMM' || t.code === 'BENCH') setServeOpen(true); // no individual to blame: a teammate serves it
  };
  const done = async () => {
    if (edit) {
      // null (not undefined) so cleared values survive JSON sync
      await actions.edit(edit.id, {
        team, player: player ?? null, code: type!.code, label: type!.label, minutes, category: cat,
        servedBy: servedBy && servedBy !== player ? servedBy : null,
        notes: notes.trim() || null,
        noPP: noPower ? true : null,
      }, at?.period, at?.clock);
    } else {
      await actions.penalty({
        team, player, code: type!.code, label: type!.label, minutes, category: cat,
        ...(servedBy && servedBy !== player ? { servedBy } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(noPower ? { noPP: true } : {}),
      }, at ?? undefined);
    }
    onClose();
  };
  const remove = async () => { await actions.voidEvent(edit!.id); onClose(); };
  return (
    <div className="lf team-tint" style={vars} role="dialog" aria-modal="true" aria-label="Penalty details">
      <FlowHead team={team} setTeam={(s) => { if (s !== team) { setTeam(s); setPlayer(undefined); setServedBy(undefined); } }} onClose={onClose} onDone={() => void done()} canDone={!!type && minutes > 0} label="Done" onDelete={edit ? () => void remove() : undefined} />
      <div className="lf-body">
        <div className="lf-who">
          <div className="muted small">Penalized player</div>
          <div className="chips">
            <button className={`chip ${player === undefined ? 'on' : ''}`} onClick={() => setPlayer(undefined)}><span>?</span><small>unknown</small></button>
            {sorted.map((p) => <PlayerChip key={p.id} p={p} ice={d.onIce[team].has(p.id)} on={player === p.id} onTap={() => { setPlayer(p.id); if (servedBy === p.id) setServedBy(undefined); }} />)}
          </div>
          {!serveOpen
            ? <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setServeOpen(true)}>Served by someone else…</button>
            : (<>
              <div className="muted small">Served by (too many players, double minor, etc.) <button className="btn sm ghost" onClick={() => { setServeOpen(false); setServedBy(undefined); }}>same player</button></div>
              <div className="chips">
                {sorted.filter((p) => p.id !== player).map((p) => <PlayerChip key={p.id} p={p} ice={d.onIce[team].has(p.id)} on={servedBy === p.id} onTap={() => setServedBy(servedBy === p.id ? undefined : p.id)} />)}
              </div>
            </>)}
        </div>
        <div className="lf-who">
          <div className="muted small">Infraction</div>
          <InfractionPicker types={penaltyTypes(game.rules)} selected={type?.code} onPick={pickType} mark />
          {type?.gm && <div className="muted small">* Usually also an automatic game misconduct / ejection — add a Game misconduct penalty if called.</div>}
          <textarea className="lf-note" rows={2} placeholder="Notes (optional)" aria-label="Penalty notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="lf-foot">
        <WhenField value={at} onChange={setAt} />
        <div className="seg">
          {cats.map((x) => <button key={x.id} className={cat === x.id ? 'on' : ''} onClick={() => { setCat(x.id); setNoPP(null); }}>{x.label}{x.id === 'custom' ? '' : ` · ${x.minutes}:00`}</button>)}
        </div>
        {cat === 'custom' && (
          <label className="lf-cust">Length <input inputMode="decimal" value={custom} onFocus={(e) => e.target.select()} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))} /> minutes</label>
        )}
        <div className="seg">
          <button className={!noPower ? 'on' : ''} onClick={() => setNoPP(false)}>Team plays short (power play for {sideName(game, other(team))})</button>
          <button className={noPower ? 'on' : ''} onClick={() => setNoPP(true)}>No power play (player serves alone)</button>
        </div>
      </div>
    </div>
  );
}


/** On-ice flow: pick a team, tap a saved line to put it out, or swap individual players. */
function IceFlow({ init, onClose }: { init: Flow; onClose: () => void }) {
  const { game, d, actions } = useGame();
  const [team, setTeam] = useState(init.team);
  const [editLines, setEditLines] = useState(false);
  const [goalieLog, setGoalieLog] = useState(false);
  const vars = useTeamVars(team);
  const [incoming, setIncoming] = useState<string | null>(null); // bench player waiting to replace someone
  const roster = game[team].players;
  const posOf = (id: string) => roster.find((p) => p.id === id)?.pos;
  const players = sortPlayers(roster.filter((p) => !p.scratched));
  const onSk = players.filter((p) => p.pos !== 'G' && d.onIce[team].has(p.id));
  const bench = players.filter((p) => p.pos !== 'G' && !d.onIce[team].has(p.id));
  const max = game.rules.skatersOnIce;
  const benchF = bench.filter((p) => isForward(p.pos));
  const benchD = bench.filter((p) => p.pos === 'D');
  const dN = Math.min(2, Math.max(0, max - 1));
  const fLabels: string[] = ({ 0: [], 1: ['C'], 2: ['LW', 'RW'] } as Record<number, string[]>)[max - dN] ?? ['LW', 'C', 'RW'];
  const fillSlots = (labels: string[], ps: Player[]) => {
    const out: (Player | undefined)[] = labels.map(() => undefined);
    const rest: Player[] = [];
    ps.forEach((p) => { const i = labels.indexOf(p.pos); if (i >= 0 && !out[i]) out[i] = p; else rest.push(p); });
    for (let i = 0; i < out.length && rest.length; i++) if (!out[i]) out[i] = rest.shift();
    return { out, rest };
  };
  const fs = fillSlots(fLabels, onSk.filter((p) => isForward(p.pos)));
  const ds = fillSlots(Array(dN).fill('D'), onSk.filter((p) => p.pos === 'D'));
  const slotCols = [...fLabels.map((label, i) => ({ label, p: fs.out[i] })), ...ds.out.map((p) => ({ label: 'D', p }))];
  const overflow = [...fs.rest, ...ds.rest];
  const lines = lineSetFor(game.lines, team, roster);
  const t = d.nowElapsed;
  const active = (s: Side) => d.penalties.filter((p) => p.d.team === s && p.start <= t && t < p.end).length;
  const menDown = active(team) - active(otherSide(team));
  const strength = strengthNow(d, team);
  const hint: LineKind | null = strength === 'PP' ? 'PP' : strength === 'SH' ? 'PK' : null;
  const num = (id: string) => roster.find((p) => p.id === id)?.number ?? '?';

  const applyUnit = async (kind: LineKind, i: number) => {
    const ids = lines[kind][i].filter(Boolean);
    if (!ids.length) return;
    const target = kind === 'PK' || kind === 'PP' ? ids.slice(0, unitSize(kind, max, menDown)) : ids;
    const scope = kind === 'F' ? (id: string) => isForward(posOf(id)) : kind === 'D' ? (id: string) => posOf(id) === 'D' : (id: string) => isSkater(posOf(id));
    const { off, on } = planSwap(d.onIce[team], target, scope);
    if (!off.length && !on.length) { toast('Already on the ice'); return; }
    const after = onSk.length - off.filter((id) => posOf(id) !== 'G').length + on.length;
    if (after > max + 1) { toast(`That would put ${after} skaters on the ice`); return; }
    await actions.lineChange(team, off, on, `${kind}${i + 1} on`);
  };
  const unitOn = (kind: LineKind, i: number) => { const ids = lines[kind][i].filter(Boolean); return ids.length > 0 && ids.every((id) => d.onIce[team].has(id)); };

  const tapBench = async (id: string) => {
    if (onSk.length < max) { await actions.shift(team, id, 'on'); return; }
    setIncoming(incoming === id ? null : id); // full: choose who comes off, or add an extra man
  };
  const tapOn = async (id: string) => {
    if (incoming) { await actions.lineChange(team, [id], [incoming]); setIncoming(null); return; }
    await actions.shift(team, id, 'off');
  };
  const benchChip = (p: Player) => <PlayerChip key={p.id} p={p} on={incoming === p.id} badge={p.captain} sub={fmtToi(d.players.get(p.id)?.toi ?? 0)} onTap={() => void tapBench(p.id)} />;
  const goalies = players.filter((p) => p.pos === 'G');
  const setNet = async (id: string | null) => { if (id !== d.goalie[team]) await actions.goalie(team, id); };
  const addExtra = async () => { if (incoming) { await actions.shift(team, incoming, 'on'); setIncoming(null); } };

  return (
    <div className="lf team-tint" style={vars} role="dialog" aria-modal="true" aria-label="On ice">
      <div className="lf-head">
        <button className="btn" onClick={() => void actions.allOff(team)} disabled={!onSk.length}>All off</button>
        <div className="seg lf-team" role="radiogroup" aria-label="Team">
          {(['home', 'away'] as Side[]).map((s) => <button key={s} className={`${s} ${team === s ? 'on' : ''}`} onClick={() => { setTeam(s); setIncoming(null); }}>{sideName(game, s)}</button>)}
        </div>
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
      <div className="lf-body">
        <div className="lf-who">
          <div className="muted small">On ice · {onSk.length}{onSk.length > max ? ' (extra attacker)' : ''}{strength !== 'EV' ? ` · ${strength}${menDown > 1 ? ` · ${menDown} men down` : ''}` : ''}{incoming ? ' — tap who comes off' : ' — tap to take off'}</div>
          <div className="posslots">
            {slotCols.map((c, i) => (
              <div key={i} className={`posslot ${c.label === 'D' ? 'd' : 'f'}`}>
                <span className="poslbl">{c.label}</span>
                {c.p
                  ? <PlayerChip p={c.p} ice badge={c.p.captain} sub={fmtToi(d.players.get(c.p.id)?.toi ?? 0)} onTap={() => void tapOn(c.p!.id)} />
                  : <span className="slot" aria-hidden="true">·</span>}
              </div>
            ))}
            {overflow.map((p) => (
              <div key={p.id} className="posslot extra">
                <span className="poslbl">{p.pos === 'D' ? 'D' : 'EX'}</span>
                <PlayerChip p={p} ice extra badge={p.captain} sub={fmtToi(d.players.get(p.id)?.toi ?? 0)} onTap={() => void tapOn(p.id)} />
              </div>
            ))}
            {incoming && onSk.length <= max && <div className="posslot extra"><span className="poslbl">EX</span><button className="slot extra" onClick={() => void addExtra()}>＋<small>extra</small></button></div>}
          </div>
          <div className="col" style={{ gap: 6 }}>
            {LINE_KINDS.map((k) => {
              const shown = lines[k].map((l, i) => [l, i] as const).filter(([l]) => l.some(Boolean));
              if (!shown.length) return null;
              return (
                <div className="unitrow" key={k}>
                  <span className="lbl">{k}</span>
                  {shown.map(([l, i]) => (
                    <button key={i} className={`unit ${unitOn(k, i) ? 'on' : ''} ${hint === k ? 'hint' : ''}`} onClick={() => void applyUnit(k, i)}>
                      {k}{i + 1}<small>{l.filter(Boolean).map(num).join('·')}</small>
                    </button>
                  ))}
                </div>
              );
            })}
            <button className="btn sm ghost" onClick={() => setEditLines(true)}>✎ Set lines (F · D · PP · PK)</button>
          </div>
        </div>
        <div className="lf-who">
          <div className="muted small">Bench{incoming ? ' — selected, now tap a player on the ice' : onSk.length >= max ? ' — tap one, then who comes off' : ' — tap to put on'}</div>
          <div className="benchgrp"><span className="poslbl">Forwards</span>
            <div className="chips">{benchF.map(benchChip)}{!benchF.length && <span className="muted small">None</span>}</div>
          </div>
          <div className="benchgrp"><span className="poslbl">Defense</span>
            <div className="chips">{benchD.map(benchChip)}{!benchD.length && <span className="muted small">None</span>}</div>
          </div>
        </div>
        <div className="lf-who lf-goalie">
          <div className="row">
            <div className="muted small grow">In net: <b>{goalieLabel(game, d.goalie[team])}</b>{game[team].players.find((p) => p.id === d.goalie[team])?.name ? ` · ${game[team].players.find((p) => p.id === d.goalie[team])!.name}` : ''}</div>
            <button className="btn sm ghost" onClick={() => setGoalieLog(true)}>Skater in goal · history</button>
          </div>
          <div className="chips">
            {goalies.map((p) => <PlayerChip key={p.id} p={p} on={d.goalie[team] === p.id} onTap={() => void setNet(p.id)} />)}
            {!goalies.length && <span className="muted small">No goalies on the roster.</span>}
            <button className={`btn ${d.goalie[team] === null ? 'primary' : ''}`} onClick={() => void setNet(d.goalie[team] === null ? (goalies[0]?.id ?? null) : null)}>
              🥅 {d.goalie[team] === null ? 'Put goalie back' : 'Empty net'}
            </button>
          </div>
        </div>
      </div>
      {goalieLog && <GoalieSheet side={team} onClose={() => setGoalieLog(false)} />}
      {editLines && <LinesEditor side={team} onClose={() => setEditLines(false)} />}
    </div>
  );
}
