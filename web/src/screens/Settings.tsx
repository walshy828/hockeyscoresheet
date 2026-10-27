import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, exportAll, importAll, kvGet, kvSet } from '../db.ts';
import { syncNow, useSyncStatus } from '../sync.ts';
import { ACCENT_PRESETS, DEFAULT_ACCENT, useAccent, useLocalSetting, useThemePref, type ThemePref } from '../theme.ts';
import { DEFAULT_PRESET, PRESET_LABELS } from '../../../shared/src/rules.ts';
import { download, toast } from '../components/ui.tsx';
import { setScoreLayout, useScoreLayout } from '../layout.ts';

export function Settings() {
  const [theme, setTheme] = useThemePref();
  const layout = useScoreLayout();
  const [accent, setAccent] = useAccent();
  const [haptics, setHaptics] = useLocalSetting('haptics', true);
  const [lang, setLang] = useLocalSetting('voiceLang', 'en-US');
  const preset = useLiveQuery(() => kvGet('defaultPreset', DEFAULT_PRESET), []) ?? DEFAULT_PRESET;
  const st = useSyncStatus();
  const file = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const counts = useLiveQuery(async () => ({ games: await db.games.count(), events: await db.events.count() }), []);
  void navigator.storage?.persisted?.().then(setPersisted);

  return (
    <div className="page">
      <div className="topbar"><h1>Settings</h1></div>
      <div className="col">
        <div className="card col">
          <h3>Appearance</h3>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          <div className="field"><span>Accent colour</span>
            <div className="swatches" role="radiogroup" aria-label="Accent colour">
              {ACCENT_PRESETS.map((a) => (
                <button key={a.hex} role="radio" aria-checked={accent.toLowerCase() === a.hex} aria-label={a.name} title={a.name}
                  className={`swatch ${accent.toLowerCase() === a.hex ? 'on' : ''}`} style={{ '--sw': a.hex } as React.CSSProperties} onClick={() => setAccent(a.hex)} />
              ))}
              <label className={`swatch custom ${ACCENT_PRESETS.some((a) => a.hex === accent.toLowerCase()) ? '' : 'on'}`} style={{ '--sw': accent } as React.CSSProperties} title="Custom colour">
                <input type="color" aria-label="Custom accent colour" value={accent} onChange={(e) => setAccent(e.target.value)} />
              </label>
            </div>
            <span className="muted small">Used for buttons, selection and highlights in both light and dark mode. Goals, penalties and team colours keep their own meaning.</span>
            {accent.toLowerCase() !== DEFAULT_ACCENT && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAccent(DEFAULT_ACCENT)}>Reset to default</button>}
          </div>
          <div className="field"><span>Scoring layout</span>
            <div className="seg" role="radiogroup" aria-label="Scoring layout">
              <button className={layout.pref !== 'classic' ? 'on' : ''} onClick={() => setScoreLayout('landscape')}>Landscape</button>
              <button className={layout.pref === 'classic' ? 'on' : ''} onClick={() => setScoreLayout('classic')}>Classic (going away)</button>
            </div>
          </div>
          <label className="row"><input type="checkbox" style={{ width: 24, minHeight: 24 }} checked={haptics} onChange={(e) => setHaptics(e.target.checked)} /> Vibrate on tap (Android)</label>
        </div>
        <div className="card col">
          <h3>New game defaults</h3>
          <label className="field"><span>Rules preset</span>
            <select value={preset} onChange={(e) => void kvSet('defaultPreset', e.target.value)}>
              {Object.keys(PRESET_LABELS).map((k) => <option key={k} value={k}>{PRESET_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="field"><span>Voice language</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en-US">English (US)</option><option value="en-CA">English (Canada)</option><option value="en-GB">English (UK)</option>
              <option value="fr-CA">Français (Canada)</option><option value="sv-SE">Svenska</option><option value="fi-FI">Suomi</option>
            </select>
          </label>
        </div>
        <div className="card col">
          <h3>Data safety</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Every tap is saved on this device first, then synced to the server when a connection is available.
            {counts && <> This device holds {counts.games} games / {counts.events} events.</>}{' '}
            Sync: {st.online ? 'online' : 'offline'}, {st.pending} waiting to upload{st.lastOk ? `, last ok ${new Date(st.lastOk).toLocaleTimeString()}` : ''}.
            {persisted === false && ' Browser storage is not marked persistent — install the app to your home screen to protect it.'}
          </p>
          {st.error && <div className="banner">Last sync error: {st.error}</div>}
          <button className="btn" onClick={() => { void syncNow().then(() => toast('Sync attempted')); }}>Sync now</button>
          <button className="btn" onClick={async () => download(`scoresheet-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll()))}>Download full backup</button>
          <button className="btn" onClick={() => file.current?.click()}>Restore from backup…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { await importAll(JSON.parse(await f.text())); toast('Backup restored (merged)'); } catch (err) { toast(`Restore failed: ${(err as Error).message}`); }
            e.target.value = '';
          }} />
        </div>
        <p className="muted small" style={{ textAlign: 'center' }}>Hockey Scoresheet · offline-first</p>
      </div>
    </div>
  );
}
