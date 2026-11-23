// Builds site/: the front end alone, for static hosting such as Cloudflare. Only the files
// the browser needs are copied (no server code, tests or docs), with a _headers file
// carrying the same security headers the Node server sends. Without the server the site
// runs in demo mode: everything works, and passes and clicks stay in the visitor's browser.
// It also writes worker/catalog.json, the concerts and seats the payment Worker checks
// orders against (scripts/worker-catalog.mjs).
//
// Its CSP lets Midtrans' payment form open inside the page (js/snap.js), and Google Tag
// Manager and Analytics load and report (js/gtm.js); the Node server's does neither.
//
// The scripts and the stylesheet are bundled and minified with esbuild, under names that
// carry a hash of their contents, so browsers can keep them for a year and still get every
// new release at once. The 3D code stays a file of its own, fetched only when a 3D view
// opens, with three.js bundled into it (devDependency, the version the import map names):
// one request to this site instead of a chain of module files from the CDN, and no
// third party on the page. If esbuild is not installed the source files are copied as they
// are: the site still works, only heavier, with three.js from the CDN.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { securityHeaders } from './security-headers.mjs';
import { writeWorkerCatalog } from './worker-catalog.mjs';
import { writeSeatCounts } from './seat-counts.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'site');
// The seat counts go into the bundle, so they are brought up to date first.
writeSeatCounts(root);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
// robots.txt and sitemap.xml: for Google Search Console and other crawlers.
for (const name of ['favicon.ico', 'site.webmanifest', 'robots.txt', 'sitemap.xml']) fs.cpSync(path.join(root, name), path.join(out, name));

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// /auth: where Google and Microsoft send the fan back after signing in (js/sso.js).
let auth = fs.readFileSync(path.join(root, 'auth.html'), 'utf8');
let bundled = false;
try {
  const esbuild = await import('esbuild');
  const js = await esbuild.build({
    entryPoints: [path.join(root, 'js/app.js'), path.join(root, 'js/auth.js')],
    outdir: path.join(out, 'js'),
    bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2020',
    entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]',
    metafile: true, logLevel: 'warning',
  });
  const entryOf = name => Object.entries(js.metafile.outputs).find(([, o]) => o.entryPoint?.replace(/\\/g, '/').endsWith(`js/${name}`))?.[0];
  const entry = entryOf('app.js'), authEntry = entryOf('auth.js');
  if (!entry || !authEntry) throw new Error('no entry file');
  // The phone layout (css/mobile.css) goes after the main sheet, in the same file.
  const sheets = ['styles.css', 'mobile.css'].map(f => fs.readFileSync(path.join(root, 'css', f), 'utf8')).join('\n');
  const css = await esbuild.transform(sheets, { loader: 'css', minify: true });
  const cssName = `styles-${crypto.createHash('sha256').update(css.code).digest('hex').slice(0, 10)}.css`;
  fs.mkdirSync(path.join(out, 'css'));
  fs.writeFileSync(path.join(out, 'css', cssName), css.code);
  const swap = (from, to) => { if (!html.includes(from)) throw new Error(`index.html has no ${from}`); html = html.replace(from, to); };
  // The opening animation's script (js/intro.js) runs in <head> before the page draws, so it
  // stays out of the bundle: a small file of its own, hashed like the rest.
  const intro = await esbuild.transform(fs.readFileSync(path.join(root, 'js/intro.js'), 'utf8'), { loader: 'js', minify: true, target: 'es2015' });
  const introName = `intro-${crypto.createHash('sha256').update(intro.code).digest('hex').slice(0, 10)}.js`;
  fs.writeFileSync(path.join(out, 'js', introName), intro.code);
  swap('src="js/intro.js"', `src="js/${introName}"`);
  // Google Tag Manager's loader (js/gtm.js): a small file of its own too, hashed the same way.
  const gtm = await esbuild.transform(fs.readFileSync(path.join(root, 'js/gtm.js'), 'utf8'), { loader: 'js', minify: true, target: 'es2015' });
  const gtmName = `gtm-${crypto.createHash('sha256').update(gtm.code).digest('hex').slice(0, 10)}.js`;
  fs.writeFileSync(path.join(out, 'js', gtmName), gtm.code);
  swap('src="js/gtm.js"', `src="js/${gtmName}"`);
  swap('src="js/app.js"', `src="js/${path.basename(entry)}"`);
  swap('href="css/styles.css"', `href="css/${cssName}"`);
  swap('<link rel="stylesheet" href="css/mobile.css">\n', '');
  // three.js is in the bundle: the import map that points it at the CDN goes.
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
  if (!auth.includes('src="js/auth.js"')) throw new Error('auth.html has no src="js/auth.js"');
  auth = auth.replace('src="js/auth.js"', `src="js/${path.basename(authEntry)}"`);
  bundled = true;
} catch (err) {
  console.warn(`Not bundled (${err.message}); copying the source files instead.`);
  for (const dir of ['js', 'css']) {
    fs.rmSync(path.join(out, dir), { recursive: true, force: true });
    fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
  }
  html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  auth = fs.readFileSync(path.join(root, 'auth.html'), 'utf8');
}
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'auth.html'), auth);

// Hashed files never change, so they are kept for a year. Pictures keep their names when one
// is replaced, so a browser keeps one five minutes and then asks again (a 304 when nothing
// changed): a new picture reaches every visitor within minutes, not days. The page itself has
// no rule: Cloudflare sends it with max-age=0, must-revalidate, so a release shows on the next load.
// The pass email's pictures (assets/mail/) are shown by mail apps, from other addresses, so
// their rule takes back the same-origin-only resource policy that /* gives every file
// ("! header" removes a header an earlier rule set) and lets any site show them.
const block = (route, rules, drop = []) => `${route}\n${[...drop.map(k => `  ! ${k}`), ...Object.entries(rules).map(([k, v]) => `  ${k}: ${v}`)].join('\n')}\n`;
const code = bundled ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
fs.writeFileSync(path.join(out, '_headers'), [
  block('/*', securityHeaders(out, true, { midtrans: true, analytics: true })),   // from the page as built: no import map, no CDN
  block('/js/*', { 'cache-control': code }),
  block('/css/*', { 'cache-control': code }),
  // stale-while-revalidate: after the five minutes a picture still shows from the cache at
  // once while the browser checks it in the background, so a return visit waits for none.
  block('/assets/*', { 'cache-control': 'public, max-age=300, stale-while-revalidate=604800' }),
  // The font never changes under its name: a week, so a return visit does not ask again ("!"
  // drops the /assets/* rule's value first, as Cloudflare would otherwise join the two).
  block('/assets/fonts/*', { 'cache-control': 'public, max-age=604800' }, ['cache-control']),
  block('/assets/mail/*', { 'cross-origin-resource-policy': 'cross-origin' }, ['cross-origin-resource-policy']),
].join('\n'));
writeWorkerCatalog(root);
console.log(`site/ and worker/catalog.json ready${bundled ? ' (bundled)' : ''}`);
