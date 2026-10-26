import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db.ts';
import { toast } from '../components/ui.tsx';

export function Join() {
  const nav = useNavigate();
  const [link, setLink] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const token = link.match(/\/v\/([\w-]+)/)?.[1] ?? link.trim();
      const r = await fetch('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewToken: token, pin }) });
      if (!r.ok) throw new Error(r.status === 429 ? 'Too many attempts — wait a minute' : 'Link or PIN is wrong');
      const j = await r.json();
      const cursor = j.events.reduce((m: number, e: any) => Math.max(m, e.recv ?? 0), 0);
      await db.secrets.put({ gameId: j.game.id, pin });
      await db.games.put({ ...j.game, dirty: 0, cursor });
      await db.events.bulkPut(j.events.map(({ recv: _r, ...e }: any) => ({ ...e, synced: 1 })));
      nav(`/game/${j.game.id}`, { replace: true });
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <div className="topbar"><button className="btn icon ghost" onClick={() => nav('/')}>‹</button><h1>Join as scorer</h1></div>
      <div className="card col">
        <p className="muted" style={{ margin: 0 }}>Take over or share scoring of a game created on another device. Needs a connection once; after that it works offline.</p>
        <label className="field"><span>Game link</span><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/v/abc123" autoCapitalize="off" autoCorrect="off" /></label>
        <label className="field"><span>Scorer PIN</span><input inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
        <button className="btn primary" disabled={!link || pin.length < 4 || busy} onClick={submit}>{busy ? 'Joining…' : 'Join game'}</button>
      </div>
    </div>
  );
}
