import { useEffect, useState } from 'react';
import type { GameEvent, Side } from '../../../shared/src/types.ts';
import { dotById, nearestDot, rinkEnds } from '../../../shared/src/rink.ts';
import { useGame } from '../ctx.ts';
import { useMyTeamId } from '../teamsearch.ts';
import { PlayerChip, sortPlayers } from './ui.tsx';
import { Rink } from './Rink.tsx';
import { ClockDisplay } from './Clock.tsx';
import { faceoffSides, pLabel, sideName } from '../describe.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Full-screen faceoff: home players left, rink in the middle, away players right, winner buttons along the bottom.
 *  Pass `edit` to change a recorded faceoff instead (adds a two-tap Delete at the top right). */
export function FaceoffFlow({ init, edit, onClose }: { init?: { team: Side; player?: string; x?: number; y?: number }; edit?: GameEvent; onClose: () => void }) {
  const { game, d, actions } = useGame();
  const myId = useMyTeamId();
  const { leftTeam, leftLabel, rightLabel } = rinkEnds(game);
  // Offense/Defense are shown from our team's point of view (home if we can't tell which side is ours)
  const mine: Side = myId && game.away.teamId === myId && game.home.teamId !== myId ? 'away' : 'home';
  const [fo, setFo] = useState<{ home?: string; away?: string; dot?: string }>(() => {
    if (edit) { const f = faceoffSides(edit.data as any); return { home: f.home, away: f.away, dot: edit.data.dot }; }
    return {
      ...(init?.player ? { [init.team]: init.player } : {}),
      ...(init?.x !== undefined ? { dot: nearestDot(init.x, init.y!).id } : {}),
    };
  });
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDel]);
  const dot = dotById(fo.dot);
  const roster = (s: Side) => sortPlayers(game[s].players.filter((p) => !p.scratched)).sort((a, b) => Number(d.onIce[s].has(b.id)) - Number(d.onIce[s].has(a.id)));
  const pickP = (s: Side, id?: string) => setFo((f) => ({ ...f, [s]: id === undefined || f[s] === id ? undefined : id }));
  const num = (s: Side) => (fo[s] ? pLabel(game, fo[s]!, true) : 'unknown');
  const was = edit?.data.team as Side | undefined;
  const rec = async (w: Side) => {
    if (edit) {
      // null (not undefined) so the override survives JSON sync
      await actions.edit(edit.id, { team: w, player: fo[w] ?? null, loser: fo[other(w)] ?? null, dot: dot?.id ?? null, x: dot?.x ?? null, y: dot?.y ?? null });
    } else {
      await actions.faceoff({ team: w, player: fo[w], loser: fo[other(w)], dot: dot?.id, x: dot?.x, y: dot?.y });
    }
    onClose();
  };
  const del = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    await actions.voidEvent(edit!.id);
    onClose();
  };
  const col = (s: Side) => (
    <div className={`lf-who lf-fo-col ${s}`}>
      <div className="small"><i className={`dot ${s}`} style={{ display: 'inline-block', marginRight: 6 }} /><b>{sideName(game, s)}</b> <span className="muted">· {num(s)}</span></div>
      <div className="chips">
        <button className={`chip ${fo[s] === undefined ? 'on' : ''}`} onClick={() => pickP(s)}><span>?</span><small>unknown</small></button>
        {roster(s).map((p) => <PlayerChip key={p.id} p={p} ice={d.onIce[s].has(p.id)} on={fo[s] === p.id} onTap={() => pickP(s, p.id)} />)}
      </div>
    </div>
  );

  return (
    <div className="lf" role="dialog" aria-modal="true" aria-label={edit ? 'Edit faceoff' : 'Faceoff'}>
      <div className="lf-head">
        <button className="btn" onClick={onClose}>{edit ? 'Close' : 'Cancel'}</button>
        <b style={{ textAlign: 'center' }}>⚪ {edit ? 'Edit faceoff' : 'Faceoff'}</b>
        {edit ? <button className="btn danger" onClick={() => void del()}>{confirmDel ? 'Tap again' : 'Delete'}</button> : <span />}
      </div>
      <div className="lf-body lf-fo">
        {col('home')}
        <div className="lf-rink">
          <Rink vertical={false} maxVh={52} leftTeam={leftTeam} leftLabel={leftLabel} rightLabel={rightLabel} perspective={mine} dots={{ selected: fo.dot, onPick: (id) => setFo((f) => ({ ...f, dot: f.dot === id ? undefined : id })) }} />
          <div className="muted small">Faceoff dot: <b>{dot ? dot.label : 'not set'}</b>{dot ? <> · <button className="btn sm ghost" onClick={() => setFo((f) => ({ ...f, dot: undefined }))}>clear</button></> : ' — tap a dot (optional)'}</div>
        </div>
        {col('away')}
      </div>
      <div className="lf-foot">
        {!edit && <div className="lf-fo-clock"><ClockDisplay /></div>}
        <div className="lf-fo-win">
          {(['home', 'away'] as Side[]).map((s) => (
            <button key={s} className={`btn primary fo-win ${s}`} style={was === s ? { boxShadow: '0 0 0 3px var(--text) inset' } : undefined} onClick={() => void rec(s)}>
              {sideName(game, s)} won<small>{fo[s] ? num(s) : edit && was === s ? 'current' : ''}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
