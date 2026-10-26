import { useState } from 'react';
import type { Game, Player, Side } from '../../../shared/src/types.ts';
import { fmtToi, other, strengthNow } from '../../../shared/src/derive.ts';
import {
  LINE_KINDS, LINE_LABEL, LINE_SIZE, emptyLines, isForward, isSkater, lineSetFor, planSwap, unitSize,
  type LineKind, type LineSet,
} from '../../../shared/src/lines.ts';
import { useGame } from '../ctx.ts';
import { ActionSheet, type ActionInit } from '../components/ActionSheet.tsx';
import { GoalieSheet, goalieLabel } from '../components/GoalieSheet.tsx';
import { RosterEditor } from '../components/RosterEditor.tsx';
import { PlayerChip, Sheet, sortPlayers, toast } from '../components/ui.tsx';
import { sideName } from '../describe.ts';

export function LinesTab() {
  const { game, d, actions, canEdit, saveGame } = useGame();
  const [side, setSide] = useState<Side>('home');
  const [menu, setMenu] = useState<{ p: Player; side: Side } | null>(null);
  const [sheet, setSheet] = useState<ActionInit | null>(null);
  const [edit, setEdit] = useState<Player[] | null>(null);
  const [replace, setReplace] = useState<Player | null>(null); // bench player waiting for a slot
  const [slotPick, setSlotPick] = useState(false); // tapped an empty on-ice slot
  const [goalie, setGoalie] = useState(false);
  const [editLines, setEditLines] = useState(false);
  if (!canEdit) return <div className="banner">View mode — see the Ice time tab for shifts.</div>;

  const roster = game[side].players;
  const posOf = (id: string) => roster.find((p) => p.id === id)?.pos;
  const players = sortPlayers(roster.filter((p) => !p.scratched));
  const skaters = players.filter((p) => p.pos !== 'G');
  const on = players.filter((p) => d.onIce[side].has(p.id));
  const onSk = on.filter((p) => p.pos !== 'G');
  const bench = skaters.filter((p) => !d.onIce[side].has(p.id));
  const max = game.rules.skatersOnIce;
  const lines = lineSetFor(game.lines, side, roster);

  const t = d.nowElapsed;
  const active = (s: Side) => d.penalties.filter((p) => p.d.team === s && p.start <= t && t < p.end).length;
  const menDown = active(side) - active(other(side));
  const strength = strengthNow(d, side);
  const hintKind: LineKind | null = strength === 'PP' ? 'PP' : strength === 'SH' ? 'PK' : null;

  const tapPlayer = async (p: Player) => {
    if (d.onIce[side].has(p.id)) { await actions.shift(side, p.id, 'off'); return; }
    if (p.pos === 'G' || onSk.length < max) { await actions.shift(side, p.id, 'on'); return; }
    setReplace(p); // full: choose who comes off, or add as extra man
  };

  const applyUnit = async (kind: LineKind, i: number) => {
    const ids = lines[kind][i].filter(Boolean);
    if (!ids.length) return;
    const target = kind === 'PK' || kind === 'PP' ? ids.slice(0, unitSize(kind, max, menDown)) : ids;
    const scope = kind === 'F' ? (id: string) => isForward(posOf(id)) : kind === 'D' ? (id: string) => posOf(id) === 'D' : (id: string) => isSkater(posOf(id));
    const { off, on: add } = planSwap(d.onIce[side], target, scope);
    if (!off.length && !add.length) { toast('Already on the ice'); return; }
    const after = onSk.length - off.filter((id) => posOf(id) !== 'G').length + add.length;
    if (after > max + 1) { toast(`That would put ${after} skaters on the ice`); return; }
    await actions.lineChange(side, off, add, `${kind}${i + 1} on`);
  };
  const unitOn = (kind: LineKind, i: number) => { const ids = lines[kind][i].filter(Boolean); return ids.length > 0 && ids.every((id) => d.onIce[side].has(id)); };
  const num = (id: string) => roster.find((p) => p.id === id)?.number ?? '?';

  const emptySlots = Math.max(0, max - onSk.length);
  const showExtra = onSk.length === max;

  return (
    <div className="col">
      <div className="seg">
        {(['home', 'away'] as Side[]).map((s) => <button key={s} className={`${s} ${side === s ? 'on' : ''}`} onClick={() => setSide(s)}>{sideName(game, s)} ({[...d.onIce[s]].filter((id) => game[s].players.find((p) => p.id === id)?.pos !== 'G').length} on)</button>)}
      </div>

      <div className="card col">
        <div className="row">
          <h3 className="grow">In net</h3>
          <button className="btn sm" onClick={() => setGoalie(true)}>{d.goalie[side] === undefined ? 'Set goalie' : 'Change'}</button>
        </div>
        <div className="row" style={{ fontWeight: 700 }}>
          <span>🥅 {goalieLabel(game, d.goalie[side])}</span>
          {d.goalie[side] && <span className="muted small">{game[side].players.find((p) => p.id === d.goalie[side])?.name}</span>}
          {d.goalie[side] === null && <button className="btn sm" onClick={() => setGoalie(true)}>Put goalie back</button>}
        </div>
      </div>

      <div className="card col">
        <div className="row">
          <h3 className="grow">On ice · {onSk.length}{onSk.length > max ? ' (extra attacker)' : ''} {strength !== 'EV' && <span className="muted small">{strength}{menDown > 1 ? ` · ${menDown} men down` : ''}</span>}</h3>
          <button className="btn sm" onClick={() => void actions.allOff(side)} disabled={!on.length}>All off</button>
        </div>
        <div className="slots">
          {onSk.map((p, i) => <PlayerChip key={p.id} p={p} ice badge={p.captain} sub={fmtToi(d.players.get(p.id)?.toi ?? 0)} extra={i >= max} onTap={() => void tapPlayer(p)} onLong={() => setMenu({ p, side })} />)}
          {Array.from({ length: emptySlots }, (_, i) => <button key={`e${i}`} className="slot" aria-label="Add player" onClick={() => setSlotPick(true)}>＋</button>)}
          {showExtra && <button className="slot extra" aria-label="Add extra skater" onClick={() => setSlotPick(true)}>＋<small>extra</small></button>}
        </div>
        <div className="col" style={{ gap: 6 }}>
          {LINE_KINDS.map((k) => {
            const shown = lines[k].map((l, i) => [l, i] as const).filter(([l]) => l.some(Boolean));
            if (!shown.length) return null;
            return (
              <div className="unitrow" key={k}>
                <span className="lbl">{k}</span>
                {shown.map(([l, i]) => (
                  <button key={i} className={`unit ${unitOn(k, i) ? 'on' : ''} ${hintKind === k ? 'hint' : ''}`} onClick={() => void applyUnit(k, i)}>
                    {k}{i + 1}<small>{l.filter(Boolean).map(num).join('·')}</small>
                  </button>
                ))}
              </div>
            );
          })}
          <button className="btn sm ghost" onClick={() => setEditLines(true)}>✎ Set lines (F · D · PP · PK)</button>
        </div>
        {!onSk.length && <span className="muted small">Tap a line above, or bench players below. Time on ice starts with the game clock.</span>}
      </div>

      <div className="card col">
        <h3>Bench</h3>
        <div className="chips">
          {bench.map((p) => <PlayerChip key={p.id} p={p} badge={p.captain} sub={fmtToi(d.players.get(p.id)?.toi ?? 0)} onTap={() => void tapPlayer(p)} onLong={() => setMenu({ p, side })} />)}
          {!players.length && <span className="muted">No roster yet.</span>}
        </div>
      </div>
      {game[side].players.some((p) => p.scratched) && (
        <div className="card col"><h3>Scratched</h3>
          <div className="chips">{game[side].players.filter((p) => p.scratched).map((p) => (
            <button key={p.id} className="btn sm" onClick={() => void saveGame?.({ ...game, [side]: { ...game[side], players: game[side].players.map((x) => (x.id === p.id ? { ...x, scratched: false } : x)) } })}>#{p.number} {p.name} ↩</button>
          ))}</div></div>
      )}
      <div className="muted small">Tap = on/off ice · With {max} on, tap a bench player then choose who comes off (or add an extra man) · Long-press a player for goal, shot, penalty, faceoff.</div>
      <button className="btn" onClick={() => setEdit(game[side].players)}>Edit {sideName(game, side)} roster</button>

      {replace && (
        <Sheet title={`#${replace.number} ${replace.name} on — who comes off?`} onClose={() => setReplace(null)}>
          <div className="col">
            {onSk.length <= max && (
              <button className={`btn ${d.goalie[side] === null ? 'primary' : ''}`} style={{ minHeight: 56 }}
                onClick={async () => { await actions.shift(side, replace.id, 'on'); setReplace(null); }}>
                ➕ Add as extra man ({onSk.length + 1} skaters){d.goalie[side] === null ? ' · net is empty' : ''}
              </button>
            )}
            <div className="muted small">Or tap the player who comes off:</div>
            <div className="chips">
              {onSk.map((p) => <PlayerChip key={p.id} p={p} ice badge={p.captain} sub={fmtToi(d.players.get(p.id)?.toi ?? 0)}
                onTap={async () => { await actions.lineChange(side, [p.id], [replace.id]); setReplace(null); }} />)}
            </div>
          </div>
        </Sheet>
      )}
      {slotPick && (
        <Sheet title={onSk.length >= max ? 'Add extra man' : 'Add to ice'} onClose={() => setSlotPick(false)}>
          <div className="chips">
            {bench.map((p) => <PlayerChip key={p.id} p={p} badge={p.captain} sub={p.pos} onTap={async () => { await actions.shift(side, p.id, 'on'); setSlotPick(false); }} />)}
            {!bench.length && <span className="muted">Everyone is already on the ice.</span>}
          </div>
        </Sheet>
      )}
      {goalie && <GoalieSheet side={side} onClose={() => setGoalie(false)} />}
      {editLines && <LinesEditor side={side} onClose={() => setEditLines(false)} />}

      {menu && (
        <Sheet title={`#${menu.p.number} ${menu.p.name}`} onClose={() => setMenu(null)}>
          <div className="col">
            {(['goal', 'shot', 'penalty', 'faceoff'] as const).map((k) => (
              <button key={k} className="btn" style={{ minHeight: 56 }} onClick={() => { setSheet({ kind: k, team: menu.side, player: menu.p.id }); setMenu(null); }}>
                {{ goal: '🚨 Goal', shot: '🏒 Shot', penalty: '🟨 Penalty', faceoff: '⚪ Won faceoff' }[k]}
              </button>
            ))}
            <button className="btn" onClick={async () => { await saveGame?.({ ...game, [menu.side]: { ...game[menu.side], players: game[menu.side].players.map((p) => (p.id === menu.p.id ? { ...p, scratched: !p.scratched } : p)) } }); setMenu(null); }}>
              {menu.p.scratched ? 'Un-scratch' : 'Scratch (not dressed)'}
            </button>
          </div>
        </Sheet>
      )}
      {sheet && <ActionSheet init={sheet} onClose={() => setSheet(null)} />}
      {edit && (
        <Sheet title={`${sideName(game, side)} roster`} onClose={() => setEdit(null)}>
          <RosterEditor players={edit} onChange={setEdit} />
          <button className="btn primary" style={{ width: '100%', marginTop: 12 }} onClick={async () => { await saveGame?.({ ...game, [side]: { ...game[side], players: edit } }); setEdit(null); }}>Save roster</button>
        </Sheet>
      )}
    </div>
  );
}

