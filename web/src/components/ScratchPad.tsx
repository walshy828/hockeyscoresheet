import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtClock } from '../../../shared/src/derive.ts';
import { useGame } from '../ctx.ts';
import { db, type ScratchItem } from '../db.ts';
import { uid } from '../ids.ts';
import { useLocalSetting } from '../theme.ts';
import { Confirm, Sheet, buzz, toast } from './ui.tsx';
import { listenOnce, voiceSupported } from './Voice.tsx';

/** Header button (with item count) that opens the scratch pad from any tab. */
export function ScratchButton() {
  const { game } = useGame();
  const [open, setOpen] = useState(false);
  const count = useLiveQuery(() => db.scratch.where('gameId').equals(game.id).count(), [game.id]) ?? 0;
  return (
    <>
      <button className="btn sm icon scratch-btn" aria-label={`Scratch pad, ${count} items`} onClick={() => setOpen(true)}>
        📝{count > 0 && <span className="scratch-count">{count}</span>}
      </button>
      {open && <ScratchPad onClose={() => setOpen(false)} />}
    </>
  );
}

function ScratchPad({ onClose }: { onClose: () => void }) {
  const { game, actions } = useGame();
  const items = useLiveQuery(() => db.scratch.where('gameId').equals(game.id).reverse().sortBy('created'), [game.id]) ?? [];
  const [lang] = useLocalSetting('voiceLang', 'en-US');
  const [text, setText] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [rec, setRec] = useState<{ stop: () => void } | null>(null);
  const [secs, setSecs] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const stopDictate = useRef<() => void>(() => {});

  useEffect(() => { if (!rec) return; const i = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(i); }, [rec]);
  // stop mic/recorder if the pad is closed mid-capture
  useEffect(() => () => { stopDictate.current(); }, []);

  const stamp = () => { const c = actions.clockNow(); return { period: c.period, clock: Math.ceil(c.remaining), created: Date.now() }; };
  const add = (it: Omit<ScratchItem, 'id' | 'gameId' | 'period' | 'clock' | 'created'>) =>
    db.scratch.add({ ...it, id: uid(), gameId: game.id, ...stamp() });

  const addText = async () => {
    const t = text.trim();
    if (!t) return;
    await add({ kind: 'text', text: t });
    setText(''); buzz();
  };

  const dictate = () => {
    if (dictating) { stopDictate.current(); return; }
    if (!voiceSupported) { toast('Speech-to-text is not supported in this browser'); return; }
    buzz(20); setDictating(true);
    const l = listenOnce(lang);
    stopDictate.current = l.stop;
    l.promise
      .then((t) => setText((cur) => (cur ? cur + ' ' : '') + t))
      .catch((e: Error) => { if (!/no speech|aborted/.test(e.message)) toast(`Voice: ${e.message}`); })
      .finally(() => { setDictating(false); stopDictate.current = () => {}; });
  };

  const record = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Recording is not supported here (needs HTTPS)'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      const at = stamp(); // time of the moment, not of when recording stopped
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        await db.scratch.add({ id: uid(), gameId: game.id, kind: 'voice', blob, ...at });
        setRec(null); setSecs(0);
      };
      mr.start();
      stopDictate.current = () => mr.stop();
      setRec({ stop: () => mr.stop() });
    } catch (e) {
      toast(`Microphone: ${(e as Error).message}`);
    }
  };

  const clearAll = async () => {
    await db.scratch.where('gameId').equals(game.id).delete();
    setConfirmClear(false);
  };

  if (confirmClear) {
    return <Confirm title="Clear scratch pad?" body={`Delete all ${items.length} items. This can't be undone.`} confirm="Clear all" danger onYes={clearAll} onNo={() => setConfirmClear(false)} />;
  }

  return (
    <Sheet title="Scratch pad" onClose={onClose}>
      <div className="col">
        {drawing ? (
          <DrawPad
            onCancel={() => setDrawing(false)}
            onSave={async (blob) => { await add({ kind: 'draw', blob }); setDrawing(false); buzz(); }}
          />
        ) : (
          <>
            <label className="field">
              <span>Quick note</span>
              <textarea style={{ minHeight: 64 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="#17 was in the box… who got the 2nd assist?" />
            </label>
            <div className="row">
              <button className="btn primary grow" disabled={!text.trim()} onClick={() => void addText()}>Add note</button>
              <button className={`btn ${dictating ? 'primary' : ''}`} onClick={dictate} aria-pressed={dictating} aria-label="Speech to text">{dictating ? '● Listening…' : '🎤 Dictate'}</button>
            </div>
            <div className="row">
              {rec
                ? <button className="btn primary grow" onClick={() => rec.stop()}>■ Stop recording ({secs}s)</button>
                : <button className="btn grow" onClick={() => void record()}>🎙 Record memo</button>}
              <button className="btn grow" disabled={!!rec} onClick={() => setDrawing(true)}>✏️ Draw</button>
            </div>
          </>
        )}
        <div className="row" style={{ marginTop: 4 }}>
          <b className="grow">{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Nothing here yet'}</b>
          {items.length > 0 && <button className="btn sm danger" onClick={() => setConfirmClear(true)}>Clear all</button>}
        </div>
        {items.map((it) => <ScratchRow key={it.id} it={it} />)}
        {items.length > 0 && <div className="muted small">Kept on this device only. File items into the game log with “Add to log”, then they’re removed from here.</div>}
      </div>
    </Sheet>
  );
}

function ScratchRow({ it }: { it: ScratchItem }) {
  const { game, actions } = useGame();
  const url = useMemo(() => (it.blob ? URL.createObjectURL(it.blob) : undefined), [it.blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const [big, setBig] = useState(false);

  const remove = async () => { await db.scratch.delete(it.id); toast('Removed', { label: 'Undo', fn: () => void db.scratch.put(it) }); };
  const file = async () => {
    if (it.kind === 'voice' && it.blob) {
      const id = uid();
      await db.blobs.put({ id, gameId: game.id, mime: it.blob.type, data: it.blob, synced: 0 });
      await actions.note(it.text?.trim() || '(voice memo)', id);
    } else if (it.text) {
      await actions.note(it.text);
    }
    await db.scratch.delete(it.id);
  };

  return (
    <div className="card scratch-item">
      <div className="row small muted" style={{ marginBottom: 6 }}>
        <span>{it.kind === 'text' ? '📝' : it.kind === 'voice' ? '🎙' : '✏️'}</span>
        <span className="grow">P{it.period} · {fmtClock(it.clock)} left · {new Date(it.created).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      {it.kind === 'text' && <div style={{ whiteSpace: 'pre-wrap' }}>{it.text}</div>}
      {it.kind === 'voice' && url && <audio controls preload="none" src={url} style={{ width: '100%', height: 36 }} />}
      {it.kind === 'draw' && url && <img src={url} alt="Sketch" className={`scratch-img ${big ? 'big' : ''}`} onClick={() => setBig(!big)} />}
      <div className="row" style={{ marginTop: 8 }}>
        {it.kind !== 'draw' && <button className="btn sm grow" onClick={() => void file()}>Add to log</button>}
        <button className="btn sm danger grow" onClick={() => void remove()}>Delete</button>
      </div>
    </div>
  );
}

type Stroke = { color: string; w: number; pts: Array<[number, number]> };
const W = 720, H = 440;

function DrawPad({ onSave, onCancel }: { onSave: (b: Blob) => void | Promise<void>; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const [color, setColor] = useState('#111827');
  const [w, setW] = useState(4);
  const [n, setN] = useState(0);

  const paint = () => {
    const c = ref.current!.getContext('2d')!;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of [...strokes.current, ...(cur.current ? [cur.current] : [])]) {
      c.strokeStyle = s.color; c.fillStyle = s.color; c.lineWidth = s.w;
      if (s.pts.length === 1) { c.beginPath(); c.arc(s.pts[0][0], s.pts[0][1], s.w / 2, 0, Math.PI * 2); c.fill(); continue; }
      c.beginPath(); s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    }
  };
  useEffect(paint, []);

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const down = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); cur.current = { color, w, pts: [pt(e)] }; paint(); };
  const move = (e: React.PointerEvent) => { if (cur.current) { cur.current.pts.push(pt(e)); paint(); } };
  const up = () => { if (cur.current) { strokes.current.push(cur.current); cur.current = null; setN(strokes.current.length); paint(); } };

  return (
    <div className="col">
      <canvas ref={ref} width={W} height={H} className="scratch-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="row wrap">
        {['#111827', '#d6322e', '#2f6df6'].map((c) => (
          <button key={c} className="btn sm icon" aria-label={`Ink ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} style={{ background: c, outline: color === c ? '3px solid var(--accent)' : 'none', outlineOffset: 2 }} />
        ))}
        <button className="btn sm" onClick={() => setW(w === 4 ? 9 : 4)}>{w === 4 ? 'Thin' : 'Thick'}</button>
        <span className="grow" />
        <button className="btn sm" disabled={!n} onClick={() => { strokes.current.pop(); setN(strokes.current.length); paint(); }}>↶ Undo</button>
        <button className="btn sm" disabled={!n} onClick={() => { strokes.current = []; setN(0); paint(); }}>Erase</button>
      </div>
      <div className="row">
        <button className="btn grow" onClick={onCancel}>Cancel</button>
        <button className="btn primary grow" disabled={!n} onClick={() => ref.current!.toBlob((b) => b && void onSave(b), 'image/png')}>Save sketch</button>
      </div>
    </div>
  );
}
