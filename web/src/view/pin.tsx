import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Game } from '../../../shared/src/types.ts';
import { db } from '../db.ts';
import { Sheet } from '../components/ui.tsx';

/** Checks the scorer PIN with the server and remembers it on this device (storing the game too if it isn't here yet). */
async function unlock(game: Game, pin: string): Promise<void> {
  let r: Response;
  try {
    r = await fetch('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewToken: game.viewToken, pin }) });
  } catch { throw new Error('You need a connection to check the PIN'); }
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many attempts — wait a minute' : "That PIN isn't right");
  const j = await r.json();
  await db.secrets.put({ gameId: j.game.id, pin });
  // never overwrite a copy that already lives here: it may hold events that haven't synced yet
  if (!(await db.games.get(j.game.id))) {
    const cursor = j.events.reduce((m: number, e: any) => Math.max(m, e.recv ?? 0), 0);
    await db.games.put({ ...j.game, dirty: 0, cursor });
    await db.events.bulkPut(j.events.map(({ recv: _r, ...e }: any) => ({ ...e, synced: 1 })));
  }
}

function PinSheet({ game, onClose, onDone }: { game: Game; onClose: () => void; onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await unlock(game, pin); onDone(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Sheet title="Scorer PIN" onClose={onClose}>
      <form className="col" onSubmit={(e) => { e.preventDefault(); if (pin.length >= 4 && !busy) void submit(); }}>
        <p className="muted" style={{ margin: 0 }}>Enter the scorer PIN to switch to scoring. You only need it once on this device.</p>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" aria-label="Scorer PIN" placeholder="PIN" value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setErr(''); }}
          style={{ textAlign: 'center', fontSize: 28, letterSpacing: '.3em' }} />
        {err && <div role="alert" style={{ color: 'var(--bad)', fontWeight: 650 }}>{err}</div>}
        <div className="row">
          <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary grow" disabled={pin.length < 4 || busy}>{busy ? 'Checking…' : 'Unlock scoring'}</button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Switching to scoring needs the scorer PIN unless this device already has it (the device that made the game does).
 * `toggleMode` flips an on-device game to scoring; a live-link viewer goes to the local copy of the game instead.
 */
export function useScoreGate(game: Game, toggleMode?: () => void) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const go = () => { if (toggleMode) toggleMode(); else nav(`/game/${game.id}`); };
  const enter = async () => {
    if (await db.secrets.get(game.id)) go(); else setOpen(true);
  };
  const sheet = open ? <PinSheet game={game} onClose={() => setOpen(false)} onDone={() => { setOpen(false); go(); }} /> : null;
  return { enter, sheet };
}
