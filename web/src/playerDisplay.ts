import { useSyncExternalStore } from 'react';
import type { Player } from '../../shared/src/types.ts';

/** How players are labelled in scoring flows (shots, penalties, faceoffs, chips). */
export type PlayerDisplay = 'number' | 'name' | 'both';
const KEY = 'hs:playerDisplay';
const EVT = 'hs:playerDisplay-change';

export const PLAYER_DISPLAY_OPTIONS: { value: PlayerDisplay; label: string; hint: string }[] = [
  { value: 'number', label: 'Number', hint: '#12' },
  { value: 'name', label: 'Last name', hint: 'Smith' },
  { value: 'both', label: 'Number + name', hint: '#12 Smith' },
];

export const getPlayerDisplay = (): PlayerDisplay => {
  try { const v = localStorage.getItem(KEY); return v === 'name' || v === 'both' ? v : 'number'; } catch { return 'number'; }
};
export const setPlayerDisplay = (v: PlayerDisplay) => {
  try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVT));
};
const sub = (f: () => void) => { window.addEventListener(EVT, f); return () => window.removeEventListener(EVT, f); };
export const usePlayerDisplay = () => useSyncExternalStore(sub, getPlayerDisplay);

export const lastName = (p: Pick<Player, 'name'>) => p.name.trim().split(/\s+/).slice(-1)[0] ?? '';

/** Short label for a player under the chosen display mode; falls back to the number when there is no name. */
export function shortLabel(p: Pick<Player, 'number' | 'name'>, mode: PlayerDisplay = getPlayerDisplay()): string {
  const last = lastName(p);
  if (mode === 'name') return last || `#${p.number}`;
  if (mode === 'both') return `#${p.number}${last ? ' ' + last : ''}`;
  return `#${p.number}`;
}
