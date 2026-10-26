import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildApp } from './app.ts';
import { openStore } from './db.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? join(here, '../../data');
const staticDir = process.env.STATIC_DIR ?? join(here, '../../web/dist');
const port = Number(process.env.PORT ?? 8080);

const store = openStore(dataDir);
const app = buildApp(store, { staticDir, logger: true });

// Daily consistent SQLite backup (also once at boot)
const backup = () => { try { app.log.info(`backup written: ${store.backup()}`); } catch (e) { app.log.error(e); } };
backup();
setInterval(backup, 24 * 3600 * 1000).unref();

const shutdown = async () => { await app.close(); store.db.close(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port, host: '0.0.0.0' });
