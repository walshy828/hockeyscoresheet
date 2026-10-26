import { useRef } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { FACEOFF_DOTS } from '../../../shared/src/rink.ts';

export interface Marker { id: string; x: number; y: number; team: Side; kind: 'goal' | 'shot' | 'miss' | 'block' | 'faceoff' }

export const RINK_W = 200;
export const RINK_H = 85;

interface Props {
  markers?: Marker[];
  pending?: { x: number; y: number; team?: Side } | null;
  onTap?: (x: number, y: number) => void;
  vertical: boolean;
  heat?: boolean;
  maxVh?: number;
  /** labels for left/right ends (team names or arrows) */
  leftLabel?: string;
  rightLabel?: string;
  leftTeam?: Side;
  /** highlight one marker (e.g. the selected table row) */
  selectedId?: string;
  /** large tap areas over each faceoff dot */
  dots?: { selected?: string; onPick: (id: string) => void };
  /** centre (rink coords) of the area to magnify; null/undefined shows the whole rink */
  zoom?: { x: number; y: number } | null;
}

export const ZOOM = 4;

function MarkerShape({ m, k = 1 }: { m: Marker; k?: number }) {
  if (k !== 1) return <g transform={`translate(${m.x} ${m.y}) scale(${k}) translate(${-m.x} ${-m.y})`}><MarkerShape m={m} /></g>;
  const c = m.team === 'home' ? 'mk-home' : 'mk-away';
  switch (m.kind) {
    case 'goal':
      return <polygon className={c} strokeWidth=".6" points="0,-3.4 1,-1.1 3.4,-1 1.5,0.6 2.1,3.2 0,1.8 -2.1,3.2 -1.5,0.6 -3.4,-1 -1,-1.1" transform={`translate(${m.x} ${m.y})`} />;
    case 'miss':
      return <path className={c} fill="none" strokeWidth="1" d={`M${m.x - 1.8} ${m.y - 1.8}l3.6 3.6m0 -3.6l-3.6 3.6`} />;
    case 'block':
      return <rect className={c} fillOpacity=".35" strokeWidth=".8" x={m.x - 1.7} y={m.y - 1.7} width="3.4" height="3.4" />;
    case 'faceoff':
      return <circle className={c} fill="none" strokeWidth=".9" cx={m.x} cy={m.y} r="2.2" strokeDasharray="1.2 .8" />;
    default:
      return <circle className={c} fillOpacity=".8" strokeWidth=".4" cx={m.x} cy={m.y} r="1.8" />;
  }
}

export function Rink({ markers = [], pending, onTap, vertical, heat, maxVh = 48, leftLabel, rightLabel, leftTeam, selectedId, dots, zoom }: Props) {
  const g = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  const tap = (e: React.PointerEvent | React.MouseEvent) => {
    if (!onTap || !g.current || !svg.current) return;
    const pt = svg.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(g.current.getScreenCTM()!.inverse());
    onTap(Math.min(RINK_W, Math.max(0, Math.round(p.x * 10) / 10)), Math.min(RINK_H, Math.max(0, Math.round(p.y * 10) / 10)));
  };

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

  const s = zoom ? ZOOM : 1;
  const zx = zoom ? Math.min(RINK_W - RINK_W / s, Math.max(0, zoom.x - RINK_W / s / 2)) : 0;
  const zy = zoom ? Math.min(RINK_H - RINK_H / s, Math.max(0, zoom.y - RINK_H / s / 2)) : 0;
  const zt = zoom ? ` scale(${s}) translate(${-zx} ${-zy})` : '';
  const vb = vertical ? `0 0 ${RINK_H} ${RINK_W}` : `0 0 ${RINK_W} ${RINK_H}`;
  const style = vertical ? { height: `min(${maxVh}vh, 150vw)`, width: 'auto' } : { width: '100%', maxHeight: `${maxVh}vh` };
  const lc = leftTeam === 'away' ? 'mk-away' : 'mk-home';
  const rc = leftTeam === 'away' ? 'mk-home' : 'mk-away';

  return (
    <div className="rinkwrap">
      <svg ref={svg} viewBox={vb} style={style} onClick={tap} role="img" aria-label="Hockey rink. Tap to mark a location." preserveAspectRatio="xMidYMid meet">
        <g ref={g} transform={(vertical ? `translate(${RINK_H} 0) rotate(90)` : '') + zt || undefined}>
          <rect className="rink-board" x=".6" y=".6" width={RINK_W - 1.2} height={RINK_H - 1.2} rx="28" />
          {heat && cells.map((col, i) => col.map((n, j) => n > 0 && (
            <rect key={`${i}-${j}`} x={i * 10} y={j * 10} width="10" height="10" fill="var(--accent)" opacity={0.15 + 0.7 * (n / max)} />
          )))}
          <line className="rink-blueline" x1="75" y1="1" x2="75" y2="84" />
          <line className="rink-blueline" x1="125" y1="1" x2="125" y2="84" />
          <line className="rink-redline" x1="100" y1="1" x2="100" y2="84" strokeDasharray="3 1.5" strokeWidth="1.6" />
          <line className="rink-goalline" x1="11" y1="7.2" x2="11" y2="77.8" />
          <line className="rink-goalline" x1="189" y1="7.2" x2="189" y2="77.8" />
          <path className="rink-crease" d="M11 36.5 A6 6 0 0 1 11 48.5 Z" />
          <path className="rink-crease" d="M189 36.5 A6 6 0 0 0 189 48.5 Z" />
          <rect className="rink-net" x="8" y="39.5" width="3" height="6" />
          <rect className="rink-net" x="189" y="39.5" width="3" height="6" />
          <circle className="rink-circle" cx="100" cy="42.5" r="15" />
          <circle className="rink-blue-dot" cx="100" cy="42.5" r="1.2" />
          {[31, 169].flatMap((x) => [20.5, 64.5].map((y) => (
            <g key={`${x}${y}`}>
              <circle className="rink-circle" cx={x} cy={y} r="15" />
              <circle className="rink-dot" cx={x} cy={y} r="1.2" />
            </g>
          )))}
          {[80, 120].flatMap((x) => [20.5, 64.5].map((y) => <circle key={`n${x}${y}`} className="rink-dot" cx={x} cy={y} r="1" />))}
          {leftLabel && <text x="50" y="43" className={lc} fill="currentColor" stroke="none" opacity=".18" fontSize="9" fontWeight="800" textAnchor="middle">{leftLabel}</text>}
          {rightLabel && <text x="150" y="43" className={rc} fill="currentColor" stroke="none" opacity=".18" fontSize="9" fontWeight="800" textAnchor="middle">{rightLabel}</text>}
          {markers.map((m) => <MarkerShape key={m.id} m={m} k={1 / s} />)}
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
                <circle cx={dt.x} cy={dt.y} r="10" fill={on ? 'var(--accent)' : 'transparent'} fillOpacity={on ? 0.35 : 1} stroke={on ? 'var(--accent)' : 'var(--ice-line)'} strokeWidth={on ? 1 : 0.6} strokeDasharray={on ? undefined : '1.5 1'} />
              </g>
            );
          })}
          {pending && (
            <g className="pulse" transform={`translate(${pending.x} ${pending.y}) scale(${1 / s}) translate(${-pending.x} ${-pending.y})`}>
              <circle cx={pending.x} cy={pending.y} r="4" fill="none" stroke="var(--text)" strokeWidth=".8" />
              <circle cx={pending.x} cy={pending.y} r="1.2" fill="var(--text)" />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
