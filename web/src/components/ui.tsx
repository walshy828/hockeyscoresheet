import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Player } from '../../../shared/src/types.ts';
import { teamNameStyle, useIsDark } from '../theme.ts';

/* ---------- time ---------- */
export function useNow(ms = 250) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return n;
}

/* ---------- haptics ---------- */
export const buzz = (ms = 12) => { try { if (localStorage.getItem('hs:haptics') !== 'false') navigator.vibrate?.(ms); } catch { /* unsupported */ } };

/* ---------- toast ---------- */
interface ToastMsg { id: number; text: string; action?: { label: string; fn: () => void } }
let toasts: ToastMsg[] = [];
const subs = new Set<() => void>();
let tid = 0;
export function toast(text: string, action?: ToastMsg['action'], ms = 6000) {
  const t = { id: ++tid, text, action };
  toasts = [t]; subs.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); subs.forEach((f) => f()); }, ms);
}
export function Toasts() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => toasts);
  return <>{list.map((t) => (
    <div className="toast" key={t.id} role="status">
      <span>{t.text}</span>
      {t.action && <button onClick={() => { t.action!.fn(); toasts = []; subs.forEach((f) => f()); }}>{t.action.label}</button>}
    </div>
  ))}</>;
}

/* ---------- sheet ---------- */
export function Sheet({ title, onClose, children }: { title?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  // portal to body so a parent stacking context (e.g. sticky header) can't put the sheet under the nav
  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </>,
    document.body,
  );
}

export function Confirm({ title, body, confirm, danger, onYes, onNo }: { title: string; body?: ReactNode; confirm: string; danger?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <Sheet title={title} onClose={onNo}>
      {body && <p className="muted">{body}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn grow" onClick={onNo}>Cancel</button>
        <button className={`btn grow ${danger ? 'danger' : 'primary'}`} onClick={onYes}>{confirm}</button>
      </div>
    </Sheet>
  );
}

/* ---------- long press ---------- */
export function useLongPress(onTap: () => void, onLong: () => void, ms = 450) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { clearTimeout(timer.current); timer.current = undefined; };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => { fired.current = true; buzz(25); onLong(); }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
    onClick: () => { if (fired.current) { fired.current = false; return; } buzz(); onTap(); },
    style: { WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties,
  };
}

import { lastName, usePlayerDisplay } from '../playerDisplay.ts';

export function PlayerChip({ p, on, ice, extra, onTap, onLong, badge, sub }: { p: Player; on?: boolean; ice?: boolean; extra?: boolean; onTap: () => void; onLong?: () => void; badge?: string; sub?: string }) {
  const h = useLongPress(onTap, onLong ?? (() => {}));
  const mode = usePlayerDisplay();
  const last = lastName(p);
  const main = mode === 'name' && last ? last : p.number;
  const small = sub ?? (mode === 'both' ? last || p.pos : undefined);
  return (
    <button className={`chip ${mode === 'name' ? 'wide' : ''} ${on ? 'on' : ''} ${ice ? 'ice' : ''} ${extra ? 'extra' : ''} ${p.pos === 'G' ? 'G' : ''}`} {...h} aria-pressed={on} aria-label={`${p.number} ${p.name}`}>
      <span>{main}{badge ? <sup style={{ fontSize: 10, marginLeft: 2 }}>{badge}</sup> : null}</span>
      {small !== undefined && <small>{small}</small>}
    </button>
  );
}

export function download(name: string, data: string | Blob, mime = 'application/json') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const sortPlayers = (ps: Player[]) => [...ps].sort((a, b) => (Number(a.number) - Number(b.number)) || a.number.localeCompare(b.number));
export const POS: Player['pos'][] = ['C', 'LW', 'RW', 'D', 'G', 'F'];

/** Abbreviation with a hover tooltip (desktop) and press-and-hold toast (touch). */
export function Abbr({ code, info }: { code: string; info: string }) {
  const timer = useRef<number | undefined>(undefined);
  const clear = () => { clearTimeout(timer.current); timer.current = undefined; };
  return (
    <abbr className="abbr" title={info}
      onPointerDown={() => { clear(); timer.current = window.setTimeout(() => { buzz(25); toast(`${code} — ${info}`, undefined, 4000); }, 450); }}
      onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear} onPointerMove={clear}
      onContextMenu={(e) => e.preventDefault()}>{code}</abbr>
  );
}

/* ---------- undo (tap twice to confirm) ---------- */
export function UndoButton({ onUndo, className = 'btn' }: { onUndo: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`${className}${armed ? ' danger' : ''}`} onClick={() => { if (armed) { setArmed(false); onUndo(); } else setArmed(true); }}>
      {armed ? 'Sure? Confirm' : '↶ Undo'}
    </button>
  );
}

/** A team's name in its colour; gets a contrasting pill when the colour would vanish into the theme. */
export function TeamName({ color, children }: { color: string; children: ReactNode }) {
  const dark = useIsDark();
  const t = teamNameStyle(color, dark);
  return <b className={t.pill ? 'tname pill' : 'tname'} style={{ color: t.color, background: t.background }}>{children}</b>;
}
