import { useState } from 'react';
import type { GameEvent, Side } from '../../../shared/src/types.ts';
import { fmtClock } from '../../../shared/src/derive.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { describe, faceoffSides } from '../describe.ts';
import { dotById } from '../../../shared/src/rink.ts';
import { Rink } from '../components/Rink.tsx';
import { Sheet, sortPlayers } from '../components/ui.tsx';

export function LogTab() {
  const { game, d, canEdit } = useGame();
  const [shifts, setShifts] = useState(false);
  const [sel, setSel] = useState<GameEvent | null>(null);
  const list = d.events.filter((e) => shifts || e.type !== 'shift').sort((a, b) => b.wall - a.wall);
  return (
    <div className="col">
      <label className="row small muted"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={shifts} onChange={(e) => setShifts(e.target.checked)} /> Show line changes</label>
      <div className="card" style={{ padding: '4px 14px' }}>
        {list.length === 0 && <div className="muted" style={{ padding: 12 }}>Nothing recorded yet.</div>}
        {list.map((e, i) => {
          const x = describe(game, e);
          return (
            <button key={e.id} className="logrow" style={{ all: 'unset', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 0, width: '100%', cursor: canEdit ? 'pointer' : 'default', boxSizing: 'border-box' }} onClick={() => canEdit && setSel(e)}>
              <div className="when" style={{ width: 64, textAlign: 'right', flexShrink: 0 }}><b>{fmtClock(e.clock)}</b><div className="muted small">{periodName(e.period, game.rules)}</div></div>
              {x.team ? <span className={`dot ${x.team}`} /> : <span className="dot" style={{ background: 'var(--line)' }} />}
              <div className="grow"><div>{x.title}</div>{x.sub && <div className="muted small">{x.sub}</div>}</div>
              {canEdit && <span className="muted">›</span>}
            </button>
          );
        })}
      </div>
      {sel && <EditSheet e={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export function EditSheet({ e, onClose }: { e: GameEvent; onClose: () => void }) {
  const { game, actions } = useGame();
  const [period, setPeriod] = useState(e.period);
  const [m, setM] = useState(String(Math.floor(e.clock / 60)));
  const [s, setS] = useState(String(e.clock % 60).padStart(2, '0'));
  const [patch, setPatch] = useState<Record<string, any>>({});
  const f0 = faceoffSides(e.data as any);
  const [fo, setFo] = useState<{ home?: string; away?: string; winner: Side; dot?: string }>({ home: f0.home, away: f0.away, winner: f0.winner, dot: e.data.dot });
  const data = { ...e.data, ...patch };
  const team: Side | undefined = data.team;
  const ps = team ? sortPlayers(game[team].players) : [];
  const opts = (v?: string) => (<>
    <option value="">— none —</option>
    {ps.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
    {v && !ps.some((p) => p.id === v) && <option value={v}>#?</option>}
  </>);
  const set = (k: string, v: any) => setPatch({ ...patch, [k]: v });
  const maxP = game.rules.periods + 3;

  return (
    <Sheet title={describe(game, e).title} onClose={onClose}>
      <div className="col">
        <div className="row">
          <label className="field grow"><span>Period</span>
            <select value={period} onChange={(x) => setPeriod(Number(x.target.value))}>{Array.from({ length: maxP }, (_, i) => <option key={i} value={i + 1}>{periodName(i + 1, game.rules)}</option>)}</select></label>
          <label className="field" style={{ width: 90 }}><span>Min</span><input inputMode="numeric" value={m} onChange={(x) => setM(x.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
          <label className="field" style={{ width: 90 }}><span>Sec</span><input inputMode="numeric" value={s} onChange={(x) => setS(x.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
        </div>
        {team && e.type !== 'timeout' && e.type !== 'note' && e.type !== 'faceoff' && (
          <div className="seg">{(['home', 'away'] as Side[]).map((t) => <button key={t} className={`${t} ${team === t ? 'on' : ''}`} onClick={() => setPatch({ ...patch, team: t, scorer: undefined, assists: [], player: undefined })}>{game[t].name}</button>)}</div>
        )}
        {e.type === 'goal' && (<>
          <label className="field"><span>Scorer</span><select value={data.scorer ?? ''} onChange={(x) => set('scorer', x.target.value || undefined)}>{opts(data.scorer)}</select></label>
          {[0, 1].map((i) => (
            <label className="field" key={i}><span>Assist {i + 1}</span>
              <select value={data.assists?.[i] ?? ''} onChange={(x) => { const a = [...(data.assists ?? [])]; a[i] = x.target.value; set('assists', a.filter(Boolean)); }}>{opts(data.assists?.[i])}</select></label>
          ))}
          <label className="field"><span>Strength</span><select value={data.strength} onChange={(x) => set('strength', x.target.value)}>{['EV', 'PP', 'SH', 'EN', 'PS'].map((v) => <option key={v}>{v}</option>)}</select></label>
        </>)}
        {e.type === 'faceoff' && (<>
          {(['home', 'away'] as Side[]).map((t) => (
            <label className="field" key={t}><span>{game[t].name || t} player</span>
              <select value={fo[t] ?? ''} onChange={(x) => setFo({ ...fo, [t]: x.target.value || undefined })}>
                <option value="">— unknown —</option>
                {sortPlayers(game[t].players).map((p) => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
              </select></label>
          ))}
          <div className="field"><span>Won by</span>
            <div className="seg">{(['home', 'away'] as Side[]).map((t) => <button key={t} className={`${t} ${fo.winner === t ? 'on' : ''}`} onClick={() => setFo({ ...fo, winner: t })}>{game[t].name || t}</button>)}</div></div>
          <div className="field"><span>Faceoff dot: {dotById(fo.dot)?.label ?? 'not set'}</span>
            <Rink vertical={false} maxVh={30} dots={{ selected: fo.dot, onPick: (id) => setFo({ ...fo, dot: fo.dot === id ? undefined : id }) }} /></div>
        </>)}
        {(e.type === 'shot' || e.type === 'penalty') && (
          <label className="field"><span>Player</span><select value={data.player ?? ''} onChange={(x) => set('player', x.target.value || undefined)}>{opts(data.player)}</select></label>
        )}
        {e.type === 'shot' && (
          <label className="field"><span>Result</span><select value={data.result} onChange={(x) => set('result', x.target.value)}><option value="save">On goal</option><option value="miss">Missed</option><option value="block">Blocked</option></select></label>
        )}
        {e.type === 'penalty' && (
          <label className="field"><span>Minutes</span><select value={data.minutes} onChange={(x) => set('minutes', Number(x.target.value))}>{[2, 4, 5, 10].map((v) => <option key={v}>{v}</option>)}</select></label>
        )}
        {e.type === 'note' && <label className="field"><span>Text</span><textarea value={data.text} onChange={(x) => set('text', x.target.value)} /></label>}
        <div className="row">
          <button className="btn danger grow" onClick={async () => { await actions.voidEvent(e.id); onClose(); }}>Delete</button>
          <button className="btn primary grow" onClick={async () => {
            const clock = Math.min(59, Number(s || 0)) + Number(m || 0) * 60;
            let p = patch;
            if (e.type === 'faceoff') {
              const loser = fo.winner === 'home' ? fo.away : fo.home;
              const dot = dotById(fo.dot);
              // null (not undefined) so the override survives JSON sync
              p = { team: fo.winner, player: fo[fo.winner] ?? null, loser: loser ?? null, dot: dot?.id ?? null, x: dot?.x ?? null, y: dot?.y ?? null };
            }
            await actions.edit(e.id, p, period, clock);
            onClose();
          }}>Save</button>
        </div>
        <p className="muted small">Edits and deletes are logged — nothing is ever erased from the event history.</p>
      </div>
    </Sheet>
  );
}
