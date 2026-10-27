import { useSyncExternalStore } from 'react';

export type ScoreLayout = 'auto' | 'landscape' | 'classic';
const KEY = 'hs:scoreLayout';
const EVT = 'hs:scoreLayout-change';
/** a wide, short screen: iPad / phone held sideways (not a desktop monitor) */
const LANDSCAPE = '(orientation: landscape) and (min-width: 640px) and (max-height: 900px)';

/** landscape is the default; classic is a temporary opt-out that will be removed */
const read = (): ScoreLayout => { try { return localStorage.getItem(KEY) === 'classic' ? 'classic' : 'landscape'; } catch { return 'landscape'; } };
export const setScoreLayout = (v: ScoreLayout) => {
  try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVT));
};
const sub = (f: () => void) => {
  const mq = matchMedia(LANDSCAPE);
  window.addEventListener(EVT, f); mq.addEventListener('change', f);
  return () => { window.removeEventListener(EVT, f); mq.removeEventListener('change', f); };
};
const snap = () => `${read()}|${matchMedia(LANDSCAPE).matches}`;

/** Whether the scoring tab should use the landscape layout (everything except an explicit 'classic' opt-out). */
export function useScoreLayout() {
  const [pref] = useSyncExternalStore(sub, snap).split('|');
  return { pref: pref as ScoreLayout, landscape: pref !== 'classic' };
}
