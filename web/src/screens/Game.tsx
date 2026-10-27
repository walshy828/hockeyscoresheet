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
import { useNow } from '../components/ui.tsx';
import { pLabel, sideName } from '../describe.ts';
import { ScoreTab } from '../tabs/Score.tsx';
import { ViewMode } from '../view/ViewMode.tsx';
import { LandscapeScore } from '../tabs/Landscape.tsx';
import { useScoreLayout } from '../layout.ts';
import { GameSettings } from './GameSettings.tsx';
import { GoalieSheet, goalieLabel } from '../components/GoalieSheet.tsx';

export function LocalGame() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const game = useLiveQuery(() => db.games.get(id!), [id]);
  const events = useLiveQuery(() => db.events.where('gameId').equals(id!).toArray(), [id]);
  useEffect(() => { setActiveGame(id); return () => setActiveGame(undefined); }, [id]);
  if (!game || !events) return <div className="page muted">Loading game…</div>;
  const canEdit = sp.get('mode') !== 'view' && game.status !== 'final';
  return (
    <GameScreen
      game={game} events={events} canEdit={canEdit} anchor="wall"
      saveGame={async (g) => { await saveGame(g); }}
      toggleMode={() => setSp(canEdit ? { mode: 'view' } : {}, { replace: true })}
      reopen={async () => { await saveGame({ ...game, status: 'live' }); }}
    />
  );
}

interface Props {
  game: Game; events: GameEvent[]; canEdit: boolean; anchor: 'wall' | 'recv';
  saveGame?: (g: Game) => Promise<void>;
  toggleMode?: () => void;
  reopen?: () => Promise<void>;
  live?: 'live' | 'reconnecting' | 'cached';
}

export function GameScreen({ game, events, canEdit, anchor, saveGame, toggleMode, reopen, live }: Props) {
  const nav = useNavigate();
  const now = useNow(1000);
  const d = useMemo(() => derive(events, game, anchor === 'recv' ? now + serverSkew() : now, anchor), [events, game, now, anchor]);
  const actions = useActions(game, events, d);
  const [settings, setSettings] = useState(false);
  const [share, setShare] = useState(false);
  const [goalieSide, setGoalieSide] = useState<'home' | 'away' | null>(null);
  const st = useSyncStatus();
  const { landscape } = useScoreLayout();
  useEffect(() => { setSettings(false); }, [canEdit]);
  useEffect(() => { document.title = `${sideName(game, 'away')} @ ${sideName(game, 'home')}`; return () => { document.title = 'Hockey Scoresheet'; }; }, [game]);

  const pens = activePenalties(d);
  const sog = (s: 'home' | 'away') => d.byPeriod.sog[s].reduce((a, b) => a + b, 0);

  const goalieCell = (s: 'home' | 'away') => {
    const g = d.goalie[s];
    const txt = <>🥅 {goalieLabel(game, g)}</>;
    const cls = `sub goalie ${g === null ? 'empty' : ''}`;
    return canEdit
      ? <button className={`${cls} tap`} aria-label={`${sideName(game, s)} goalie`} onClick={() => setGoalieSide(s)}>{txt}</button>
      : <div className={cls}>{txt}</div>;
  };

  const wide = landscape;

  return (
    <Ctx.Provider value={{ game, events, d, canEdit, actions, now, anchor, saveGame }}>
      {!canEdit && (
        <ViewMode
          live={live}
          toggleMode={toggleMode}
          onGames={live === undefined ? () => nav('/') : undefined}
          onEdit={live === undefined ? () => nav(`/game/${game.id}/edit`) : undefined}
          onReopen={game.status === 'final' ? reopen : undefined}
        />
      )}
      {canEdit && !settings && wide && (
        <LandscapeScore
          onSettings={() => setSettings(true)}
          onHome={() => nav('/')}
          onShare={() => setShare(true)}
          toggleMode={toggleMode}
        />
      )}
      {canEdit && !settings && !wide && <div className="app">
        <header className="ghead">
          <div className="row" style={{ marginBottom: 4 }}>
            <button className="btn sm icon ghost" aria-label="Back to games" onClick={() => nav('/')}>‹</button>
            <span className={`syncchip ${!st.online ? 'off' : st.pending ? 'pend' : 'ok'}`}>
              {!st.online ? `Offline · ${st.pending} saved locally` : st.pending ? `⟳ ${st.pending} syncing` : '✓ Synced'}
            </span>
            <span className={`badge ${game.status}`}>{game.status}</span>
            <span className="grow" />
            {toggleMode && (
              <div className="seg" style={{ width: 150 }}>
                <button className="on">Score</button>
                <button onClick={toggleMode}>View</button>
              </div>
            )}
            <ScratchButton />
            <button className="btn sm icon" aria-label="Share and export" onClick={() => setShare(true)}>⤴</button>
            <button className="btn sm icon" aria-label="Game settings" onClick={() => setSettings(true)}>⚙</button>
          </div>
          <div className="teams">
            <div className="team-cell home"><div className="nm" style={{ color: game.home.color }}>{sideName(game, 'home')}</div><div className="sc">{d.score.home}</div><div className="sub">SOG {sog('home')}</div>{goalieCell('home')}</div>
            <ClockDisplay />
            <div className="team-cell away"><div className="nm" style={{ color: game.away.color }}>{sideName(game, 'away')}</div><div className="sc">{d.score.away}</div><div className="sub">SOG {sog('away')}</div>{goalieCell('away')}</div>
          </div>
          {pens.length > 0 && (
            <div className="pens">
              {pens.map((p) => <span key={p.ev.id} className={`pen ${p.d.team}`}>{p.d.player ? pLabel(game, p.d.player, true) : sideName(game, p.d.team).slice(0, 4)} {p.d.minutes}′ {fmtToi(p.remaining)}</span>)}
            </div>
          )}
        </header>
        <main className="page" style={{ paddingTop: 12 }}>
          <div className="print-only"><h2>{sideName(game, 'away')} @ {sideName(game, 'home')} — {game.date.replace('T', ' ')} {game.venue}</h2></div>
          <ScoreTab />
        </main>
        <nav className="nav" aria-label="Game sections">
          <button className="active"><span className="ico">🏒</span>Score</button>
          <button onClick={() => setSettings(true)}><span className="ico">⚙</span>Game settings</button>
        </nav>
      </div>}
      {canEdit && settings && (
        <GameSettings
          onClose={() => setSettings(false)}
          onShare={() => setShare(true)}
          onGames={() => nav('/')}
          onEdit={() => nav(`/game/${game.id}/edit`)}
          onEnded={toggleMode}
        />
      )}
      {goalieSide && <GoalieSheet side={goalieSide} onClose={() => setGoalieSide(null)} />}
      {share && <ShareSheet game={game} events={events} onClose={() => setShare(false)} onPrint={toggleMode} />}
    </Ctx.Provider>
  );
}

let skew = 0;
export const setSkew = (n: number) => { skew = n; };
const serverSkew = () => skew;
