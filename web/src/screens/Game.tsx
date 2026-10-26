import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Game, GameEvent } from '../../../shared/src/types.ts';
import { activePenalties, derive, fmtToi } from '../../../shared/src/derive.ts';
import { db, saveGame } from '../db.ts';
import { setActiveGame, useSyncStatus } from '../sync.ts';
import { Ctx } from '../ctx.ts';
import { useActions } from '../actions.ts';
import { ClockDisplay } from '../components/Clock.tsx';
import { ScratchButton } from '../components/ScratchPad.tsx';
import { ShareSheet } from '../components/ShareSheet.tsx';
import { Sheet, useNow } from '../components/ui.tsx';
import { sideName } from '../describe.ts';
import { ScoreTab } from '../tabs/Score.tsx';
import { LinesTab } from '../tabs/Lines.tsx';
import { BoxTab, FaceoffsTab, IceTab, ShotsTab, StatSeg } from '../tabs/Stats.tsx';
import { LogTab } from '../tabs/Log.tsx';
import { GoalieSheet, goalieLabel } from '../components/GoalieSheet.tsx';

export function LocalGame() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const game = useLiveQuery(() => db.games.get(id!), [id]);
  const events = useLiveQuery(() => db.events.where('gameId').equals(id!).toArray(), [id]);
  useEffect(() => { setActiveGame(id); return () => setActiveGame(undefined); }, [id]);
  if (!game || !events) return <div className="page muted">Loading game…</div>;
  const canEdit = sp.get('mode') !== 'view';
  return (
    <GameScreen
      game={game} events={events} canEdit={canEdit} anchor="wall"
      saveGame={async (g) => { await saveGame(g); }}
      toggleMode={() => setSp(canEdit ? { mode: 'view' } : {}, { replace: true })}
    />
  );
}

interface Props {
  game: Game; events: GameEvent[]; canEdit: boolean; anchor: 'wall' | 'recv';
  saveGame?: (g: Game) => Promise<void>;
  toggleMode?: () => void;
  live?: 'live' | 'reconnecting' | 'cached';
}

type Tab = 'score' | 'lines' | 'box' | 'shots' | 'faceoffs' | 'ice' | 'log';

