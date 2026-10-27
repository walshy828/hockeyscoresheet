import { useState } from 'react';
import type { PenaltyType } from '../../../shared/src/types.ts';

/** Searchable list of infractions: type to filter by name or code, tap to pick. */
export function InfractionPicker({ types, selected, onPick, mark }: {
  types: PenaltyType[]; selected?: string; onPick: (t: PenaltyType) => void; mark?: boolean;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle ? types.filter((t) => t.label.toLowerCase().includes(needle) || t.code.toLowerCase().includes(needle)) : types;
  return (
    <>
      <input type="search" className="lf-note" style={{ minHeight: 44 }} placeholder="Search infractions…" aria-label="Search infractions" value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && shown.length === 1) { e.preventDefault(); onPick(shown[0]); } }} />
      <div className="chips">
        {shown.map((t) => <button key={t.code} className={`btn sm ${selected === t.code ? 'primary' : ''}`} onClick={() => onPick(t)}>{t.label}{mark && t.gm ? ' *' : ''}</button>)}
        {shown.length === 0 && <span className="muted small">No infraction matches “{q}”.</span>}
      </div>
    </>
  );
}
