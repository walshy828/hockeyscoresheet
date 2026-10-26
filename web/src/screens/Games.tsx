import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, deleteGame, restoreGame, saveGame, type LocalGame } from '../db.ts';
import { derive } from '../../../shared/src/derive.ts';
import { token, uid } from '../ids.ts';
import { sideName } from '../describe.ts';
import { Confirm, Sheet, toast } from '../components/ui.tsx';
import { ShareSheet } from '../components/ShareSheet.tsx';
import { useSyncStatus } from '../sync.ts';

export function Games() {
  const nav = useNavigate();
  const games = useLiveQuery(() => db.games.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const [menu, setMenu] = useState<LocalGame | null>(null);
  const [del, setDel] = useState<LocalGame | null>(null);
  const [share, setShare] = useState<LocalGame | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const st = useSyncStatus();

  const rows = useMemo(() => {
    if (!games) return [];
    return games.filter((g) => !!g.deleted === showDeleted).sort((a, b) => b.date.localeCompare(a.date)).map((g) => {
      const evs = (events ?? []).filter((e) => e.gameId === g.id);
      return { g, evs, d: derive(evs, g) };
    });
  }, [games, events, showDeleted]);

  const dup = async (g: LocalGame) => {
    const id = uid();
    const copy: LocalGame = { ...g, id, viewToken: token(), status: 'scheduled', created: Date.now(), updated: Date.now(), dirty: 1, cursor: undefined };
    const sec = await db.secrets.get(g.id);
    if (sec) await db.secrets.put({ gameId: id, pin: sec.pin });
    await saveGame(copy);
    toast('Game duplicated (without events)');
  };

  return (
    <div className="page">
      <div className="topbar">
        <h1>Games</h1>
        <button className="btn sm ghost" onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? 'Show games' : 'Deleted'}</button>
        <button className="btn sm" onClick={() => nav('/join')}>Join</button>
      </div>
      <div className="col">
        {games && rows.length === 0 && (
          <div className="card col" style={{ textAlign: 'center' }}>
            <b>{showDeleted ? 'No deleted games' : 'No games yet'}</b>
            {!showDeleted && <span className="muted">Create a team with its roster, then start a game. Everything works without internet.</span>}
            {!showDeleted && <div className="row"><button className="btn grow" onClick={() => nav('/teams')}>Set up teams</button><button className="btn primary grow" onClick={() => nav('/game/new')}>New game</button></div>}
          </div>
        )}
        {rows.map(({ g, d }) => (
          <div className="card row" key={g.id} style={{ padding: 0, overflow: 'hidden' }}>
            <button className="grow" style={{ all: 'unset', cursor: 'pointer', padding: 14, minWidth: 0, flex: 1 }} onClick={() => !g.deleted && nav(`/game/${g.id}`)}>
              <div className="row small muted" style={{ marginBottom: 6 }}>
                <span className={`badge ${g.status}`}>{g.status === 'live' ? '● live' : g.status}</span>
                <span>{g.date.replace('T', ' ')}</span>
                {g.dirty ? <span title="Not yet synced">⟳</span> : null}
              </div>
              <div className="row"><span className="dot home" style={{ background: g.home.color }} /><b className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sideName(g, 'home')}</b><b style={{ fontSize: 24 }}>{d.score.home}</b></div>
              <div className="row"><span className="dot" style={{ background: g.away.color }} /><b className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sideName(g, 'away')}</b><b style={{ fontSize: 24 }}>{d.score.away}</b></div>
              {g.venue && <div className="muted small" style={{ marginTop: 4 }}>{g.venue}</div>}
            </button>
            <button className="btn ghost icon" style={{ height: 'auto', borderRadius: 0, borderLeft: '1px solid var(--line)', width: 56 }} aria-label="Game options" onClick={() => setMenu(g)}>⋯</button>
          </div>
        ))}
        <div className="muted small" style={{ textAlign: 'center' }}>{st.online ? '' : 'Offline — everything is saved on this device and will sync later.'}</div>
      </div>
      {!showDeleted && <button className="btn primary fab" onClick={() => nav('/game/new')}>＋ New game</button>}

      {menu && (
        <Sheet title={`${sideName(menu, 'away')} @ ${sideName(menu, 'home')}`} onClose={() => setMenu(null)}>
          <div className="col">
            {menu.deleted ? (
              <button className="btn primary" onClick={async () => { await restoreGame(menu.id); setMenu(null); toast('Game restored'); }}>Restore game</button>
            ) : (<>
              <button className="btn primary" onClick={() => nav(`/game/${menu.id}`)}>Score game</button>
              <button className="btn" onClick={() => nav(`/game/${menu.id}?mode=view`)}>View mode</button>
              <button className="btn" onClick={() => { setShare(menu); setMenu(null); }}>Share / export / email</button>
              <button className="btn" onClick={() => nav(`/game/${menu.id}/edit`)}>Edit details</button>
              <button className="btn" onClick={async () => { await dup(menu); setMenu(null); }}>Duplicate</button>
              <button className="btn danger" onClick={() => { setDel(menu); setMenu(null); }}>Delete</button>
            </>)}
          </div>
        </Sheet>
      )}
      {del && <Confirm danger title="Delete this game?" body="The live link stops working. You can restore it from the Deleted list." confirm="Delete" onNo={() => setDel(null)} onYes={async () => { await deleteGame(del.id); setDel(null); toast('Game deleted', { label: 'Undo', fn: () => void restoreGame(del.id) }); }} />}
      {share && <ShareSheet game={share} events={(events ?? []).filter((e) => e.gameId === share.id)} onClose={() => setShare(null)} />}
    </div>
  );
}
