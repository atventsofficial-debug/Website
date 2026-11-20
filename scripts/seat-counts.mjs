// Writes js/seatcounts.js: how many seats each venue template has. The home page and the
// partner page show those numbers, and counting them by building every seat took a phone
// seconds (layouts.js seatCount). The build runs this before bundling, so a deploy always
// has the numbers of the layouts it ships; test/seatcounts.test.mjs checks the committed file.
import fs from 'node:fs';
import path from 'node:path';
import { VENUE_KEYS, getVenue } from '../js/layouts.js';

export const seatCountsSource = () => {
  const lines = VENUE_KEYS.map(k => `  '${k}': ${getVenue(k).seats.length},`);
  return `// Written by scripts/seat-counts.mjs (npm run build:site): do not edit by hand.\nexport const SEAT_COUNTS = {\n${lines.join('\n')}\n};\n`;
};

export function writeSeatCounts(root) {
  const file = path.join(root, 'js', 'seatcounts.js');
  const src = seatCountsSource();
  if (fs.readFileSync(file, 'utf8') !== src) fs.writeFileSync(file, src);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  writeSeatCounts(path.resolve(new URL('..', import.meta.url).pathname));
}
