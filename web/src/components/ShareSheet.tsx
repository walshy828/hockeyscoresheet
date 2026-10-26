import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Game, GameEvent } from '../../../shared/src/types.ts';
import { eventsCsv, gameJson, playersCsv, summaryText, viewLink } from '../export.ts';
import { sideName } from '../describe.ts';
import { Sheet, download, toast } from './ui.tsx';

export function ShareSheet({ game, events, onClose, onPrint }: { game: Game; events: GameEvent[]; onClose: () => void; onPrint?: () => void }) {
  const link = viewLink(game);
  const [qr, setQr] = useState('');
  useEffect(() => { void QRCode.toDataURL(link, { margin: 1, width: 320 }).then(setQr); }, [link]);
  const slug = `${sideName(game, 'away')}-at-${sideName(game, 'home')}-${game.date.slice(0, 10)}`.replace(/[^\w-]+/g, '_');
  const subject = `${sideName(game, 'away')} at ${sideName(game, 'home')} – ${game.date.slice(0, 10)}`;

  const share = async () => {
    const text = summaryText(game, events, link);
    try {
      if (navigator.share) { await navigator.share({ title: subject, text }); return; }
    } catch { return; }
    await navigator.clipboard?.writeText(text);
    toast('Summary copied');
  };

  return (
    <Sheet title="Share & export" onClose={onClose}>
      <div className="col">
        <div className="card col" style={{ alignItems: 'center' }}>
          <b>Live view for coaches &amp; parents</b>
          {qr && <img src={qr} width={180} height={180} alt="QR code for the live view link" style={{ background: '#fff', borderRadius: 8 }} />}
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{link}</code>
          <div className="row" style={{ width: '100%' }}>
            <button className="btn grow" onClick={async () => { await navigator.clipboard?.writeText(link); toast('Link copied'); }}>Copy link</button>
            <button className="btn grow" onClick={() => { void navigator.share?.({ url: link, title: subject }).catch(() => {}); }} disabled={!navigator.share}>Share…</button>
          </div>
          <span className="muted small">Read-only. Anyone with the link can watch; updates appear live. Works once the game has synced.</span>
        </div>
        <a className="btn primary" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summaryText(game, events, link))}`}>✉ Email box score</a>
        <button className="btn" onClick={share}>Share summary text…</button>
        {onPrint && <button className="btn" onClick={() => { onPrint(); onClose(); setTimeout(() => window.print(), 400); }}>🖨 Print / Save as PDF</button>}
        <div className="row wrap">
          <button className="btn grow" onClick={() => download(`${slug}.csv`, eventsCsv(game, events), 'text/csv')}>Events CSV</button>
          <button className="btn grow" onClick={() => download(`${slug}-players.csv`, playersCsv(game, events), 'text/csv')}>Players CSV</button>
          <button className="btn grow" onClick={() => download(`${slug}.json`, gameJson(game, events))}>Game backup (JSON)</button>
        </div>
      </div>
    </Sheet>
  );
}
