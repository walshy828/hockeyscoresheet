import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { FACEOFF_DOTS } from '../../../shared/src/rink.ts';

export interface Marker { id: string; x: number; y: number; team: Side; kind: 'goal' | 'shot' | 'miss' | 'block' | 'faceoff' }

export const RINK_W = 200;
export const RINK_H = 85;
/** margin around the ice (in feet) that holds the boards */
const PAD = 3;

interface Props {
  markers?: Marker[];
  pending?: { x: number; y: number; team?: Side } | null;
  onTap?: (x: number, y: number) => void;
  /** makes each marker tappable (e.g. to show its details) */
  onMarker?: (id: string) => void;
  /** tooltip bubble for a marker: shown on hover (mouse) and pinned on tap */
  tipFor?: (id: string) => ReactNode;
  /** the bubble's "Details" link */
  onTipDetails?: (id: string) => void;
  vertical: boolean;
  heat?: boolean;
  maxVh?: number;
  /** labels for left/right ends (team names or arrows) */
  leftLabel?: string;
  rightLabel?: string;
  leftTeam?: Side;
  /** When set, ends are labelled Offense/Defense from this team's point of view instead of by team name. */
  perspective?: Side;
  /** highlight one marker (e.g. the selected table row) */
  selectedId?: string;
  /** large tap areas over each faceoff dot */
  dots?: { selected?: string; onPick: (id: string) => void };
  /** centre (rink coords) of the area to magnify; null/undefined shows the whole rink */
  zoom?: { x: number; y: number; level?: number } | null;
  /** press and hold on the ice (rink coords); suppresses the tap that would follow */
  onLongPress?: (x: number, y: number) => void;
  /** legend entries act as toggles: highlighted kinds stay bold, the rest fade */
  highlight?: ReadonlySet<Marker['kind']>;
  onHighlight?: (kinds: Set<Marker['kind']>) => void;
  /** show a key of marker shapes (with counts) under the ice */
  legend?: boolean;
  /** win/loss record per faceoff dot id: paints each dot green-to-red by win rate (use with the horizontal rink) */
  dotStats?: Record<string, { w: number; l: number }>;
}

export const ZOOM = 4;

const GOAL_STAR = '0,-3.6 1.05,-1.2 3.6,-1.05 1.6,0.65 2.2,3.4 0,1.9 -2.2,3.4 -1.6,0.65 -3.6,-1.05 -1.05,-1.2';

/** each shape sits on a contrasting halo so it reads on light ice, dark ice and the heat map alike */
function MarkerShape({ m, k = 1 }: { m: Marker; k?: number }) {
  if (k !== 1) return <g transform={`translate(${m.x} ${m.y}) scale(${k}) translate(${-m.x} ${-m.y})`}><MarkerShape m={m} /></g>;
  const c = m.team === 'home' ? 'mk-home' : 'mk-away';
  const { x, y } = m;
  switch (m.kind) {
    case 'goal':
      return (
        <g className="mk-goal" transform={`translate(${x} ${y})`}>
          <polygon className="mk-halo" points={GOAL_STAR} strokeWidth="2.2" />
          <polygon className={c} points={GOAL_STAR} strokeWidth=".5" />
          <circle r=".7" fill="#fff" />
        </g>
      );
    case 'miss': {
      const d = `M${x - 1.8} ${y - 1.8}l3.6 3.6m0 -3.6l-3.6 3.6`;
      return <g><path className="mk-halo" d={d} fill="none" strokeWidth="2.6" strokeLinecap="round" /><path className={c} d={d} fill="none" strokeWidth="1.2" strokeLinecap="round" /></g>;
    }
    case 'block':
      return <g><rect className="mk-halo" x={x - 1.8} y={y - 1.8} width="3.6" height="3.6" rx=".5" strokeWidth="1.8" /><rect className={c} fillOpacity=".4" strokeWidth=".9" x={x - 1.8} y={y - 1.8} width="3.6" height="3.6" rx=".5" /></g>;
    case 'faceoff':
      return <g><circle className="mk-halo" fill="none" cx={x} cy={y} r="2.3" strokeWidth="2" /><circle className={c} fill="none" strokeWidth="1" cx={x} cy={y} r="2.3" strokeDasharray="1.3 .8" /></g>;
    default:
      return <g><circle className="mk-halo" cx={x} cy={y} r="1.9" strokeWidth="1.6" /><circle className={c} fillOpacity=".9" strokeWidth=".4" cx={x} cy={y} r="1.9" /></g>;
  }
}

