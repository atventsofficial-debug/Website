// Builds site/: the front end alone, for static hosting such as Cloudflare Pages. Only the
// files the browser needs are copied (no server code, tests or docs), with a _headers file
// carrying the same security headers the Node server sends. Without the server the site
// runs in demo mode: everything works, and passes and clicks stay in the visitor's browser.
import fs from 'node:fs';
import path from 'node:path';
import { securityHeaders } from '../server/http.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'site');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const name of ['index.html', 'js', 'css', 'assets']) fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });

const headers = Object.entries(securityHeaders(root, true)).map(([k, v]) => `  ${k}: ${v}`).join('\n');
fs.writeFileSync(path.join(out, '_headers'), `/*\n${headers}\n`);
console.log('site/ ready');
