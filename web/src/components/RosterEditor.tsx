import { useState } from 'react';
import type { Player } from '../../../shared/src/types.ts';
import { uid } from '../ids.ts';
import { parseRoster } from '../roster.ts';
import { Confirm, POS, Sheet } from './ui.tsx';

/** `perGame` adds a Playing checkbox per player (unchecked = scratched for this game only). */
export function RosterEditor({ players, onChange, perGame }: { players: Player[]; onChange: (p: Player[]) => void; perGame?: boolean }) {
  const [paste, setPaste] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Player | null>(null);
  const upd = (id: string, patch: Partial<Player>) => onChange(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const sorted = [...players].sort((a, b) => Number(a.number) - Number(b.number));
  const dup = new Set(players.map((p) => p.number).filter((n, i, a) => n && a.indexOf(n) !== i));

  return (
    <div className="col">
      {sorted.map((p) => (
        <div className="row" key={p.id} style={{ alignItems: 'stretch', opacity: p.scratched ? 0.5 : 1 }}>
          {perGame && <input type="checkbox" aria-label={`Playing: ${p.name || p.number}`} title="Playing in this game" style={{ width: 28, minHeight: 0, alignSelf: 'center' }} checked={!p.scratched} onChange={(e) => upd(p.id, { scratched: e.target.checked ? undefined : true })} />}
          <input aria-label="Number" inputMode="numeric" style={{ width: 64, textAlign: 'center', fontWeight: 800, borderColor: dup.has(p.number) ? 'var(--bad)' : undefined }} value={p.number} onChange={(e) => upd(p.id, { number: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          <input aria-label="Name" className="grow" placeholder="Name" value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} />
          <select aria-label="Position" style={{ width: 74 }} value={p.pos} onChange={(e) => upd(p.id, { pos: e.target.value as Player['pos'] })}>
            {POS.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select aria-label="Captain" style={{ width: 62 }} value={p.captain ?? ''} onChange={(e) => upd(p.id, { captain: (e.target.value || undefined) as Player['captain'] })}>
            <option value="">–</option><option value="C">C</option><option value="A">A</option>
          </select>
          <button className="btn icon danger" aria-label={`Remove ${p.name || p.number}`} onClick={() => setRemoving(p)}>✕</button>
        </div>
      ))}
      {dup.size > 0 && <div className="banner">Duplicate jersey numbers: {[...dup].join(', ')}</div>}
      <div className="row">
        <button className="btn grow" onClick={() => onChange([...players, { id: uid(), number: '', name: '', pos: 'F' }])}>＋ Add player</button>
        <button className="btn grow" onClick={() => setPaste('')}>Paste roster</button>
      </div>
      {removing && (
        <Confirm danger title="Remove player?" body={`Remove ${[removing.number && `#${removing.number}`, removing.name].filter(Boolean).join(' ') || 'this player'} from the roster?`} confirm="Remove"
          onNo={() => setRemoving(null)}
          onYes={() => { onChange(players.filter((x) => x.id !== removing.id)); setRemoving(null); }} />
      )}
      {paste !== null && (
        <Sheet title="Paste roster" onClose={() => setPaste(null)}>
          <p className="muted small">One player per line: number, name, position (C, LW, RW, D, G). Example: <code>12 Jane Smith C</code></p>
          <textarea autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'12 Jane Smith C\n9 Bob Lee D\n30 Sam Stone G'} />
          <button className="btn primary" style={{ width: '100%', marginTop: 10 }} onClick={() => { onChange([...players, ...parseRoster(paste)]); setPaste(null); }}>
            Add {parseRoster(paste).length} players
          </button>
        </Sheet>
      )}
    </div>
  );
}
