import { createContext, useContext, type ReactNode } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { useGame } from '../ctx.ts';
import { sideName } from '../describe.ts';

/** the team the coach is looking at ("our team"); shared by every section so the toggles stay in step */
export const FocusCtx = createContext<{ focus: Side; setFocus: (s: Side) => void }>({ focus: 'home', setFocus: () => {} });
export const useFocus = () => useContext(FocusCtx);

const SIDES: Side[] = ['home', 'away'];

export function TeamToggle() {
  const { game } = useGame();
  const { focus, setFocus } = useFocus();
  return (
    <div className="seg vw-team" role="radiogroup" aria-label="Team">
      {SIDES.map((s) => <button key={s} role="radio" aria-checked={focus === s} className={`${s} ${focus === s ? 'on' : ''}`} onClick={() => setFocus(s)}>{sideName(game, s)}</button>)}
    </div>
  );
}

export function Seg<T extends string | number>({ items, value, onChange, label }: { items: [T, string][]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {items.map(([k, l]) => <button key={String(k)} role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export function Card({ title, sub, right, children, wide, className = '' }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <section className={`card vw-card ${wide ? 'span' : ''} ${className}`}>
      {(title || right) && (
        <div className="vw-card-h">
          <div className="grow"><h3>{title}</h3>{sub && <div className="muted small">{sub}</div>}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** green (winning) to red (losing) background for a win rate; the more draws behind it, the stronger the colour */
export const rateBg = (rate: number, n: number, full = 6) =>
  n ? `color-mix(in srgb, color-mix(in srgb, var(--ok-fill) ${rate}%, var(--bad-fill)) ${Math.round(30 + 55 * Math.min(1, n / full))}%, transparent)` : undefined;

/** accent-coloured background that deepens with `n / max` */
export const volumeBg = (n: number, max: number) => (n && max ? `color-mix(in srgb, var(--accent) ${Math.round(14 + 66 * (n / max))}%, transparent)` : undefined);

export const svPct = (sv: number, sa: number) => (sa ? (sv / sa).toFixed(3).replace(/^0/, '') : '–');
