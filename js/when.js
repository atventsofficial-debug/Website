// Dates and times. An event's `dateISO`, `doors`, `ends` and running order are the clock at
// the venue, in the venue's time zone. Fans read them in their own zone, with the venue's
// clock beside it when the two differ: a fan in Singapore sees a 19:30 show in Jakarta at
// 20:30 SGT, "19:30 in Jakarta".
import { CITY, placeOf, timeKnown } from './events.js';

const HOME_TZ = 'Asia/Jakarta';

// The browser's zone, e.g. 'Asia/Singapore'. No permission needed.
export const VIEWER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || HOME_TZ; } catch { return HOME_TZ; }
})();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formats = new Map();
const formatter = (tz, opts, locale = 'en-GB') => {
  const key = `${locale}|${tz}|${JSON.stringify(opts)}`;
  if (!formats.has(key)) formats.set(key, new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }));
  return formats.get(key);
};

// The wall clock in a zone at a moment: { y, m, d, hh, mm, dow }.
function wallAt(ms, tz) {
  const p = Object.fromEntries(formatter(tz, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(ms).map(x => [x.type, x.value]));
  const y = +p.year, m = +p.month, d = +p.day;
  return { y, m, d, hh: p.hour.padStart(2, '0').replace(/^24/, '00'), mm: p.minute.padStart(2, '0'), dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

// Minutes a zone is ahead of UTC at a moment.
function offset(ms, tz) {
  const w = wallAt(ms, tz);
  return (Date.UTC(w.y, w.m - 1, w.d, +w.hh, +w.mm) - Math.floor(ms / 6e4) * 6e4) / 6e4;
}

// The moment of a wall-clock time ('YYYY-MM-DDTHH:MM') in a zone. The second pass
// settles times near a daylight-saving change.
export function instant(wall, tz) {
  const utc = Date.parse(`${wall}:00Z`);
  return utc - offset(utc - offset(utc, tz) * 6e4, tz) * 6e4;
}

// Short zone names. Intl gives "GMT+8" for much of Asia, so the common ones are spelled out.
const ABBR = {
  'Asia/Jakarta': 'WIB', 'Asia/Pontianak': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT',
  'Asia/Singapore': 'SGT', 'Asia/Kuala_Lumpur': 'MYT', 'Asia/Kuching': 'MYT', 'Asia/Bangkok': 'ICT', 'Asia/Ho_Chi_Minh': 'ICT',
  'Asia/Manila': 'PHT', 'Asia/Hong_Kong': 'HKT', 'Asia/Tokyo': 'JST', 'Asia/Seoul': 'KST', 'Asia/Kolkata': 'IST', 'Asia/Calcutta': 'IST', 'Asia/Dubai': 'GST',
};
export function zoneName(ms, tz) {
  if (ABBR[tz]) return ABBR[tz];
  let fallback = '';
  for (const locale of ['en-GB', 'en-US', 'en-AU']) {
    const name = formatter(tz, { timeZoneName: 'short' }, locale).formatToParts(ms).find(x => x.type === 'timeZoneName')?.value || '';
    if (name && !/^GMT[+-−]/.test(name)) return name;
    fallback ||= name;
  }
  return fallback || tz;
}

const tzOf = e => CITY[placeOf(e).city]?.tz || HOME_TZ;
const nextDay = day => new Date(Date.parse(`${day}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

// When an event starts, as a moment. A show without a time sorts at noon on its date.
// Events are fixed data, so each is worked out once.
const starts = new WeakMap();
export function startOf(e) {
  if (!starts.has(e)) starts.set(e, instant(timeKnown(e) ? e.dateISO : `${e.dateISO.slice(0, 10)}T12:00`, tzOf(e)));
  return starts.get(e);
}

// A venue time ('HH:MM') on the event's date, as a moment. A time more than twelve hours
// before the start belongs to the night after midnight.
export function atVenue(e, hhmm) {
  const day = e.dateISO.slice(0, 10), tz = tzOf(e);
  const ms = instant(`${day}T${hhmm}`, tz);
  return timeKnown(e) && startOf(e) - ms > 12 * 36e5 ? instant(`${nextDay(day)}T${hhmm}`, tz) : ms;
}

const sameDay = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;
const dateText = w => `${DAYS[w.dow]}, ${w.d} ${MONTHS[w.m - 1]} ${w.y}`;
const longDate = w => `${w.d} ${LONG_MONTHS[w.m - 1]}`;

// A venue time as the fan reads it: their clock and zone, and the venue's clock when it
// differs ("19:30 in Jakarta", with the day when that is another day too).
function clockAt(e, ms, tz = VIEWER_TZ) {
  const mine = wallAt(ms, tz), venueTz = tzOf(e);
  const there = wallAt(ms, venueTz);
  const differs = mine.hh !== there.hh || mine.mm !== there.mm || !sameDay(mine, there);
  return {
    time: `${mine.hh}:${mine.mm}`,
    zone: zoneName(ms, tz),
    local: differs ? `${there.hh}:${there.mm}${sameDay(mine, there) ? '' : ` ${LONG_DAYS[there.dow]}`} in ${placeOf(e).city}` : '',
  };
}

// Everything a page shows about an event's date: the fan's date and start time, the
// venue's clock beside it, and the parts for date blocks. Unknown times stay on the
// venue's date, the only one there is.
export function whenOf(e, tz = VIEWER_TZ) {
  const known = timeKnown(e), ms = startOf(e);
  const w = known ? wallAt(ms, tz) : wallAt(ms, tzOf(e));
  const start = known ? clockAt(e, ms, tz) : null;
  return {
    ms, known,
    date: dateText(w),
    long: longDate(w),
    block: { day: w.d, mon: MONTHS[w.m - 1].toUpperCase(), dow: DAYS[w.dow].toUpperCase() },
    pill: `${w.d} ${MONTHS[w.m - 1]} ${w.y}`.toUpperCase(),
    time: start ? `${start.time} ${start.zone}` : '',
    zone: start?.zone || '',
    local: start?.local || '',
  };
}

// The venue's own clock, as a ticket prints it: the date and times there, with that zone.
export const venueWhen = e => whenOf(e, tzOf(e));

// Doors, end and running-order times, in the fan's zone.
export const venueClock = (e, hhmm, tz = VIEWER_TZ) => clockAt(e, atVenue(e, hhmm), tz);

// How far the venue's clock is from the fan's: "Jakarta is 1 hour behind you".
export function gapText(e, tz = VIEWER_TZ) {
  const ms = startOf(e), mins = offset(ms, tzOf(e)) - offset(ms, tz);
  if (!mins) return '';
  const h = Math.abs(mins) / 60, n = Number.isInteger(h) ? h : h.toFixed(1);
  return `${placeOf(e).city} is ${n} hour${h === 1 ? '' : 's'} ${mins > 0 ? 'ahead of' : 'behind'} you`;
}
