# Hockey Scoresheet

Mobile/tablet-first, offline-first hockey scoresheet for coaches and team managers. Runs as one Docker container.

```bash
docker compose up -d --build     # http://localhost:8787  (HOST_PORT=xxxx to change)
```

> **Use HTTPS in real use.** Service workers (offline mode/install), microphone and speech recognition only work on
> `https://` or `localhost`. Put the container behind Caddy / Cloudflare Tunnel / Tailscale Serve. Data lives in the `scoresheet-data` volume.

## What it does
- **Scoring mode**: tap the rink where a shot/goal came from → pick team (auto-guessed from the end tapped), shooter, assists, result. Goal/shot/faceoff/penalty sheets, strength (EV/PP/SH/EN/PS) auto-detected from active penalties, minor penalties end on PP goals, undo on every action, edit/void anything from the Log.
- **Clock**: tap to adjust (±1s/10s/1m, type MM:SS, reset/end period, previous/next period). Every adjustment is logged; the clock survives reloads and offline.
- **Lines tab**: tap to put players on/off the ice (ice time per period, shifts, +/-); long-press a player for goal/shot/penalty/faceoff.
- **Stats**: box score, scoring/penalty summaries, shots by period, player & goalie stats (SV%), faceoff %, TOI, shot map + heat map with filters.
- **Games**: create / edit / duplicate / delete (restorable) / export (JSON, CSV) / email / print-to-PDF. Team library with roster paste (`12 Jane Smith C`). Presets: High School (default), Youth, Junior/Adult, NHL-style, or custom.
- **Viewer mode**: every game has a read-only link + QR (`/v/<token>`); coaches see score, shots, faceoffs, ice time live over SSE, and a cached copy when offline.
- **Voice**: push-to-talk commands ("goal home 17 assist 22 9", "shot away 4", "penalty home 12 tripping", "set clock 8 14", "stop clock", "note: …") confirmed with one tap; voice notes recorded offline and synced later. Uses the browser Speech API (Chrome/Safari).
- **Theme**: system / light / dark in Settings.

## No data loss
1. Every tap is an immutable event written to IndexedDB **before** the UI updates (`web/src/db.ts`).
2. A background outbox pushes unsynced events when online (on reconnect, foreground, every 15s, with backoff). Events carry client-generated UUIDs; the server `INSERT OR IGNORE`s them, so retries/duplicates/reordering are harmless (`server/src/app.ts`). An event is only marked synced after the server acknowledges it.
3. Undo/edit/delete are new events — history is never erased. Game state is a pure function of the log (`shared/src/derive.ts`).
4. Persistent storage requested; the status chip shows Offline / N pending / Synced.
5. Safety nets: Settings → full JSON backup/restore, per-game JSON export, server SQLite (WAL, `synchronous=FULL`) with a daily `VACUUM INTO` backup (14 kept) in `/data/backups`.

Access model: no accounts. The creating device holds the scorer PIN; a second device can take over with **Games → Join** (view link + PIN). The viewer link is read-only.

## Dev
```bash
npm install
npm -w server run dev     # API on :8080 (needs Node 24+: uses node:sqlite)
npm -w web run dev        # Vite with /api proxy
npm test                  # vitest: reducer, voice parser, roster parser
npm -w server test        # sync idempotency / pin / viewer / audio
cd e2e && npx playwright test   # offline E2E against http://localhost:8787
```

## Known limits
- Viewer clock is anchored to the server's receive time; a scorer who syncs late shows the clock late until the next clock event.
- Voice recognition quality/availability depends on the browser (Firefox has none); recording needs HTTPS.
- Email uses `mailto:`/Web Share (no SMTP server in the container). Pushing to two scorer devices at once is safe (union of events) but there is no live scorer lock.
