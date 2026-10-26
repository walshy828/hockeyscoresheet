import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Game, GameEvent } from '../../../shared/src/types.ts';
import { GameScreen } from './Game.tsx';
import { setServerOffset } from '../components/Clock.tsx';
import { setSkew } from './Game.tsx';

const cacheKey = (t: string) => `hs:view:${t}`;

export function Viewer() {
  const { token } = useParams();
  const [game, setGame] = useState<Game | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [state, setState] = useState<'live' | 'reconnecting' | 'cached'>('reconnecting');
  const [missing, setMissing] = useState(false);
  const map = useRef(new Map<string, GameEvent>());

  useEffect(() => {
    let es: EventSource | undefined;
    let cancelled = false;
    const offset = (serverNow: number) => { setServerOffset(serverNow - Date.now()); setSkew(serverNow - Date.now()); };
    const apply = (g?: Game, evs?: GameEvent[]) => {
      if (g) setGame(g);
      if (evs?.length) { for (const e of evs) map.current.set(e.id, e); setEvents([...map.current.values()]); }
      try { localStorage.setItem(cacheKey(token!), JSON.stringify({ game: g ?? undefined, events: [...map.current.values()] })); } catch { /* quota */ }
    };
    // 1. show cache immediately
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey(token!)) ?? 'null');
      if (c?.events) { for (const e of c.events) map.current.set(e.id, e); setEvents([...map.current.values()]); }
      if (c?.game) { setGame(c.game); setState('cached'); }
    } catch { /* ignore */ }

    const full = async () => {
      const r = await fetch(`/api/view/${token}`);
      if (r.status === 404) { setMissing(true); return; }
      const j = await r.json();
      offset(j.now);
      map.current.clear();
      apply(j.game, j.events);
    };
    const connect = () => {
      es = new EventSource(`/api/view/${token}/stream`);
      es.onopen = () => { void full().then(() => !cancelled && setState('live')).catch(() => {}); };
      es.onmessage = (m) => {
        const j = JSON.parse(m.data);
        offset(j.now);
        apply(j.game, j.events);
        setState('live');
      };
      es.onerror = () => setState(navigator.onLine ? 'reconnecting' : 'cached');
    };
    void full().then(() => !cancelled && setState('live')).catch(() => setState((s) => (s === 'cached' ? s : 'reconnecting')));
    connect();
    return () => { cancelled = true; es?.close(); };
  }, [token]);

  if (missing) return <div className="page"><div className="card">This game link is no longer available.</div></div>;
  if (!game) return <div className="page muted">Loading live game…</div>;
  return <GameScreen game={game} events={events} canEdit={false} anchor="recv" live={state} />;
}
