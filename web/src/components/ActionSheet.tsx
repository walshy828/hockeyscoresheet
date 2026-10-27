import { useState } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { strengthNow } from '../../../shared/src/derive.ts';
import { penaltyTypes } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { STRENGTH_INFO, dotById, nearestDot } from '../../../shared/src/rink.ts';
import { PlayerChip, Sheet, sortPlayers, useLongPress } from './ui.tsx';
import { InfractionPicker } from './InfractionPicker.tsx';
import { Rink } from './Rink.tsx';
import { pLabel, sideName } from '../describe.ts';

export type ActionKind = 'shot' | 'goal' | 'faceoff' | 'penalty';
export interface ActionInit { kind: ActionKind; team: Side; x?: number; y?: number; player?: string }

const STRENGTHS = ['EV', 'PP', 'SH', 'EN', 'PS'] as const;

function StrengthBtn({ s, on, auto, onPick, onHint }: { s: (typeof STRENGTHS)[number]; on: boolean; auto: boolean; onPick: () => void; onHint: () => void }) {
  const h = useLongPress(onPick, onHint);
  return <button className={on ? 'on' : ''} title={STRENGTH_INFO[s]} aria-label={`${s}: ${STRENGTH_INFO[s]}`} onMouseEnter={onHint} {...h}>{s}{auto ? ' •' : ''}</button>;
}

