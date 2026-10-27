import { useState } from 'react';
import { useGame } from '../ctx.ts';
import { Sheet } from './ui.tsx';
import { FaceoffFlow } from './FaceoffFlow.tsx';
import { dotById } from '../../../shared/src/rink.ts';
import { describe, pLabel, sideName, timeLabel } from '../describe.ts';

/** Compact summary shown in the rink's tooltip bubble. */
export function MarkerTip({ id }: { id: string }) {
  const { game, d } = useGame();
  const e = d.events.find((x) => x.id === id);
  if (!e) return null;
  const x = describe(game, e);
  return <><b>{x.title}</b>{x.sub && <span>{x.sub}</span>}<small>{timeLabel(game, e)}</small></>;
}

/** Details for one rink marker (goal / shot / faceoff), looked up by event id. */
export function MarkerInfo({ id, onClose }: { id: string; onClose: () => void }) {
  const { game, d, canEdit } = useGame();
  const [editing, setEditing] = useState(false);
  const e = d.events.find((x) => x.id === id);
  if (!e) return null;
  const x = e.data;
  const rows: [string, string][] = [['When', timeLabel(game, e)]];
  const add = (k: string, v?: string | null) => { if (v) rows.push([k, v]); };
  if (e.type === 'goal') {
    add('Team', sideName(game, x.team));
    add('Scorer', x.scorer ? pLabel(game, x.scorer) : 'Not set');
    const a = (x.assists ?? []).filter(Boolean).map((p: string) => pLabel(game, p));
    add('Assists', a.length ? a.join(', ') : 'Unassisted');
    add('Strength', x.strength);
  } else if (e.type === 'shot') {
    add('Team', sideName(game, x.team));
    add('Result', x.result === 'save' ? 'On goal (saved)' : x.result === 'miss' ? 'Missed the net' : 'Blocked');
    add('Shooter', x.player ? pLabel(game, x.player) : 'Not set');
    if (x.result === 'block') add('Blocked by', x.blocker ? pLabel(game, x.blocker) : 'Not set');
    add('Strength', x.strength);
  } else if (e.type === 'faceoff') {
    add('Won by', `${sideName(game, x.team)}${x.player ? ' ' + pLabel(game, x.player) : ''}`);
    add('Lost by', x.loser ? pLabel(game, x.loser) : undefined);
    add('Dot', dotById(x.dot)?.label);
  }
  if (editing) return <FaceoffFlow edit={e} onClose={onClose} />;
  return (
    <Sheet title={describe(game, e).title} onClose={onClose}>
      <table className="t"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody></table>
      <div className="row" style={{ marginTop: 12 }}>
        {canEdit && e.type === 'faceoff' && <button className="btn grow" onClick={() => setEditing(true)}>Edit</button>}
        <button className="btn grow" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}
