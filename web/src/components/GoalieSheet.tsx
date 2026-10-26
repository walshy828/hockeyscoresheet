import type { Side } from '../../../shared/src/types.ts';
import { fmtClock } from '../../../shared/src/derive.ts';
import { periodName } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { pLabel, sideName } from '../describe.ts';
import { PlayerChip, Sheet, sortPlayers } from './ui.tsx';

/** Who is in net for a side right now, as a short label. */
export function goalieLabel(game: Parameters<typeof pLabel>[0], g: string | null | undefined) {
  return g === null ? 'Empty net' : g ? pLabel(game, g, true) : 'No goalie';
}

/** Change the goalie in net / pull the goalie, with the log of changes. */
export function GoalieSheet({ side, onClose }: { side: Side; onClose: () => void }) {
  const { game, d, actions } = useGame();
  const cur = d.goalie[side];
  const roster = sortPlayers(game[side].players.filter((p) => !p.scratched));
  const goalies = roster.filter((p) => p.pos === 'G');
  const others = roster.filter((p) => p.pos !== 'G');
  const log = d.goalieLog.filter((c) => c.side === side);
  const pick = async (id: string | null) => { if (id !== cur) await actions.goalie(side, id); onClose(); };
  const chip = (p: (typeof roster)[number]) => <PlayerChip key={p.id} p={p} on={cur === p.id} onTap={() => void pick(p.id)} />;
  return (
    <Sheet title={`${sideName(game, side)} goalie`} onClose={onClose}>
      <div className="col">
        <div className="muted small">In net now: <b>{goalieLabel(game, cur)}</b></div>
        <div className="chips">{goalies.map(chip)}{!goalies.length && <span className="muted">No goalies on the roster — pick any player below.</span>}</div>
        <button className={`btn ${cur === null ? 'primary' : ''}`} style={{ minHeight: 52 }} onClick={() => void pick(null)}>🥅 Pull goalie (empty net)</button>
        {others.length > 0 && <details><summary className="muted small">Skater in goal</summary><div className="chips" style={{ marginTop: 8 }}>{others.map(chip)}</div></details>}
        <h3>Changes</h3>
        {log.length === 0 && <div className="muted small">No changes recorded yet.</div>}
        {log.map((c) => (
          <div className="logrow" key={c.ev.id}>
            <div className="when"><b>{fmtClock(c.ev.clock)}</b><span className="muted small">{periodName(c.ev.period, game.rules)}</span></div>
            <div className="grow">{c.player ? pLabel(game, c.player) : 'Goalie pulled'}</div>
          </div>
        ))}
        {d.goals.some((g) => g.d.team !== side && g.goalie !== undefined) && (
          <>
            <h3>Goals against</h3>
            {d.goals.filter((g) => g.d.team !== side).map((g) => (
              <div className="logrow" key={g.ev.id}>
                <div className="when"><b>{fmtClock(g.ev.clock)}</b><span className="muted small">{periodName(g.ev.period, game.rules)}</span></div>
                <div className="grow">{goalieLabel(game, g.goalie)}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </Sheet>
  );
}