export function ActionSheet({ init, onClose }: { init: ActionInit; onClose: () => void }) {
  const { game, d, actions } = useGame();
  const [kind, setKind] = useState<ActionKind>(init.kind);
  const [team, setTeam] = useState<Side>(init.team);
  const [pick, setPick] = useState<string[]>(init.player ? [init.player] : []); // shot: [shooter]; goal: [scorer,a1,a2]; faceoff: [winner, loser]; penalty: [player]
  const [strength, setStrength] = useState<(typeof STRENGTHS)[number] | null>(null);
  const [pen, setPen] = useState<{ code: string; label: string; minutes: number } | null>(null);
  const [mins, setMins] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // faceoff: players taking the draw (either may be unknown) + dot
  const [fo, setFo] = useState<{ home?: string; away?: string; dot?: string }>(() => ({
    ...(init.kind === 'faceoff' && init.player ? { [init.team]: init.player } : {}),
    ...(init.x !== undefined ? { dot: nearestDot(init.x, init.y!).id } : {}),
  }));
  const hasLoc = init.x !== undefined;
  
  const switchTeam = (t: Side) => { if (t !== team) { setTeam(t); setPick([]); } };
  const roster = (s: Side) => sortPlayers(game[s].players.filter((p) => !p.scratched)).sort((a, b) => Number(d.onIce[s].has(b.id)) - Number(d.onIce[s].has(a.id)));
  const toggle = (id: string, max: number) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));
  const autoStrength = strengthNow(d, team);
  const str = strength ?? autoStrength;
  const done = async (fn: () => Promise<void>) => { await fn(); onClose(); };
  const loc = hasLoc ? { x: init.x, y: init.y } : {};

  const chips = (s: Side, max: number, ids = pick, labels?: Record<string, string>) => (
    <div className="chips">
      {roster(s).map((p) => (
        <PlayerChip key={p.id} p={p} ice={d.onIce[s].has(p.id)} on={ids.includes(p.id)} badge={labels?.[p.id]} onTap={() => toggle(p.id, max)} />
      ))}
      {game[s].players.length === 0 && <span className="muted">No roster — you can still record without a player.</span>}
    </div>
  );

  const tabs: ActionKind[] = ['shot', 'goal', 'faceoff', 'penalty'];
  const title = { shot: 'Shot', goal: 'Goal', faceoff: 'Faceoff won by', penalty: 'Penalty' }[kind];

  return (
    <Sheet onClose={onClose}>
      <div className="col">
        <div className="seg">
          {tabs.map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setPick([]); }}>{k === 'faceoff' ? 'Faceoff' : k[0].toUpperCase() + k.slice(1)}</button>)}
        </div>
        {kind !== 'faceoff' && <div className="seg" role="radiogroup" aria-label="Team">
          {(['home', 'away'] as Side[]).map((s) => <button key={s} className={`${s} ${team === s ? 'on' : ''}`} onClick={() => switchTeam(s)}>{sideName(game, s)}</button>)}
        </div>}

        {kind === 'shot' && (<>
          <div className="muted small">{hasLoc ? 'Shot from the marked spot. ' : ''}Tap the shooter (optional), then the result.</div>
          {chips(team, 1)}
          <div className="row">
            <button className="btn primary grow" style={{ minHeight: 60 }} onClick={() => done(() => actions.shot({ team, player: pick[0], result: 'save', ...loc }))}>On goal</button>
            <button className="btn grow" style={{ minHeight: 60 }} onClick={() => done(() => actions.shot({ team, player: pick[0], result: 'miss', ...loc }))}>Missed</button>
            <button className="btn grow" style={{ minHeight: 60 }} onClick={() => done(() => actions.shot({ team, player: pick[0], result: 'block', ...loc }))}>Blocked</button>
          </div>
        </>)}

        {kind === 'goal' && (<>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {['Scorer', 'Assist', 'Assist'].map((l, i) => (
              <div key={i} className="card grow" style={{ padding: 8, textAlign: 'center' }}>
                <div className="muted small">{l}</div>
                <b style={{ fontSize: 20 }}>{pick[i] ? pLabel(game, pick[i], true) : pick.length === i ? '▸' : '–'}</b>
              </div>
            ))}
          </div>
          <div className="muted small">Tap in order: scorer, then up to two assists. Tap again to remove.</div>
          {chips(team, 3, pick, Object.fromEntries(pick.map((id, i) => [id, ['G', 'A', 'A'][i]])))}
          <div className="seg" aria-label="Strength">
            {STRENGTHS.map((s) => <StrengthBtn key={s} s={s} on={str === s} auto={s === autoStrength && strength === null} onPick={() => { setStrength(s); setHint(`${s} — ${STRENGTH_INFO[s]}`); }} onHint={() => setHint(`${s} — ${STRENGTH_INFO[s]}`)} />)}
          </div>
          <div className="muted small" aria-live="polite">{hint ?? 'Hover or press-and-hold a code to see what it means. • = suggested from penalties.'}</div>
          <button className="btn primary" style={{ minHeight: 60, fontSize: 18 }} onClick={() => done(() => actions.goal({ team, scorer: pick[0], assists: pick.slice(1), strength: str, ...loc }))}>🚨 Goal {sideName(game, team)}</button>
        </>)}

        {kind === 'faceoff' && (() => {
          const pickP = (side: Side, id: string) => setFo((f) => ({ ...f, [side]: f[side] === id ? undefined : id }));
          const dot = dotById(fo.dot);
          const num = (side: Side) => (fo[side] ? pLabel(game, fo[side], true) : 'unknown');
          const rec = (w: Side) => done(() => actions.faceoff({
            team: w, player: fo[w], loser: fo[w === 'home' ? 'away' : 'home'], dot: dot?.id, x: dot?.x, y: dot?.y,
          }));
          return (<>
            <div className="muted small">Who is taking the draw? Pick a player from each team (optional — leave blank for unknown), tap the dot, then who won.</div>
            {(['home', 'away'] as Side[]).map((s) => (
              <div key={s} className="col" style={{ gap: 6 }}>
                <div className="small"><span className={`dot ${s}`} style={{ display: 'inline-block', marginRight: 6 }} /><b>{sideName(game, s)}</b> <span className="muted">· {num(s)}</span></div>
                <div className="chips">
                  {roster(s).map((p) => <PlayerChip key={p.id} p={p} ice={d.onIce[s].has(p.id)} on={fo[s] === p.id} onTap={() => pickP(s, p.id)} />)}
                  {game[s].players.length === 0 && <span className="muted">No roster — unknown player.</span>}
                </div>
              </div>
            ))}
            <div className="muted small">Faceoff dot: <b>{dot ? dot.label : 'not set'}</b>{dot && <> · <button className="btn sm ghost" onClick={() => setFo((f) => ({ ...f, dot: undefined }))}>clear</button></>}</div>
            <Rink vertical={false} maxVh={30} dots={{ selected: fo.dot, onPick: (id) => setFo((f) => ({ ...f, dot: f.dot === id ? undefined : id })) }} />
            <div className="muted small">Who won?</div>
            <div className="row">
              {(['home', 'away'] as Side[]).map((s) => (
                <button key={s} className={`btn primary grow fo-win ${s}`} style={{ minHeight: 64 }} onClick={() => rec(s)}>
                  {sideName(game, s)} won<small>{fo[s] ? num(s) : ''}</small>
                </button>
              ))}
            </div>
          </>);
        })()}

        {kind === 'penalty' && (<>
          <div className="muted small">Player (optional)</div>
          {chips(team, 1)}
          <InfractionPicker types={penaltyTypes(game.rules)} selected={pen?.code} onPick={(t) => { setPen(t); setMins(t.minutes); }} />
          <div className="seg" aria-label="Minutes">
            {[2, 4, 5, 10].map((m) => <button key={m} className={(mins ?? pen?.minutes) === m ? 'on' : ''} onClick={() => setMins(m)}>{m} min</button>)}
          </div>
          <button className="btn primary" style={{ minHeight: 60 }} disabled={!pen} onClick={() => done(() => actions.penalty({ team, player: pick[0], code: pen!.code, label: pen!.label, minutes: mins ?? pen!.minutes }))}>
            {pen ? `Add ${mins ?? pen.minutes}-min ${pen.label}` : 'Pick an infraction'}
          </button>
        </>)}
        <span className="sr-only" aria-live="polite">{title}</span>
      </div>
    </Sheet>
  );
}
