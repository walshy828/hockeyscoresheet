import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'hs:theme';

export function getThemePref(): ThemePref {
  try { return (localStorage.getItem(KEY) as ThemePref) || 'system'; } catch { return 'system'; }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#070b16' : '#e8edf8');
}

/* ---- accent colour: one user-picked hue drives every interactive highlight in both themes ---- */
export const DEFAULT_ACCENT = '#2f6df6';
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Ice blue', hex: '#2f6df6' }, { name: 'Violet', hex: '#7c5cff' }, { name: 'Magenta', hex: '#d946ef' },
  { name: 'Rose', hex: '#f43f6e' }, { name: 'Orange', hex: '#f97316' }, { name: 'Gold', hex: '#eab308' },
  { name: 'Emerald', hex: '#10b981' }, { name: 'Teal', hex: '#14b8a6' },
];
const ACCENT_KEY = 'hs:accent';
const ACCENT_VARS_KEY = 'hs:accentvars'; // precomputed so index.html can paint it before React boots

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = ([r, g, b]: number[]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => { const [x, y] = [rgb(a), rgb(b)]; return hex(x.map((v, i) => v + (y[i] - v) * t)); };
export const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const onColor = (h: string) => (lum(h) > 0.36 ? '#08111f' : '#ffffff');

/** Light theme wants a slightly deeper tone (reads on white glass); dark wants a brighter one (glows on night glass). */
export function accentVars(base: string): Record<string, string> {
  const light = lum(base) > 0.5 ? mix(base, '#000000', 0.28) : base;
  const dark = lum(base) < 0.2 ? mix(base, '#ffffff', 0.38) : mix(base, '#ffffff', 0.14);
  return { '--accent-l': light, '--accent-d': dark, '--on-accent-l': onColor(light), '--on-accent-d': onColor(dark) };
}

export function applyAccent(base: string) {
  const vars = accentVars(base);
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  try { localStorage.setItem(ACCENT_VARS_KEY, JSON.stringify(vars)); } catch { /* private mode */ }
}

export function getAccent(): string {
  try { const a = localStorage.getItem(ACCENT_KEY); return a && /^#[0-9a-f]{6}$/i.test(a) ? a : DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
}

export function setAccent(base: string) {
  try { localStorage.setItem(ACCENT_KEY, base); } catch { /* private mode */ }
  applyAccent(base);
}

export function useAccent(): [string, (c: string) => void] {
  const [c, setC] = useState(getAccent);
  return [c, (v) => { setC(v); setAccent(v); }];
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

/* ---- team colours: keep them legible on the current theme ---- */
const BG = { dark: '#060a14', light: '#e6ecf8' };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

export function useIsDark(): boolean {
  const read = () => document.documentElement.dataset.theme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

const validHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

/** The team colour nudged lighter (dark theme) or darker (light theme) until it reads at 3:1 on the page background. */
export function readableTeam(color: string, dark: boolean): string {
  if (!validHex(color)) return color;
  const bg = dark ? BG.dark : BG.light;
  for (let t = 0; t <= 1; t += 0.1) { const c = mix(color, dark ? '#ffffff' : '#000000', t); if (contrast(c, bg) >= 3) return c; }
  return dark ? '#ffffff' : '#000000';
}

/** Name style: plain coloured text when it reads on the page, otherwise a light (dark theme) / dark (light theme) pill behind it. */
export function teamNameStyle(color: string, dark: boolean): { color: string; pill: boolean; background?: string } {
  if (!validHex(color) || contrast(color, dark ? BG.dark : BG.light) >= 3) return { color, pill: false };
  const background = mix(color, dark ? '#ffffff' : '#000000', 0.86);
  let text = color;
  for (let t = 0; t <= 1 && contrast(text, background) < 4.5; t += 0.1) text = mix(color, dark ? '#000000' : '#ffffff', t);
  return { color: text, pill: true, background };
}

/** CSS vars for a screen/overlay: --home/--away legible, plus --team (raw colour) for tinting the background to one team. */
export function teamVars(home: string, away: string, dark: boolean, team?: 'home' | 'away'): Record<string, string> {
  return { '--home': readableTeam(home, dark), '--away': readableTeam(away, dark), ...(team ? { '--team': team === 'home' ? home : away } : {}) };
}