/** legend rows: `shot` markers are shots on net */
const KEY: { shape: Marker['kind']; label: string }[] = [
  { shape: 'goal', label: 'Goal' }, { shape: 'shot', label: 'On net' }, { shape: 'miss', label: 'Missed' },
  { shape: 'block', label: 'Blocked' }, { shape: 'faceoff', label: 'Faceoff' },
];

function Legend({ markers, leftTeam, highlight, onHighlight }: { markers: Marker[]; leftTeam?: Side; highlight?: ReadonlySet<Marker['kind']>; onHighlight?: (kinds: Set<Marker['kind']>) => void }) {
  const toggle = (k: Marker['kind']) => {
    const next = new Set(highlight);
    if (!next.delete(k)) next.add(k);
    onHighlight!(next);
  };
  return (
    <div className="rink-legend" aria-label="Marker key">
      {KEY.map(({ shape, label }) => {
        const count = markers.filter((m) => m.kind === shape).length;
        return (
          <span key={shape} className={`rl ${count ? '' : 'zero'} ${onHighlight ? 'tog' : ''} ${highlight?.has(shape) ? 'on' : ''}`}
            {...(onHighlight ? { role: 'button', tabIndex: 0, 'aria-pressed': !!highlight?.has(shape), onClick: () => toggle(shape), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(shape); } } } : {})}>
            <svg viewBox="-5 -5 10 10" width="16" height="16" aria-hidden="true"><MarkerShape m={{ id: 'k', x: 0, y: 0, team: 'home', kind: shape }} /></svg>
            {label}<b>{count}</b>
          </span>
        );
      })}
      <span className="rl"><i className="dot home" />Home<i className="dot away" />Away</span>
      {highlight?.size ? <button type="button" className="rl clear" onClick={() => onHighlight!(new Set())}>✕ Clear</button> : null}
      {leftTeam && <span className="rl dim">{leftTeam === 'home' ? 'Home' : 'Away'} on left</span>}
    </div>
  );
}

/** shrink long team names to fit within an end zone */
const nameSize = (n: string) => Math.max(4, Math.min(9, 80 / (n.length * 0.9)));

