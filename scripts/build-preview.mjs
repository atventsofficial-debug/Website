// Builds dist/preview.html: the page without <!doctype>/<html>/<head>/<body> wrappers,
// for hosts that wrap the page in their own document (Claude Artifacts).
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
fs.mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../dist/preview.html', import.meta.url), head.trim() + '\n' + body.trim() + '\n');
console.log('dist/preview.html ready');
