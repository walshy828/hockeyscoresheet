import { useEffect, useRef, useState } from 'react';
import type { Side } from '../../../shared/src/types.ts';
import { parseVoice, type VoiceCommand } from '../../../shared/src/voice.ts';
import { penaltyTypes } from '../../../shared/src/rules.ts';
import { useGame } from '../ctx.ts';
import { db } from '../db.ts';
import { uid } from '../ids.ts';
import { pLabel, sideName } from '../describe.ts';
import { useLocalSetting } from '../theme.ts';
import { Sheet, buzz, toast } from './ui.tsx';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;
export const voiceSupported = !!SR;

/** Silence after the last heard word before we finish; Chrome otherwise cuts off after the first word. */
const SILENCE_MS = 1800;

export function listenOnce(lang: string, local = true, onInterim?: (text: string) => void): { promise: Promise<string>; stop: () => void } {
  const r = new SR();
  r.lang = lang; r.interimResults = true; r.maxAlternatives = 1; r.continuous = true;
  // On-device recognition needs the language pack installed; otherwise Chrome reports language-not-supported.
  if (local) { try { r.processLocally = true; } catch { /* not supported */ } }
  let stop = () => r.stop();
  const promise = new Promise<string>((res, rej) => {
    let heard = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    r.onresult = (e: any) => {
      heard = Array.from(e.results).map((x: any) => x[0].transcript).join(' ').trim();
      onInterim?.(heard);
      clearTimeout(timer);
      timer = setTimeout(() => { try { r.stop(); } catch { /* ignore */ } }, SILENCE_MS);
    };
    r.onerror = (e: any) => { clearTimeout(timer); rej(new Error(e.error || 'speech error')); };
    r.onend = () => { clearTimeout(timer); if (heard) res(heard); else rej(new Error('no speech heard')); };
    r.start();
  });
  const retry = promise.catch((e: Error) => {
    if (local && /language-not-supported/.test(e.message)) {
      const l = listenOnce(lang, false, onInterim);
      stop = l.stop;
      return l.promise;
    }
    throw e;
  });
  return { promise: retry, stop: () => stop() };
}

const EXAMPLES: [string, string[]][] = [
  ['Face-off', ['“faceoff home 17”', '“faceoff won away 9”']],
  ['Shot', ['“shot away 4”', '“missed shot home 12”', '“blocked shot away 7”']],
  ['Goal', ['“goal home 17 assist 22 9”', '“goal away 5”']],
  ['Penalty', ['“penalty home 12 tripping”', '“penalty away 8 hooking”']],
  ['Other', ['“timeout home”', '“start clock” / “stop clock”']],
];

function ListeningOverlay({ heard, onDone, onCancel }: { heard: string; onDone: () => void; onCancel: () => void }) {
  return (
    <>
      <div className="backdrop" onClick={onCancel} />
      <div className="voice-overlay" role="dialog" aria-label="Listening">
        <div className="voice-mic" aria-hidden>🎤</div>
        <h2>Listening…</h2>
        <div className={`voice-heard ${heard ? '' : 'muted'}`} aria-live="polite">{heard ? `“${heard}”` : 'Say a command…'}</div>
        <div className="voice-examples">
          {EXAMPLES.map(([k, ex]) => (
            <div key={k}><b>{k}</b> <span className="muted">{ex.join('  ·  ')}</span></div>
          ))}
        </div>
        <div className="row">
          <button className="btn grow" onClick={onCancel}>Cancel</button>
          <button className="btn primary grow" onClick={onDone}>Done</button>
        </div>
      </div>
    </>
  );
}

/** Push-to-talk command button + confirm sheet. */
export function VoiceButton({ onOpenAction }: { onOpenAction: (init: { kind: 'penalty'; team: Side; player?: string }) => void }) {
  const { game, d, actions } = useGame();
  const [lang] = useLocalSetting('voiceLang', 'en-US');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const cancelled = useRef(false);
  const [result, setResult] = useState<{ text: string; cmd: VoiceCommand | null } | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const start = () => {
    if (!SR) { toast('Voice input is not supported in this browser'); return; }
    if (listening) { stopRef.current(); return; }
    buzz(20);
    cancelled.current = false;
    setHeard('');
    setListening(true);
    const l = listenOnce(lang, true, setHeard);
    stopRef.current = l.stop;
    l.promise
      .then((text) => { if (!cancelled.current) setResult({ text, cmd: parseVoice(text, actions.lastTeam.current ?? 'home') }); })
      .catch((e: Error) => { if (!/no speech|aborted/.test(e.message)) toast(`Voice: ${e.message}`); })
      .finally(() => setListening(false));
  };

  return (
    <>
      <button className={`btn grow ${listening ? 'primary' : ''}`} onClick={start} aria-label="Voice command" aria-pressed={listening}>{listening ? '● Listening…' : '🎤 Voice'}</button>
      {listening && <ListeningOverlay heard={heard} onDone={() => stopRef.current()} onCancel={() => { cancelled.current = true; stopRef.current(); setListening(false); }} />}
      {result && <VoiceConfirm text={result.text} cmd={result.cmd} onClose={() => setResult(null)} onOpenAction={onOpenAction} />}
    </>
  );
}