export function Rink({ markers = [], pending, onTap, onMarker, vertical, heat, maxVh = 48, leftLabel, rightLabel, leftTeam, perspective, selectedId, dots, zoom, legend, onLongPress, highlight, onHighlight, tipFor, onTipDetails, dotStats }: Props) {
  const g = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ id: string; pinned: boolean } | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number; below: boolean; dx: number } | null>(null);

  const toRink = (e: { clientX: number; clientY: number }) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(g.current!.getScreenCTM()!.inverse());
    return { x: Math.min(RINK_W, Math.max(0, Math.round(p.x * 10) / 10)), y: Math.min(RINK_H, Math.max(0, Math.round(p.y * 10) / 10)) };
  };
  const tap = (e: React.MouseEvent) => {
    if (held.current) { held.current = false; return; }
    setTip(null);
    if (!onTap || !g.current || !svg.current) return;
    const { x, y } = toRink(e);
    onTap(x, y);
  };

  // press-and-hold: fires after a beat if the finger/cursor stays put
  const held = useRef(false);
  const press = useRef<{ t: number; x: number; y: number } | null>(null);
  const cancelPress = () => { if (press.current) { clearTimeout(press.current.t); press.current = null; } };
  useEffect(() => cancelPress, []);
  const down = (e: React.PointerEvent) => {
    if (!onLongPress || !g.current || !svg.current) return;
    cancelPress();
    held.current = false;
    const { clientX, clientY } = e;
    press.current = {
      x: clientX, y: clientY,
      t: window.setTimeout(() => {
        press.current = null; held.current = true;
        if (navigator.vibrate) navigator.vibrate(15);
        const { x, y } = toRink({ clientX, clientY });
        onLongPress(x, y);
      }, 450),
    };
  };
  const move = (e: React.PointerEvent) => { if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) cancelPress(); };

  // anchor the bubble to its marker, whatever the zoom or orientation
  useLayoutEffect(() => {
    const m = tip && markers.find((k) => k.id === tip.id);
    if (!m || !g.current || !svg.current || !wrap.current) { setTipPos(null); return; }
    const pt = svg.current.createSVGPoint();
    pt.x = m.x; pt.y = m.y;
    const c = pt.matrixTransform(g.current.getScreenCTM()!);
    const r = wrap.current.getBoundingClientRect();
    const px = c.x - r.left, py = c.y - r.top;
    const x = Math.min(r.width - 100, Math.max(100, px));
    setTipPos({ x, y: py, below: py < 90, dx: px - x });
  }, [tip, markers, zoom, vertical]);

  const cells: number[][] = [];
  let max = 0;
  if (heat) {
    for (let i = 0; i < 20; i++) cells.push(new Array(9).fill(0));
    for (const m of markers) {
      if (m.kind === 'faceoff') continue;
      const c = cells[Math.min(19, Math.floor(m.x / 10))];
      const r = Math.min(8, Math.floor(m.y / 10));
      max = Math.max(max, ++c[r]);
    }
  }

  const s = zoom ? zoom.level ?? ZOOM : 1;
  const zx = zoom ? Math.min(RINK_W - RINK_W / s, Math.max(0, zoom.x - RINK_W / s / 2)) : 0;
  const zy = zoom ? Math.min(RINK_H - RINK_H / s, Math.max(0, zoom.y - RINK_H / s / 2)) : 0;
  const zt = zoom ? ` scale(${s}) translate(${-zx} ${-zy})` : '';
  // the viewBox leaves a margin around the ice for the boards
  const vb = vertical ? `${-PAD} ${-PAD} ${RINK_H + 2 * PAD} ${RINK_W + 2 * PAD}` : `${-PAD} ${-PAD} ${RINK_W + 2 * PAD} ${RINK_H + 2 * PAD}`;
  const style = vertical ? { height: `min(${maxVh}vh, 150vw)`, width: 'auto' } : { width: '100%', maxHeight: `${maxVh}vh` };
  const lc = leftTeam === 'away' ? 'mk-away' : 'mk-home';
  const rc = leftTeam === 'away' ? 'mk-home' : 'mk-away';
  const cy = RINK_H / 2;

  return (
    <div ref={wrap} className={`rinkwrap ${legend ? 'withkey' : ''}`} style={{ position: 'relative' }}>
      <svg ref={svg} viewBox={vb} style={onLongPress ? { ...style, WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation' } : style} onClick={tap} onPointerDown={down} onPointerMove={move} onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress} onContextMenu={(e) => { if (onLongPress) e.preventDefault(); }} role="img" aria-label="Hockey rink. Tap to mark a location." preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id={`${uid}c`}><rect x="0" y="0" width={RINK_W} height={RINK_H} rx="28" /></clipPath>
          <linearGradient id={`${uid}i`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--ice-a)" /><stop offset="1" stopColor="var(--ice-b)" /></linearGradient>
          <radialGradient id={`${uid}s`} cx=".5" cy=".42" r=".6"><stop offset="0" stopColor="var(--ice-sheen)" stopOpacity="var(--ice-sheen-o)" /><stop offset="1" stopColor="var(--ice-sheen)" stopOpacity="0" /></radialGradient>
          <filter id={`${uid}h`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4.5" /></filter>
        </defs>
        <g ref={g} transform={(vertical ? `translate(${RINK_H} 0) rotate(90)` : '') + zt || undefined}>
          {/* dasher boards, kick plate and the glass line above them */}
          <rect className="rink-boards" x={-PAD + 1} y={-PAD + 1} width={RINK_W + 2 * PAD - 2} height={RINK_H + 2 * PAD - 2} rx={28 + PAD - 1} />
          <rect className="rink-kick" x="-.5" y="-.5" width={RINK_W + 1} height={RINK_H + 1} rx="28.5" />
          <rect className="rink-ice" x="0" y="0" width={RINK_W} height={RINK_H} rx="28" fill={`url(#${uid}i)`} />
          <g clipPath={`url(#${uid}c)`}>
            <rect x="0" y="0" width={RINK_W} height={RINK_H} fill={`url(#${uid}s)`} />
            {/* skate scuffs */}
            <g className="rink-scuff">
              <path d="M18 60 C 50 30, 90 70, 128 40 S 170 20, 188 30" /><path d="M12 30 C 44 52, 70 20, 112 48 S 160 66, 190 54" />
              <path d="M30 76 C 62 62, 100 80, 140 66" /><path d="M60 10 C 90 24, 120 8, 150 20" /><path d="M96 28 C 108 44, 98 60, 112 74" />
            </g>
            {heat && (
              <g filter={`url(#${uid}h)`}>
                {cells.map((col, i) => col.map((n, j) => n > 0 && (
                  <rect key={`${i}-${j}`} x={i * 10} y={j * 10} width="10" height="10" className="rink-heat" opacity={0.25 + 0.7 * (n / max)} />
                )))}
              </g>
            )}
            {/* centre red line (with the white dashes) and the two blue lines */}
            <rect className="rink-red" x="99.5" y="0" width="1" height={RINK_H} />
            <line className="rink-redline-dash" x1="100" y1="0" x2="100" y2={RINK_H} />
            <rect className="rink-blue" x="74.5" y="0" width="1" height={RINK_H} />
            <rect className="rink-blue" x="124.5" y="0" width="1" height={RINK_H} />
            {/* goal lines, goalie trapezoids and end-zone circles, mirrored */}
            {[0, 1].map((side) => {
              const f = side ? 1 : -1; // direction towards the end boards
              const gx = side ? 189 : 11; // goal line
              const ex = side ? 200 : 0;  // end boards
              const cx = side ? 169 : 31; // end-zone dots
              return (
                <g key={side}>
                  <rect className="rink-red" x={gx - 0.25} y="0" width=".5" height={RINK_H} />
                  <path className="rink-trap" d={`M${gx} ${cy - 11} L${ex} ${cy - 14} M${gx} ${cy + 11} L${ex} ${cy + 14}`} />
                  <path className="rink-crease" d={`M${gx} ${cy - 6} A6 6 0 0 ${side ? 0 : 1} ${gx} ${cy + 6} Z`} />
                  <g className="rink-net">
                    <path d={`M${gx} ${cy - 3} h${f * 3.3} v6 h${-f * 3.3}`} />
                    <path className="rink-mesh" d={`M${gx + f * 1.1} ${cy - 3} v6 M${gx + f * 2.2} ${cy - 3} v6 M${gx} ${cy} h${f * 3.3}`} />
                  </g>
                  {[20.5, 64.5].map((y) => {
                    const up = y < cy ? -1 : 1;
                    return (
                      <g key={y}>
                        <circle className="rink-circle" cx={cx} cy={y} r="15" />
                        {/* hash marks outside the circle and L stance marks beside the dot */}
                        {[-1, 1].map((hx) => <line key={hx} className="rink-circle" x1={cx + hx} y1={y + up * 15} x2={cx + hx} y2={y + up * 17} />)}
                        {[-1, 1].map((hx) => <line key={`b${hx}`} className="rink-circle" x1={cx + hx} y1={y - up * 15} x2={cx + hx} y2={y - up * 17} />)}
                        {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => (
                          <path key={`${sx}${sy}`} className="rink-circle" d={`M${cx + sx * 2} ${y + sy * 4.2} v${-sy * 1.6} M${cx + sx * 2} ${y + sy * 4.2} h${sx * 2}`} />
                        )))}
                        <circle className="rink-dot" cx={cx} cy={y} r="1" />
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {/* neutral-zone dots */}
            {[80, 120].flatMap((x) => [20.5, 64.5].map((y) => <circle key={`n${x}${y}`} className="rink-dot" cx={x} cy={y} r="1" />))}
            {/* centre circle + dot are blue */}
            <circle className="rink-circle blue" cx="100" cy={cy} r="15" />
            <circle className="rink-blue-dot" cx="100" cy={cy} r=".9" />
            {/* referee crease at the scorer's table */}
            <path className="rink-circle" d={`M90 ${RINK_H} A10 10 0 0 1 110 ${RINK_H}`} />
            {([['50', leftLabel, lc, 'away'], ['150', rightLabel, rc, 'home']] as const).map(([x, name, cls], i) => {
              if (!name) return null;
              if (!perspective) return <text key={x} x={x} y="44" className={`rink-name ${cls}`} fontSize={nameSize(name)}>{name}</text>;
              const leftSide: Side = leftTeam ?? 'home';
              const endTeam: Side = i === 0 ? leftSide : leftSide === 'home' ? 'away' : 'home';
              const zone = endTeam === perspective ? 'Defense' : 'Offense';
              return (
                <g key={x} className={`rink-name ${cls}`}>
                  <text x={x} y="40" fontSize="9">{zone}</text>
                  <text x={x} y="50" fontSize="5">{name}</text>
                </g>
              );
            })}
          </g>
          {dotStats && FACEOFF_DOTS.map((dt) => {
            const st = dotStats[dt.id];
            const n = st ? st.w + st.l : 0;
            const rate = n ? Math.round((st!.w / n) * 100) : 0;
            return (
              <g key={`fs${dt.id}`} className="fo-dot">
                <title>{dt.label}{n ? `: ${st!.w}-${st!.l} (${rate}%)` : ': no draws'}</title>
                {n ? (
                  <>
                    <circle cx={dt.x} cy={dt.y} r="10.5" className="fo-dot-bg" style={{ fill: `color-mix(in srgb, var(--ok-fill) ${rate}%, var(--bad-fill))`, opacity: 0.5 + 0.4 * Math.min(1, n / 6) }} />
                    <text x={dt.x} y={dt.y - 0.6} className="fo-dot-pct" textAnchor="middle" fontSize="5.2">{rate}%</text>
                    <text x={dt.x} y={dt.y + 5} className="fo-dot-rec" textAnchor="middle" fontSize="3.8">{st!.w}-{st!.l}</text>
                  </>
                ) : <circle cx={dt.x} cy={dt.y} r="4" className="fo-dot-empty" />}
              </g>
            );
          })}
          {markers.map((m) => <g key={m.id} opacity={highlight?.size && !highlight.has(m.kind) ? 0.14 : 1}><MarkerShape m={m} k={1 / s} /></g>)}
          {onMarker && markers.map((m) => (
            <circle key={`hit${m.id}`} cx={m.x} cy={m.y} r={4.5 / s} fill="transparent" style={{ cursor: 'pointer' }} role="button" aria-label={`${m.kind} marker`} onClick={(e) => { e.stopPropagation(); onMarker(m.id); }} />
          ))}
          {tipFor && markers.map((m) => (
            <circle key={`tip${m.id}`} cx={m.x} cy={m.y} r={4.5 / s} fill="transparent" style={{ cursor: 'pointer' }} role="button" aria-label={`${m.kind} marker`}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setTip((t) => (t?.pinned ? t : { id: m.id, pinned: false })); }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') setTip((t) => (t?.pinned ? t : null)); }}
              onClick={(e) => { e.stopPropagation(); setTip((t) => (t?.pinned && t.id === m.id ? null : { id: m.id, pinned: true })); }} />
          ))}
          {markers.filter((m) => m.id === selectedId).map((m) => (
            <g key={`sel${m.id}`} className="pulse">
              <circle cx={m.x} cy={m.y} r="6" fill="none" stroke="var(--text)" strokeWidth="1" />
              <circle cx={m.x} cy={m.y} r="8" fill="none" stroke="var(--accent)" strokeWidth=".8" strokeDasharray="2 1.4" />
            </g>
          ))}
          {dots && FACEOFF_DOTS.map((dt) => {
            const on = dots.selected === dt.id;
            return (
              <g key={dt.id} role="button" aria-label={dt.label} aria-pressed={on} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); dots.onPick(dt.id); }}>
                <title>{dt.label}</title>
                <circle className={`rink-pick ${on ? 'on' : ''}`} cx={dt.x} cy={dt.y} r="10" />
                {on && <circle cx={dt.x} cy={dt.y} r="2.4" fill="var(--accent)" stroke="#fff" strokeWidth=".6" />}
              </g>
            );
          })}
          {pending && (
            <g className="pulse" transform={`translate(${pending.x} ${pending.y}) scale(${1 / s}) translate(${-pending.x} ${-pending.y})`}>
              <circle cx={pending.x} cy={pending.y} r="4.4" fill="var(--accent)" fillOpacity=".18" stroke="var(--accent)" strokeWidth=".9" />
              <circle cx={pending.x} cy={pending.y} r="1.3" fill="var(--accent)" stroke="#fff" strokeWidth=".5" />
            </g>
          )}
        </g>
      </svg>
      {tip && tipPos && tipFor && (
        <div className={`rink-tip ${tipPos.below ? 'below' : ''} ${tip.pinned ? 'pinned' : ''}`} style={{ left: tipPos.x, top: tipPos.y, ['--dx' as string]: `${tipPos.dx}px` }} role="tooltip">
          {tipFor(tip.id)}
          {tip.pinned && onTipDetails && <button className="btn sm" onClick={(e) => { e.stopPropagation(); onTipDetails(tip.id); }}>Details ›</button>}
        </div>
      )}
      {legend && <Legend markers={markers} leftTeam={leftTeam} highlight={highlight} onHighlight={onHighlight} />}
    </div>
  );
}