export function GameScreen({ game, events, canEdit, anchor, saveGame, toggleMode, live }: Props) {
  const nav = useNavigate();
  const now = useNow(1000);
  const d = useMemo(() => derive(events, game, anchor === 'recv' ? now + serverSkew() : now, anchor), [events, game, now, anchor]);
  const actions = useActions(game, events, d);
  const [tab, setTab] = useState<Tab>(canEdit ? 'score' : 'box');
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [goalieSide, setGoalieSide] = useState<'home' | 'away' | null>(null);
  const st = useSyncStatus();
  useEffect(() => { setTab(canEdit ? 'score' : 'box'); }, [canEdit]);
  useEffect(() => { document.title = `${sideName(game, 'away')} @ ${sideName(game, 'home')}`; return () => { document.title = 'Hockey Scoresheet'; }; }, [game]);

  const pens = activePenalties(d);
  const sog = (s: 'home' | 'away') => d.byPeriod.sog[s].reduce((a, b) => a + b, 0);
  const tabs: Array<[Tab, string, string]> = canEdit
    ? [['score', '🏒', 'Score'], ['lines', '👥', 'Lines'], ['box', '📊', 'Stats'], ['shots', '🎯', 'Shots'], ['log', '🧾', 'Log']]
    : [['box', '📊', 'Box'], ['shots', '🎯', 'Shots'], ['faceoffs', '⚪', 'Faceoffs'], ['ice', '⏱', 'Ice time'], ['log', '🧾', 'Log']];
  const activeNav: Tab = tab === 'faceoffs' || tab === 'ice' ? (canEdit ? 'box' : tab) : tab;

  const goalieCell = (s: 'home' | 'away') => {
    const g = d.goalie[s];
    const txt = <>🥅 {goalieLabel(game, g)}</>;
    const cls = `sub goalie ${g === null ? 'empty' : ''}`;
    return canEdit
      ? <button className={`${cls} tap`} aria-label={`${sideName(game, s)} goalie`} onClick={() => setGoalieSide(s)}>{txt}</button>
      : <div className={cls}>{txt}</div>;
  };

  return (
    <Ctx.Provider value={{ game, events, d, canEdit, actions, now, anchor, saveGame }}>
      <div className="app">
        <header className="ghead">
          <div className="row" style={{ marginBottom: 4 }}>
            {live === undefined && <button className="btn sm icon ghost" aria-label="Back to games" onClick={() => nav('/')}>‹</button>}
            {live ? (
              <span className={`syncchip ${live === 'live' ? 'off' : 'pend'}`} style={live === 'live' ? { background: 'color-mix(in srgb, var(--bad) 18%, transparent)' } : undefined}>
                {live === 'live' ? <><span className="live-dot" />LIVE</> : live === 'cached' ? 'Offline · last known' : 'Reconnecting…'}
              </span>
            ) : (
              <span className={`syncchip ${!st.online ? 'off' : st.pending ? 'pend' : 'ok'}`}>
                {!st.online ? `Offline · ${st.pending} saved locally` : st.pending ? `⟳ ${st.pending} syncing` : '✓ Synced'}
              </span>
            )}
            <span className={`badge ${game.status}`}>{game.status}</span>
            <span className="grow" />
            {toggleMode && (
              <div className="seg" style={{ width: 150 }}>
                <button className={canEdit ? 'on' : ''} onClick={() => !canEdit && toggleMode()}>Score</button>
                <button className={!canEdit ? 'on' : ''} onClick={() => canEdit && toggleMode()}>View</button>
              </div>
            )}
            {canEdit && <ScratchButton />}
            <button className="btn sm icon" aria-label="Share and export" onClick={() => setShare(true)}>⤴</button>
            {live === undefined && <button className="btn sm icon" aria-label="Game menu" onClick={() => setMenu(true)}>⋯</button>}
          </div>
          <div className="teams">
            <div className="team-cell home"><div className="nm" style={{ color: game.home.color }}>{sideName(game, 'home')}</div><div className="sc">{d.score.home}</div><div className="sub">SOG {sog('home')}</div>{goalieCell('home')}</div>
            <ClockDisplay />
            <div className="team-cell away"><div className="nm" style={{ color: game.away.color }}>{sideName(game, 'away')}</div><div className="sc">{d.score.away}</div><div className="sub">SOG {sog('away')}</div>{goalieCell('away')}</div>
          </div>
          {pens.length > 0 && (
            <div className="pens">
              {pens.map((p) => <span key={p.ev.id} className={`pen ${p.d.team}`}>{p.d.player ? '#' + (game[p.d.team].players.find((x) => x.id === p.d.player)?.number ?? '?') : sideName(game, p.d.team).slice(0, 4)} {p.d.minutes}′ {fmtToi(p.remaining)}</span>)}
            </div>
          )}
        </header>
        <main className="page" style={{ paddingTop: 12 }}>
          <div className="print-only"><h2>{sideName(game, 'away')} @ {sideName(game, 'home')} — {game.date.replace('T', ' ')} {game.venue}</h2></div>
          {(tab === 'box' || tab === 'faceoffs' || tab === 'ice') && <StatSeg tab={tab} setTab={(t) => setTab(t as Tab)} />}
          {tab === 'score' && <ScoreTab />}
          {tab === 'lines' && <LinesTab />}
          {tab === 'box' && <BoxTab />}
          {tab === 'shots' && <ShotsTab />}
          {tab === 'faceoffs' && <FaceoffsTab />}
          {tab === 'ice' && <IceTab />}
          {tab === 'log' && <LogTab />}
        </main>
        <nav className="nav" aria-label="Game sections">
          {tabs.map(([k, ico, label]) => (
            <button key={k} className={activeNav === k ? 'active' : ''} onClick={() => setTab(k)}><span className="ico">{ico}</span>{label}</button>
          ))}
        </nav>
      </div>
      {menu && (
        <Sheet title="Game" onClose={() => setMenu(false)}>
          <div className="col">
            <button className="btn" onClick={() => { setMenu(false); setShare(true); }}>Share / export / email</button>
            <button className="btn" onClick={() => nav(`/game/${game.id}/edit`)}>Edit game details &amp; rules</button>
            <button className="btn" onClick={() => nav('/')}>All games</button>
          </div>
        </Sheet>
      )}
      {goalieSide && <GoalieSheet side={goalieSide} onClose={() => setGoalieSide(null)} />}
      {share && <ShareSheet game={game} events={events} onClose={() => setShare(false)} onPrint={() => { setTab('box'); }} />}
    </Ctx.Provider>
  );
}

let skew = 0;
export const setSkew = (n: number) => { skew = n; };
const serverSkew = () => skew;
