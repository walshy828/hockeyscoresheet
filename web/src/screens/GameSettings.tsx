import { useState } from 'react';
import { useGame } from '../ctx.ts';
import { useClock } from '../components/Clock.tsx';
import { VoiceNoteButton } from '../components/Voice.tsx';
import { Sheet, toast } from '../components/ui.tsx';
import { sideName } from '../describe.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { setScoreLayout, useScoreLayout } from '../layout.ts';
import { PLAYER_DISPLAY_OPTIONS, setPlayerDisplay, usePlayerDisplay } from '../playerDisplay.ts';
import { LinesTab } from '../tabs/Lines.tsx';

interface Props {
  onClose: () => void;
  onShare: () => void;
  onGames: () => void;
  onEdit: () => void;
  /** called after the game is ended, to drop into the read-only view */
  onEnded?: () => void;
}

/** Full-page game settings: everything that isn't a live scoring tap. */
export function GameSettings({ onClose, onShare, onGames, onEdit, onEnded }: Props) {
  const { game, actions, saveGame } = useGame();
  const c = useClock();
  const { landscape } = useScoreLayout();
  const [page, setPage] = useState<'main' | 'lines'>('main');
  const [note, setNote] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const display = usePlayerDisplay();
  const final = game.status === 'final';

  const end = async () => {
    await saveGame?.({ ...game, status: 'final' });
    toast('Game ended and locked');
    onEnded?.();
  };
  const tryEnd = () => (c.period < game.rules.periods ? setConfirmEnd(true) : void end());

  return (
    <div className="app">
      <main className="page">
        <div className="topbar">
          <button className="btn sm icon ghost" aria-label={page === 'lines' ? 'Back to game settings' : 'Back to scoring'} onClick={() => (page === 'lines' ? setPage('main') : onClose())}>‹</button>
          <h1>{page === 'lines' ? 'Lines' : 'Game settings'}</h1>
        </div>
        {page === 'lines' ? <LinesTab /> : (
          <div className="col">
            <div className="card col">
              <h3>Game</h3>
              <button className="btn" onClick={() => setPage('lines')}>👥 Lines &amp; on-ice</button>
              <button className="btn" onClick={onEdit}>Edit game details &amp; rules</button>
              <button className="btn" onClick={onShare}>Share / export / email</button>
              <button className="btn" onClick={onGames}>All games</button>
            </div>

            <div className="card col">
              <h3>During the game</h3>
              <div className="row">
                <button className="btn grow" onClick={() => void actions.timeout('home')}>Timeout {sideName(game, 'home')}</button>
                <button className="btn grow" onClick={() => void actions.timeout('away')}>Timeout {sideName(game, 'away')}</button>
              </div>
              <button className="btn" onClick={() => void actions.nextPeriod()}>Next period (after {periodName(c.period, game.rules)})</button>
              <div className="row"><VoiceNoteButton /></div>
              <label className="field"><span>Text note</span><textarea style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Goalie hurt, equipment issue, protest…" /></label>
              <button className="btn" disabled={!note.trim()} onClick={async () => { await actions.note(note.trim()); setNote(''); }}>Save note</button>
            </div>

            <div className="card col">
              <h3>Layout</h3>
              <button className="btn" onClick={() => { setScoreLayout(landscape ? 'classic' : 'landscape'); onClose(); }}>
                {landscape ? 'Switch to portrait (classic) layout' : '↔ Switch to landscape layout'}
              </button>
            </div>

            <div className="card col">
              <h3>Player labels</h3>
              <p className="muted small" style={{ margin: 0 }}>How players appear when adding shots, goals, penalties and faceoffs.</p>
              <div className="seg" role="radiogroup" aria-label="Player labels">
                {PLAYER_DISPLAY_OPTIONS.map((o) => (
                  <button key={o.value} role="radio" aria-checked={display === o.value} className={display === o.value ? 'on' : ''} onClick={() => setPlayerDisplay(o.value)}>
                    {o.label}<small style={{ display: 'block', opacity: .7 }}>{o.hint}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="card col">
              <h3>Game status</h3>
              {!final
                ? <button className="btn danger" onClick={tryEnd}>End game &amp; lock</button>
                : <button className="btn" onClick={async () => { await saveGame?.({ ...game, status: 'live' }); toast('Game reopened'); }}>Reopen game</button>}
              <p className="muted small" style={{ margin: 0 }}>Ending the game locks it and opens the stats and summary in View mode.</p>
            </div>
          </div>
        )}
      </main>
      {confirmEnd && (
        <Sheet title="End game?" onClose={() => setConfirmEnd(false)}>
          <div className="col">
            <p style={{ margin: 0 }}>It's only the {periodName(c.period, game.rules)} period. Ending now will lock the game as final.</p>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmEnd(false)}>Keep scoring</button>
              <button className="btn danger grow" onClick={() => { setConfirmEnd(false); void end(); }}>End game</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
