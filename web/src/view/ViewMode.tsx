import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { activePenalties, fmtToi } from '../../../shared/src/derive.ts';
import { useGame } from '../ctx.ts';
import { ClockDisplay } from '../components/Clock.tsx';
import { ShareSheet } from '../components/ShareSheet.tsx';
import { Sheet, TeamName } from '../components/ui.tsx';
import { sideName } from '../describe.ts';
import { teamVars, useIsDark, useLocalSetting } from '../theme.ts';
import { LogTab } from '../tabs/Log.tsx';
import { FocusCtx } from './parts.tsx';
import { useScoreGate } from './pin.tsx';
import { GameSection } from './GameSection.tsx';
import { ShotsSection } from './ShotsSection.tsx';
import { FaceoffSection } from './FaceoffSection.tsx';
import { IceSection } from './IceSection.tsx';
import { InsightsSection } from './InsightsSection.tsx';

type Section = 'game' | 'shots' | 'faceoffs' | 'ice' | 'insights' | 'log';
const SECTIONS: [Section, string, string][] = [
  ['game', '📊', 'Game'], ['shots', '🎯', 'Shots'], ['faceoffs', '⚪', 'Faceoffs'], ['ice', '⏱', 'Ice time'], ['insights', '💡', 'Insights'], ['log', '🧾', 'Log'],
];

interface Props {
  /** set on a coach's live link: connection state */
  live?: 'live' | 'reconnecting' | 'cached';
  /** flips an on-device game to scoring (a live-link viewer is sent to its local copy instead) */
  toggleMode?: () => void;
  onGames?: () => void;
  onEdit?: () => void;
  /** set on a locked (final) on-device game */
  onReopen?: () => Promise<void>;
}

/** Read-only game view, laid out like the landscape scorer: score and clock on top, then the stats sections. */
export function ViewMode({ live, toggleMode, onGames, onEdit, onReopen }: Props) {
  const { game, events, d } = useGame();
  const dark = useIsDark();
  const [section, setSection] = useState<Section>('game');
  const [focus, setFocus] = useLocalSetting<Side>(`focus:${game.id}`, 'home');
  const [share, setShare] = useState(false);
  const [menu, setMenu] = useState(false);
  const gate = useScoreGate(game, toggleMode);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [section]);

  const vars = teamVars(game.home.color, game.away.color, dark) as CSSProperties;
  const pens = activePenalties(d);
  const sog = (s: Side) => d.byPeriod.sog[s].reduce((a, b) => a + b, 0);
  const focusValue = useMemo(() => ({ focus, setFocus }), [focus, setFocus]);
  const num = (s: Side, id?: string) => '#' + (game[s].players.find((x) => x.id === id)?.number ?? '?');

  return (
    <FocusCtx.Provider value={focusValue}>
      <div className="ls vw" style={vars}>
        <header className="ls-top" style={onGames ? { paddingLeft: 60 } : undefined}>
          {onGames && <button className="ls-menu" aria-label="All games" onClick={onGames}>🏠</button>}
          <div className="ls-team home"><TeamName color={game.home.color}>{sideName(game, 'home')}</TeamName><small>SOG {sog('home')}</small></div>
          <div className="ls-score home">{d.score.home}</div>
          <ClockDisplay compact />
          <div className="ls-score away">{d.score.away}</div>
          <div className="ls-team away"><TeamName color={game.away.color}>{sideName(game, 'away')}</TeamName><small>SOG {sog('away')}</small></div>
          <div className="ls-util">
            {live && (
              <span className={`syncchip ${live === 'live' ? 'off' : 'pend'}`} style={live === 'live' ? { background: 'color-mix(in srgb, var(--bad) 18%, transparent)' } : undefined}>
                {live === 'live' ? <><span className="live-dot" />LIVE</> : live === 'cached' ? 'Offline' : 'Reconnecting…'}
              </span>
            )}
            <button className="btn sm icon" aria-label="Share and export" onClick={() => setShare(true)}>⤴</button>
            {(onGames || onEdit || onReopen) && <button className="btn sm icon" aria-label="Game menu" onClick={() => setMenu(true)}>⋯</button>}
            <div className="seg ls-mode" role="radiogroup" aria-label="Mode">
              <button role="radio" aria-checked="false" onClick={() => void gate.enter()}>Score</button>
              <button className="on" role="radio" aria-checked="true">View</button>
            </div>
          </div>
        </header>
        {pens.length > 0 && (
          <div className="pens ls-pens">
            {pens.map((p) => (
              <span key={p.ev.id} className={`pen ${p.d.team}`}>{p.d.player ? num(p.d.team, p.d.player) : sideName(game, p.d.team).slice(0, 4)} {p.d.minutes}′ {fmtToi(p.remaining)}</span>
            ))}
          </div>
        )}
        <nav className="vw-tabs" aria-label="Game sections">
          {SECTIONS.map(([k, ico, label]) => (
            <button key={k} className={section === k ? 'on' : ''} aria-current={section === k ? 'page' : undefined} onClick={() => setSection(k)}><span aria-hidden="true">{ico}</span> {label}</button>
          ))}
        </nav>
        <div className="vw-body" ref={body}>
          <div className="print-only"><h2>{sideName(game, 'away')} @ {sideName(game, 'home')} — {game.date.replace('T', ' ')} {game.venue}</h2></div>
          {section === 'game' && <GameSection />}
          {section === 'shots' && <ShotsSection />}
          {section === 'faceoffs' && <FaceoffSection />}
          {section === 'ice' && <IceSection />}
          {section === 'insights' && <InsightsSection />}
          {section === 'log' && <div className="vw-log"><LogTab /></div>}
        </div>
      </div>
      {menu && (
        <Sheet title="Game" onClose={() => setMenu(false)}>
          <div className="col">
            <button className="btn" onClick={() => { setMenu(false); setShare(true); }}>Share / export / email</button>
            {onReopen && <button className="btn" onClick={async () => { await onReopen(); setMenu(false); }}>Reopen game</button>}
            {onEdit && <button className="btn" onClick={onEdit}>Edit game details &amp; rules</button>}
            {onGames && <button className="btn" onClick={onGames}>All games</button>}
          </div>
        </Sheet>
      )}
      {share && <ShareSheet game={game} events={events} onClose={() => setShare(false)} onPrint={() => setSection('game')} />}
      {gate.sheet}
    </FocusCtx.Provider>
  );
}