function VoiceConfirm({ text, cmd, onClose, onOpenAction }: { text: string; cmd: VoiceCommand | null; onClose: () => void; onOpenAction: (i: { kind: 'penalty'; team: Side; player?: string }) => void }) {
  const { game, d, actions } = useGame();
  const describe = (): string => {
    if (!cmd) return '';
    const who = (s: Side, n?: string) => (n ? (actions.byNumber(s, n) ? pLabel(game, actions.byNumber(s, n), true) : `#${n} (not on roster)`) : 'no player');
    switch (cmd.kind) {
      case 'goal': return `Goal ${sideName(game, cmd.team)} · ${who(cmd.team, cmd.scorer)}${cmd.assists.length ? ' · A: ' + cmd.assists.map((a) => who(cmd.team, a)).join(', ') : ''}`;
      case 'shot': return `${cmd.result === 'save' ? 'Shot on goal' : cmd.result === 'miss' ? 'Missed shot' : 'Blocked shot'} ${sideName(game, cmd.team)} · ${who(cmd.team, cmd.player)}`;
      case 'penalty': return `Penalty ${sideName(game, cmd.team)} · ${who(cmd.team, cmd.player)} · ${cmd.code ?? 'pick infraction'} ${cmd.minutes ?? ''}`;
      case 'faceoff': return `Faceoff won ${sideName(game, cmd.team)} · ${who(cmd.team, cmd.player)}`;
      case 'timeout': return `Timeout ${sideName(game, cmd.team)}`;
      case 'clock': return cmd.action === 'set' ? `Set clock to ${Math.floor(cmd.remaining! / 60)}:${String(cmd.remaining! % 60).padStart(2, '0')}` : `${cmd.action === 'start' ? 'Start' : 'Stop'} clock`;
      case 'note': return `Note: “${cmd.text}”`;
    }
  };
  const apply = async () => {
    if (!cmd) return;
    const id = (s: Side, n?: string) => actions.byNumber(s, n);
    switch (cmd.kind) {
      case 'goal': await actions.goal({ team: cmd.team, scorer: id(cmd.team, cmd.scorer), assists: cmd.assists.map((a) => id(cmd.team, a)!).filter(Boolean) }); break;
      case 'shot': await actions.shot({ team: cmd.team, player: id(cmd.team, cmd.player), result: cmd.result }); break;
      case 'faceoff': await actions.faceoff({ team: cmd.team, player: id(cmd.team, cmd.player) }); break;
      case 'timeout': await actions.timeout(cmd.team); break;
      case 'note': await actions.note(cmd.text); break;
      case 'clock':
        if (cmd.action === 'set') await actions.setClock(cmd.remaining!, undefined, actions.clockNow().running);
        else if (cmd.action === 'start' && !actions.clockNow().running) await actions.toggleClock();
        else if (cmd.action === 'stop' && actions.clockNow().running) await actions.toggleClock();
        break;
      case 'penalty': {
        const t = penaltyTypes(game.rules).find((x) => x.code === cmd.code);
        if (t) await actions.penalty({ team: cmd.team, player: id(cmd.team, cmd.player), code: t.code, label: t.label, minutes: cmd.minutes ?? t.minutes });
        else { onClose(); onOpenAction({ kind: 'penalty', team: cmd.team, player: id(cmd.team, cmd.player) }); return; }
        break;
      }
    }
    onClose();
  };
  void d;
  return (
    <Sheet title="Heard" onClose={onClose}>
      <div className="col">
        <div className="card"><span className="muted">“{text}”</span></div>
        {cmd ? <div className="card" style={{ borderColor: 'var(--accent)' }}><b>{describe()}</b></div> : <div className="banner">Couldn't understand that as a command. Try “goal home 17 assist 22 9”, “shot away 4”, “penalty home 12 tripping”.</div>}
        <div className="row">
          <button className="btn grow" onClick={onClose}>Dismiss</button>
          {!cmd && <button className="btn grow" onClick={async () => { await actions.note(text); onClose(); }}>Save as note</button>}
          {cmd && <button className="btn primary grow" onClick={apply}>Apply</button>}
        </div>
      </div>
    </Sheet>
  );
}

/** Record a voice note: audio blob stored locally (synced later) + optional live transcript. */
export function VoiceNoteButton() {
  const { game, actions } = useGame();
  const [lang] = useLocalSetting('voiceLang', 'en-US');
  const [rec, setRec] = useState<{ stop: () => void } | null>(null);
  const [secs, setSecs] = useState(0);

  useEffect(() => { if (!rec) return; const i = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(i); }, [rec]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Recording is not supported here (needs HTTPS)'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      let transcript = '';
      let sr: any;
      if (SR && !/iPad|iPhone/.test(navigator.userAgent)) {
        try {
          sr = new SR(); sr.lang = lang; sr.continuous = true; sr.interimResults = false;
          sr.onresult = (e: any) => { transcript = Array.from(e.results).map((x: any) => x[0].transcript).join(' '); };
          sr.onerror = () => {}; sr.start();
        } catch { sr = undefined; }
      }
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try { sr?.stop(); } catch { /* ignore */ }
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        const id = uid();
        await db.blobs.put({ id, gameId: game.id, mime: blob.type, data: blob, synced: 0 });
        await actions.note(transcript.trim() || '(voice note)', id);
        setRec(null); setSecs(0);
      };
      mr.start();
      setRec({ stop: () => mr.stop() });
    } catch (e) {
      toast(`Microphone: ${(e as Error).message}`);
    }
  };
  return rec
    ? <button className="btn primary grow" onClick={() => rec.stop()}>■ Stop ({secs}s)</button>
    : <button className="btn grow" onClick={start}>🎙 Voice note</button>;
}

export function AudioPlayer({ id }: { id: string }) {
  const [src, setSrc] = useState(`/api/audio/${id}`);
  useEffect(() => {
    let url: string | undefined;
    void db.blobs.get(id).then((b) => { if (b) { url = URL.createObjectURL(b.data); setSrc(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return <audio controls preload="none" src={src} style={{ width: '100%', height: 36 }} />;
}
