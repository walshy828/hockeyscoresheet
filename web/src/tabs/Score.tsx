import { useMemo, useRef, useState } from 'react';
import type { GameEvent, Side } from '../../../shared/src/types.ts';
import { defenderAt, nearestDot, rinkEnds } from '../../../shared/src/rink.ts';
import { other } from '../../../shared/src/derive.ts';
import { useGame } from '../ctx.ts';
import { Rink, type Marker } from '../components/Rink.tsx';
import { ActionSheet, type ActionInit } from '../components/ActionSheet.tsx';
import { Sheet, UndoButton, toast } from '../components/ui.tsx';
import { VoiceButton, VoiceNoteButton } from '../components/Voice.tsx';
import { sideName } from '../describe.ts';
import { useLocalSetting } from '../theme.ts';
import { useClock } from '../components/Clock.tsx';
import { EventTable } from '../components/EventTable.tsx';
import { EditSheet } from './Log.tsx';
import { setScoreLayout } from '../layout.ts';

export function useMarkers() {
  const { d } = useGame();
  return useMemo<Marker[]>(() => {
    const m: Marker[] = [];
    for (const g of d.goals) if (g.d.x !== undefined) m.push({ id: g.ev.id, x: g.d.x, y: g.d.y!, team: g.d.team, kind: 'goal' });
    for (const s of d.shots) if (s.d.x !== undefined) m.push({ id: s.ev.id, x: s.d.x, y: s.d.y!, team: s.d.team, kind: s.d.result === 'save' ? 'shot' : s.d.result });
    return m;
  }, [d]);
}

export function useVertical() {
  const [pref, setPref] = useLocalSetting<'auto' | 'v' | 'h'>('rinkOrient', 'auto');
  const auto = typeof window !== 'undefined' && window.innerWidth < 700 && window.innerHeight > window.innerWidth;
  const vertical = pref === 'auto' ? auto : pref === 'v';
  return { vertical, cycle: () => setPref(vertical ? 'h' : 'v') };
}

export function ScoreTab() {
  const { game, d, actions, canEdit, saveGame } = useGame();
  const c = useClock();
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [sheet, setSheet] = useState<ActionInit | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<GameEvent | null>(null);
  const rinkRef = useRef<HTMLDivElement>(null);
  const base = useMarkers();
  const markers = useMemo<Marker[]>(() => [
    ...base,
    ...d.faceoffs.filter((f) => f.d.x != null).map((f): Marker => ({ id: f.ev.id, x: f.d.x!, y: f.d.y!, team: f.d.team, kind: 'faceoff' })),
  ], [base, d]);
  const selected = selId ? d.events.find((e) => e.id === selId) : undefined;
  const select = (id: string | null) => { setSelId(id); setMoving(false); };
  const place = async (x: number, y: number) => {
    if (!selected) return;
    if (selected.type === 'faceoff') { const dt = nearestDot(x, y); await actions.edit(selected.id, { dot: dt.id, x: dt.x, y: dt.y }); toast(`Moved to ${dt.label}`); }
    else { await actions.edit(selected.id, { x, y }); toast('Moved'); }
    setMoving(false);
  };
  const { vertical, cycle } = useVertical();

  const { leftTeam, rightTeam, leftLabel, rightLabel } = rinkEnds(game);
  const guess = (x: number): Side => other(defenderAt(game, x));

  if (!canEdit) return <div className="banner">View mode — switch to Scoring mode to record events.</div>;

  return (
    <div className="col">
      <div ref={rinkRef}><Rink
        vertical={vertical}
        markers={markers}
        selectedId={selected?.id}
        pending={pending}
        zoom={zoom}
        leftLabel={leftLabel} rightLabel={rightLabel} leftTeam={leftTeam}
        onTap={(x, y) => { if (picking) { setZoom({ x, y }); setPicking(false); return; } if (moving && selected) { void place(x, y); return; } setPending({ x, y }); setSheet({ kind: 'shot', team: guess(x), x, y }); }}
      /></div>
      {picking && <div className="banner">Tap the area you want to zoom into (e.g. the crease).</div>}
      {moving && selected && <div className="banner">Moving the highlighted {selected.type} — tap its new spot on the rink.</div>}
      <div className="muted small" style={{ textAlign: 'center', marginTop: -4 }}>
        Tap the rink where the shot or goal came from · <button className="btn sm ghost" onClick={cycle}>⟳ rotate</button> {zoom
          ? <button className="btn sm ghost" onClick={() => setZoom(null)}>🔍 zoom out</button>
          : <button className="btn sm ghost" aria-pressed={picking} onClick={() => setPicking(!picking)}>🔍 {picking ? 'cancel zoom' : 'zoom'}</button>}
      </div>
      <div className="row wrap">
        <button className="btn grow" onClick={() => setSheet({ kind: 'faceoff', team: 'home' })}>Faceoff</button>
        <button className="btn grow" onClick={() => setSheet({ kind: 'penalty', team: actions.lastTeam.current ?? 'home' })}>Penalty</button>
        <button className="btn grow" onClick={() => setSheet({ kind: 'goal', team: actions.lastTeam.current ?? 'home' })}>Goal</button>
      </div>
      <div className="row wrap">
        <VoiceButton onOpenAction={(i) => setSheet(i)} />
        <UndoButton className="btn grow" onUndo={() => void actions.undoLast()} />
      </div>
      <EventTable selectedId={selected?.id ?? null} onSelect={select} onEdit={setEditing} moving={moving}
        onMove={() => { setMoving((m) => !m); rinkRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }} />
      {editing && <EditSheet e={editing} onClose={() => setEditing(null)} />}
      {sheet && <ActionSheet key={`${sheet.kind}${sheet.x}${sheet.y}`} init={sheet} onClose={() => { setSheet(null); setPending(null); }} />}
    </div>
  );
}
