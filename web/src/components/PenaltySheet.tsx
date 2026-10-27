import { useState } from 'react';
import { fmtToi } from '../../../shared/src/derive.ts';
import { useGame } from '../ctx.ts';
import { describe, pLabel, sideName, timeLabel } from '../describe.ts';
import { Confirm, Sheet } from './ui.tsx';

/** A penalty on the board: details, with a confirm-first "remove from board" for the scorer. */
export function PenaltySheet({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  const { game, d, canEdit, actions } = useGame();
  const [confirm, setConfirm] = useState(false);
  const p = d.penalties.find((r) => r.ev.id === id);
  if (!p) return null;
  const x = p.d;
  const left = Math.max(0, p.end - d.nowElapsed);
  const who = x.player ? pLabel(game, x.player) : 'Player not set';

  if (confirm) {
    return (
      <Confirm
        title="Remove this penalty?"
        body={`${sideName(game, x.team)} ${x.label} (${who}) comes off the board and no longer counts as a power play. The penalty minutes stay in the stats; to delete the penalty completely, edit it from the feed.`}
        confirm="Remove penalty" danger
        onNo={() => setConfirm(false)}
        onYes={() => { void actions.endPenalty(id); onClose(); }}
      />
    );
  }
  const rows: [string, string][] = [
    ['Team', sideName(game, x.team)],
    ['Player', who],
    ['Infraction', `${x.label} · ${x.minutes} min`],
    ['Called', timeLabel(game, p.ev)],
    ['Time left', fmtToi(left)],
  ];
  if (x.servedBy) rows.push(['Served by', pLabel(game, x.servedBy)]);
  if (x.noPP) rows.push(['Power play', 'None (player serves alone)']);
  if (x.notes) rows.push(['Notes', x.notes]);
  return (
    <Sheet title={describe(game, p.ev).title} onClose={onClose}>
      <table className="t"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody></table>
      <div className="row" style={{ marginTop: 12 }}>
        {canEdit && <button className="btn danger grow" onClick={() => setConfirm(true)}>Remove penalty</button>}
        {canEdit && <button className="btn grow" onClick={onEdit}>Edit</button>}
        <button className="btn grow" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}
