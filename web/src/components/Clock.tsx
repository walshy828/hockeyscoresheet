import { useMemo, useState } from 'react';
import { clockAt, fmtClock } from '../../../shared/src/derive.ts';
import { periodLength, periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { Sheet, useNow } from './ui.tsx';

export function useClock() {
  const { events, game, anchor } = useGame();
  const clockEvts = useMemo(() => events.filter((e) => e.type === 'clock'), [events]);
  const t = useNow(200);
  const c = clockAt(clockEvts, anchor === 'recv' ? t + serverOffset : t, anchor);
  const len = periodLength(c.period, game.rules);
  return { ...c, remaining: Number.isFinite(c.remaining) ? c.remaining : len, len };
}

// viewer clock is anchored on server receive time; offset corrects local clock skew
let serverOffset = 0;
export const setServerOffset = (o: number) => { serverOffset = o; };

export function ClockDisplay({ compact }: { compact?: boolean }) {
  const { canEdit, actions, game } = useGame();
  const c = useClock();
  const [open, setOpen] = useState(false);
  const cls = c.remaining <= 0 ? 'zero' : c.running ? 'run' : 'stop';
  return (
    <div className="clockbox">
      <div className="small muted" style={{ fontWeight: 700 }}>{periodName(c.period, game.rules)}{c.running ? '' : c.remaining >= c.len ? ' · ready' : ' · stopped'}</div>
      {canEdit ? (
        <button className={`clock ${cls}`} onClick={() => setOpen(true)} aria-label="Adjust clock">{fmtClock(c.remaining)}</button>
      ) : (
        <div className={`clock ${cls}`}>{fmtClock(c.remaining)}</div>
      )}
      {canEdit && !compact && (
        <div className="clockbtns">
          <button className={`btn sm ${c.running ? '' : 'primary'}`} style={{ minWidth: 92 }} onClick={() => void actions.toggleClock()}>{c.running ? '⏸ Stop' : '▶ Start'}</button>
        </div>
      )}
      {open && <ClockSheet onClose={() => setOpen(false)} />}
    </div>
  );
}

function ClockSheet({ onClose }: { onClose: () => void }) {
  const { actions, game } = useGame();
  const c = useClock();
  const [m, setM] = useState('');
  const [s, setS] = useState('');
  const nudge = (d: number) => void actions.adjustClock(d);
  const apply = () => {
    const secs = Math.min(Number(m || 0), 99) * 60 + Math.min(Number(s || 0), 59);
    void actions.setClock(secs, undefined, c.running);
    onClose();
  };
  const maxP = game.rules.periods + (game.rules.otEnabled ? 1 : 0);
  return (
    <Sheet title="Adjust clock" onClose={onClose}>
      <div className="col">
        <div style={{ textAlign: 'center', fontSize: 52, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtClock(c.remaining)}</div>
        <div className="muted small" style={{ textAlign: 'center' }}>Out of sync with the horn? Nudge it, or type the exact time shown on the scoreboard.</div>
        <div className="row">
          {[-60, -10, -1].map((d) => <button key={d} className="btn grow" onClick={() => nudge(d)}>−{Math.abs(d) >= 60 ? '1m' : Math.abs(d) + 's'}</button>)}
          {[1, 10, 60].map((d) => <button key={d} className="btn grow" onClick={() => nudge(d)}>+{d >= 60 ? '1m' : d + 's'}</button>)}
        </div>
        <div className="row">
          <input aria-label="Minutes" inputMode="numeric" placeholder="MM" value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, '').slice(0, 2))} style={{ textAlign: 'center', fontSize: 24 }} />
          <b>:</b>
          <input aria-label="Seconds" inputMode="numeric" placeholder="SS" value={s} onChange={(e) => setS(e.target.value.replace(/\D/g, '').slice(0, 2))} style={{ textAlign: 'center', fontSize: 24 }} />
          <button className="btn primary" disabled={!m && !s} onClick={apply}>Set</button>
        </div>
        <div className="row">
          <button className="btn grow" onClick={() => { void actions.setClock(c.len, undefined, false); onClose(); }}>Reset period</button>
          <button className="btn grow" onClick={() => { void actions.setClock(0, undefined, false); onClose(); }}>End period (0:00)</button>
        </div>
        <div className="row">
          <button className="btn grow" disabled={c.period <= 1} onClick={() => { void actions.setClock(0, c.period - 1, false); onClose(); }}>‹ Previous period</button>
          <button className="btn grow" disabled={c.period >= maxP + 3} onClick={() => { void actions.nextPeriod(); onClose(); }}>Next period ›</button>
        </div>
      </div>
    </Sheet>
  );
}