/** Set the saved forward / defense / PP / PK combinations for a side. Changes save immediately. */
function LinesEditor({ side, onClose }: { side: Side; onClose: () => void }) {
  const { game, saveGame } = useGame();
  const [slot, setSlot] = useState<{ kind: LineKind; li: number; si: number } | null>(null);
  const roster = game[side].players;
  const eligible = sortPlayers(roster.filter((p) => !p.scratched && p.pos !== 'G'));
  const set = lineSetFor(game.lines, side, roster);

  const save = async (next: LineSet) => {
    const all = game.lines ?? emptyLines();
    await saveGame?.({ ...game, lines: { ...all, [side]: next } } as Game);
  };
  const pad = (l: string[], n: number) => Array.from({ length: n }, (_, i) => l[i] ?? '');
  const assign = async (kind: LineKind, li: number, si: number, id: string) => {
    const lns = set[kind].map((l) => [...l]);
    const row = pad(lns[li], LINE_SIZE[kind]).map((x) => (id && x === id ? '' : x));
    row[si] = id;
    lns[li] = row;
    await save({ ...set, [kind]: lns });
    setSlot(null);
  };
  const addLine = (kind: LineKind) => save({ ...set, [kind]: [...set[kind], []] });
  const removeLine = (kind: LineKind, li: number) => save({ ...set, [kind]: set[kind].filter((_, i) => i !== li) });

  if (slot) {
    const row = pad(set[slot.kind][slot.li], LINE_SIZE[slot.kind]);
    const pref = slot.kind === 'D' ? (p: Player) => (p.pos === 'D' ? 0 : 1) : slot.kind === 'F' ? (p: Player) => (p.pos === 'D' ? 1 : 0) : () => 0;
    const list = [...eligible].sort((a, b) => pref(a) - pref(b));
    return (
      <Sheet title={`${slot.kind}${slot.li + 1} · spot ${slot.si + 1}`} onClose={() => setSlot(null)}>
        <div className="col">
          <div className="chips">
            {list.map((p) => <PlayerChip key={p.id} p={p} on={row.includes(p.id)} badge={p.captain} sub={p.pos} onTap={() => void assign(slot.kind, slot.li, slot.si, p.id)} />)}
          </div>
          <div className="row">
            <button className="btn grow" onClick={() => setSlot(null)}>Back</button>
            <button className="btn grow" onClick={() => void assign(slot.kind, slot.li, slot.si, '')}>Clear spot</button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={`${sideName(game, side)} lines`} onClose={onClose}>
      <div className="col">
        {LINE_KINDS.map((k) => (
          <div className="col" key={k} style={{ gap: 8 }}>
            <h3>{LINE_LABEL[k]} <span className="muted small">{LINE_SIZE[k]} players{k === 'PK' ? ' (3 if two men down)' : ''}</span></h3>
            {set[k].map((l, li) => (
              <div className="row" key={li}>
                <b style={{ width: 36 }}>{k}{li + 1}</b>
                <div className="slots grow">
                  {pad(l, LINE_SIZE[k]).map((id, si) => {
                    const p = roster.find((x) => x.id === id);
                    return p
                      ? <PlayerChip key={si} p={p} on badge={p.captain} sub={p.pos} onTap={() => setSlot({ kind: k, li, si })} />
                      : <button key={si} className="slot" aria-label={`${k}${li + 1} spot ${si + 1}`} onClick={() => setSlot({ kind: k, li, si })}>＋</button>;
                  })}
                </div>
                <button className="btn sm icon ghost" aria-label={`Remove ${k}${li + 1}`} onClick={() => void removeLine(k, li)}>✕</button>
              </div>
            ))}
            <button className="btn sm" onClick={() => void addLine(k)}>＋ Add {k} line</button>
          </div>
        ))}
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}
