import { useState } from 'react';
import { fmtClock } from '../../../shared/src/derive.ts';
import { periodLength, periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import type { ClockTime } from '../actions.ts';
import { useClock } from './Clock.tsx';

/**
 * Game-clock time for an event. `value: null` follows the live clock (stamped when saved);
 * "Edit" lets the scorer type a different period / time.
 */
export function WhenField({ value, onChange }: { value: ClockTime | null; onChange: (v: ClockTime | null) => void }) {
  const { game } = useGame();
  const c = useClock();
  const [editing, setEditing] = useState(false);
  const live: ClockTime = { period: c.period, clock: Math.ceil(c.remaining) };
  const shown = value ?? live;
  const maxP = game.rules.periods + 3;

  const set = (patch: Partial<ClockTime>) => {
    const period = patch.period ?? shown.period;
    onChange({ period, clock: Math.max(0, Math.min(periodLength(period, game.rules), patch.clock ?? shown.clock)) });
  };
  const num = (v: string) => Number(v.replace(/\D/g, '').slice(0, 2) || 0);

  if (!editing) {
    return (
      <div className="when-f">
        <span className="when-t" aria-label="Event time">🕐 {periodName(shown.period, game.rules)} {fmtClock(shown.clock)}{value ? '' : ' · now'}</span>
        <button className="btn sm ghost" onClick={() => { if (!value) onChange(live); setEditing(true); }}>Edit time</button>
        {value && <button className="btn sm ghost" onClick={() => onChange(null)}>Use clock</button>}
      </div>
    );
  }
  return (
    <div className="when-f">
      <select aria-label="Period" value={shown.period} onChange={(e) => set({ period: Number(e.target.value) })}>
        {Array.from({ length: maxP }, (_, i) => <option key={i} value={i + 1}>{periodName(i + 1, game.rules)}</option>)}
      </select>
      <input aria-label="Minutes" inputMode="numeric" value={Math.floor(shown.clock / 60)} onFocus={(e) => e.target.select()} onChange={(e) => set({ clock: num(e.target.value) * 60 + (shown.clock % 60) })} />
      <b>:</b>
      <input aria-label="Seconds" inputMode="numeric" value={String(shown.clock % 60).padStart(2, '0')} onFocus={(e) => e.target.select()} onChange={(e) => set({ clock: Math.floor(shown.clock / 60) * 60 + Math.min(59, num(e.target.value)) })} />
      <button className="btn sm primary" onClick={() => setEditing(false)}>OK</button>
      <button className="btn sm ghost" onClick={() => { onChange(null); setEditing(false); }}>Use clock</button>
    </div>
  );
}
