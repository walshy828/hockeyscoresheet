import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'hs:theme';

export function getThemePref(): ThemePref {
  try { return (localStorage.getItem(KEY) as ThemePref) || 'system'; } catch { return 'system'; }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1220' : '#f4f6fb');
}

export function setThemePref(pref: ThemePref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [p, setP] = useState(getThemePref);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme(getThemePref());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return [p, (v) => { setP(v); setThemePref(v); }];
}

export function useLocalSetting<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem('hs:' + key); return s === null ? init : (JSON.parse(s) as T); } catch { return init; }
  });
  return [v, (n) => { setV(n); try { localStorage.setItem('hs:' + key, JSON.stringify(n)); } catch { /* ignore */ } }];
}
