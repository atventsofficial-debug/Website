// Builds site/: the front end alone, for static hosting such as Cloudflare Pages. Only the
// files the browser needs are copied (no server code, tests or docs), with a _headers file
// carrying the same security headers the Node server sends. Without the server the site
// runs in demo mode: everything works, and passes and clicks stay in the visitor's browser.
//
// The scripts and the stylesheet are bundled and minified with esbuild, under names that
// carry a hash of their contents, so browsers can keep them for a year and still get every
// new release at once. The 3D code stays a file of its own, fetched only when a 3D view
// opens. If esbuild is not installed the source files are copied as they are: the site
// still works, only heavier.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { securityHeaders } from '../server/http.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'site');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let bundled = false;
try {
  const esbuild = await import('esbuild');
  const js = await esbuild.build({
    entryPoints: [path.join(root, 'js/app.js')],
    outdir: path.join(out, 'js'),
    bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2020',
    external: ['three', 'three/addons/*'],
    entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]',
    metafile: true, logLevel: 'warning',
  });
  const entry = Object.entries(js.metafile.outputs).find(([, o]) => o.entryPoint)?.[0];
  if (!entry) throw new Error('no entry file');
  const css = await esbuild.transform(fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8'), { loader: 'css', minify: true });
  const cssName = `styles-${crypto.createHash('sha256').update(css.code).digest('hex').slice(0, 10)}.css`;
  fs.mkdirSync(path.join(out, 'css'));
  fs.writeFileSync(path.join(out, 'css', cssName), css.code);
  const swap = (from, to) => { if (!html.includes(from)) throw new Error(`index.html has no ${from}`); html = html.replace(from, to); };
  swap('src="js/app.js"', `src="js/${path.basename(entry)}"`);
  swap('href="css/styles.css"', `href="css/${cssName}"`);
  bundled = true;
} catch (err) {
  console.warn(`Not bundled (${err.message}); copying the source files instead.`);
  for (const dir of ['js', 'css']) {
    fs.rmSync(path.join(out, dir), { recursive: true, force: true });
    fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
  }
  html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
}
fs.writeFileSync(path.join(out, 'index.html'), html);

// Hashed files never change, so they are kept for a year. Pictures keep their names when one
// is replaced, so they are kept for a day and refreshed in the background for a week.
const block = (route, rules) => `${route}\n${Object.entries(rules).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
const code = bundled ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
fs.writeFileSync(path.join(out, '_headers'), [
  block('/*', securityHeaders(root, true)),
  block('/js/*', { 'cache-control': code }),
  block('/css/*', { 'cache-control': code }),
  block('/assets/*', { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' }),
].join('\n'));
console.log(`site/ ready${bundled ? ' (bundled)' : ''}`);
