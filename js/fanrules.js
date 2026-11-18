// Seat mates: fans with a paid 3D pass for the same concert who chose to show their
// Instagram on their seat, so they can meet before the show. Pure and with no imports
// beyond order.js, so the Worker (worker/fans.mjs) checks a profile exactly the way the page
// does (js/fans.js).
//
// Nothing here is ever shown by default: a fan's name and Instagram reach other fans only
// after they tick the box, only fans with a paid pass for the same concert see them, and
// the fan can take them down again at any time.
import { line } from './order.js';

// Instagram usernames: letters, digits, dots and underscores, 30 at most, not starting or
// ending with a dot. A pasted profile link or a leading @ is taken as the username.
export const IG_HANDLE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{1,30}(?<!\.)$/;
export function igHandle(v) {
  let s = line(v).replace(/\s+/g, '');
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([^/?#]+)/i.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@+/, '');
  return IG_HANDLE.test(s) ? s.toLowerCase() : '';
}
export const igUrl = h => `https://www.instagram.com/${encodeURIComponent(h)}/`;

// What a fan shows on their seat: a first name or nickname and their Instagram, with
// consent to showing them to the concert's other pass holders.
export function checkFan(d = {}) {
  const name = line(d.name).slice(0, 60);
  if (name.length < 2 || name.length > 40) return { field: 'name', error: 'Please enter the name other fans will see.' };
  const instagram = igHandle(d.instagram);
  if (!instagram) return { field: 'instagram', error: 'Please enter your Instagram username, like @yourname.' };
  if (d.consent !== true) return { field: 'consent', error: 'Please tick the box to show your Instagram to other fans of this concert.' };
  return { fan: { name, instagram } };
}

// The concert's fan group on WhatsApp: an invite link from WhatsApp itself, nothing else.
export const WA_GROUP = /^https:\/\/(?:chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}|(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{10,40})\/?$/;

// FANBASE_WA, set in the dashboard: one invite link for every concert, or JSON with a link
// per concert id and "*" for the rest. Anything that is not a WhatsApp invite is ignored.
export function waGroupFor(setting, eventId) {
  const s = String(setting ?? '').trim();
  if (!s) return '';
  if (WA_GROUP.test(s)) return s;
  try {
    const map = JSON.parse(s);
    if (!map || typeof map !== 'object' || Array.isArray(map)) return '';
    const link = Object.hasOwn(map, eventId) ? map[eventId] : map['*'];
    return typeof link === 'string' && WA_GROUP.test(link.trim()) ? link.trim() : '';
  } catch { return ''; }
}
