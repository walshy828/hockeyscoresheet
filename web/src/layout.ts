import { useSyncExternalStore } from 'react';

export type ScoreLayout = 'auto' | 'landscape' | 'classic';
const KEY = 'hs:scoreLayout';
const EVT = 'hs:scoreLayout-change';
/** a wide, short screen: iPad / phone held sideways (not a desktop monitor) */
const LANDSCAPE = '(orientation: landscape) and (min-width: 640px) and (max-height: 900px)';

const read = (): ScoreLayout => { try { return (localStorage.getItem(KEY) as ScoreLayout) || 'auto'; } catch { return 'auto'; } };
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

/** Whether the scoring tab should use the landscape layout (auto = only on a landscape tablet/phone). */
export function useScoreLayout() {
  const [pref, wide] = useSyncExternalStore(sub, snap).split('|');
  return { pref: pref as ScoreLayout, landscape: pref === 'landscape' || (pref === 'auto' && wide === 'true') };
}
