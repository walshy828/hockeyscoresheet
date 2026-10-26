import { useRef, useState, type ReactNode } from 'react';
import type { GameEvent, Side } from '../../../shared/src/types.ts';
import { fmtClock } from '../../../shared/src/derive.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { STRENGTH_INFO, dotById } from '../../../shared/src/rink.ts';
import { useGame } from '../ctx.ts';
import { faceoffSides, pLabel, sideName } from '../describe.ts';
import { Abbr, buzz, toast } from './ui.tsx';

const KINDS = new Set(['goal', 'shot', 'faceoff', 'penalty']);
const NAME: Record<string, string> = { goal: '🚨 Goal', shot: '🏒 Shot', faceoff: '⚪ Face-off', penalty: '🟨 Penalty' };
const REVEAL = 88;

/** Row that reveals a Delete button when swiped left. */
function SwipeRow({ open, onOpen, onClose, onDelete, onTap, selected, children }: {
  open: boolean; onOpen: () => void; onClose: () => void; onDelete: () => void; onTap: () => void; selected: boolean; children: ReactNode;
}) {
  const [dx, setDx] = useState<number | null>(null);
  const st = useRef<{ x: number; y: number; moved: boolean; swiping: boolean } | null>(null);
  const swiped = useRef(false);
  const base = open ? -REVEAL : 0;
  const x = dx === null ? base : Math.max(-REVEAL - 24, Math.min(0, base + dx));
  return (
    <div className="srow">
      <button className="sdel" tabIndex={open ? 0 : -1} onClick={onDelete} aria-label="Delete entry">Delete</button>
      <div
        className={`sfront ${selected ? 'sel' : ''}`} role="row" tabIndex={0} aria-selected={selected}
        style={{ transform: `translateX(${x}px)`, transition: dx === null ? 'transform .15s' : 'none' }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } else if (e.key === 'Delete' || e.key === 'Backspace') onDelete(); }}
        onPointerDown={(e) => { swiped.current = false; st.current = { x: e.clientX, y: e.clientY, moved: false, swiping: false }; }}
        onPointerMove={(e) => {
          const s = st.current; if (!s) return;
          const mx = e.clientX - s.x, my = e.clientY - s.y;
          if (!s.swiping && Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.5) { s.swiping = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
          if (s.swiping) { s.moved = true; setDx(mx); }
        }}
        onPointerUp={() => {
          const s = st.current; st.current = null;
          if (s?.swiping && dx !== null) { swiped.current = true; const f = base + dx; if (f < -REVEAL / 2) { if (!open) buzz(15); onOpen(); } else onClose(); }
          setDx(null);
        }}
        onPointerCancel={() => { st.current = null; setDx(null); }}
        onClick={() => { if (swiped.current) { swiped.current = false; return; } if (open) onClose(); else onTap(); }}
      >{children}</div>
    </div>
  );
}

