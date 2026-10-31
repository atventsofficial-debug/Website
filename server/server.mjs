// SeatSight server: the static site plus a small API for clicks out to tiket.com,
// 3D passes, the affiliate report import, partner requests and sign-ups.
//
//   DATABASE_URL=postgres://user:pass@localhost/seatsight npm start
//
// Settings are read from the environment or .env (see .env.example).
import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';

let cfg;
try { cfg = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }

const app = await createApp(cfg);
const port = await app.listen();
console.log(`SeatSight running at http://localhost:${port}`);
console.log(cfg.affiliateLink ? 'Affiliate link set: buy buttons go through it' : 'AFFILIATE_LINK not set: buy buttons use js/config.js, or go straight to tiket.com');
if (!cfg.adminToken) console.log('ADMIN_TOKEN not set: the admin page stays closed until you set one');

const stop = async () => { await app.close().catch(() => {}); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