export function EventTable({ selectedId, onSelect, onEdit, onMove, moving }: {
  selectedId: string | null; onSelect: (id: string | null) => void; onEdit: (e: GameEvent) => void; onMove: () => void; moving: boolean;
}) {
  const { game, d, actions } = useGame();
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = d.events.filter((e) => KINDS.has(e.type)).reverse();
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const pair = (r: Record<Side, number[]>) => `${sum(r.home)}–${sum(r.away)}`;

  const cell = (id?: string | null, won?: boolean) => (
    <span className={won ? 'won' : ''} title={id ? pLabel(game, id) : undefined}>{id ? pLabel(game, id, true) : '—'}{won ? ' ✓' : ''}</span>
  );

  const del = async (e: GameEvent) => {
    setOpenId(null);
    if (selectedId === e.id) onSelect(null);
    await actions.voidEvent(e.id);
    toast('Entry deleted');
  };

  const row = (e: GameEvent) => {
    const x = e.data;
    let home: ReactNode = null, away: ReactNode = null, misc: ReactNode = null;
    const side = (t: Side, n: ReactNode) => { if (t === 'home') home = n; else away = n; };
    if (e.type === 'goal') {
      const g = d.goals.find((r) => r.ev.id === e.id);
      const a = (x.assists ?? []).filter(Boolean).map((id: string) => pLabel(game, id, true)).join(' ');
      side(x.team, cell(x.scorer));
      misc = <><Abbr code={x.strength} info={STRENGTH_INFO[x.strength as keyof typeof STRENGTH_INFO] ?? x.strength} /> · {a ? `A: ${a}` : 'unassisted'}{g ? ` · ${g.home}–${g.away}` : ''}</>;
    } else if (e.type === 'penalty') {
      side(x.team, cell(x.player));
      misc = `${x.label} · ${x.minutes}m`;
    } else if (e.type === 'shot') {
      side(x.team, cell(x.player));
      misc = x.result === 'save' ? 'On goal' : x.result === 'miss' ? 'Missed' : 'Blocked';
    } else {
      const f = faceoffSides(x as any);
      home = cell(f.home, f.winner === 'home');
      away = cell(f.away, f.winner === 'away');
      misc = dotById(x.dot)?.label ?? 'dot not set';
    }
    const isSel = selectedId === e.id;
    const hasLoc = x.x != null;
    return (
      <div key={e.id} role="rowgroup">
        <SwipeRow open={openId === e.id} onOpen={() => setOpenId(e.id)} onClose={() => setOpenId(null)} onDelete={() => void del(e)}
          selected={isSel} onTap={() => { buzz(); onSelect(isSel ? null : e.id); }}>
          <span className="c-per">{periodName(e.period, game.rules)}</span>
          <span className="c-time">{fmtClock(e.clock)}</span>
          <span className="c-ev">{NAME[e.type]}</span>
          <span className="c-h" role="cell">{home}</span>
          <span className="c-a" role="cell">{away}</span>
          <span className="c-m" role="cell">{misc}</span>
        </SwipeRow>
        {isSel && (
          <div className="selbar">
            <span className="small grow">{hasLoc ? (moving ? 'Tap the rink to place it' : 'Highlighted on the rink') : 'No rink location'}</span>
            <button className="btn sm" onClick={() => onEdit(e)}>✎ Edit</button>
            {(hasLoc || e.type === 'shot' || e.type === 'goal' || e.type === 'faceoff') && (
              <button className={`btn sm ${moving ? 'primary' : ''}`} onClick={onMove}>{moving ? 'Cancel move' : '⤧ Move'}</button>
            )}
            <button className="btn sm danger" onClick={() => void del(e)}>Delete</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card evtable" style={{ padding: 0 }}>
      <div className="tally small">
        <span>Score <b>{d.score.home}–{d.score.away}</b></span>
        <span>SOG <b>{pair(d.byPeriod.sog)}</b></span>
        <span>PIM <b>{pair(d.byPeriod.pim)}</b></span>
        <span>FO won <b>{pair(d.byPeriod.fo)}</b></span>
      </div>
      <div role="table" aria-label="Game events">
        <div className="shead" role="row">
          <span className="c-per">Per</span><span className="c-time">Time</span><span className="c-ev">Event</span>
          <span className="c-h home">{sideName(game, 'home')}</span><span className="c-a away">{sideName(game, 'away')}</span><span className="c-m">Misc</span>
        </div>
        {rows.length === 0 && <div className="muted" style={{ padding: 14 }}>Nothing recorded yet. Goals, shots, penalties and faceoffs appear here — tap a row to highlight it on the rink, swipe left to delete.</div>}
        {rows.map(row)}
      </div>
      <div className="muted small" style={{ padding: '6px 12px 10px' }}>Tap a row to highlight · swipe left to delete · hover or press-and-hold <Abbr code="EV" info={STRENGTH_INFO.EV} /> / PP / SH for what they mean</div>
    </div>
  );
}
