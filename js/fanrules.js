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

// FANBASE_WA, set in the dashboard: the WhatsApp links a paid pass gets. One invite link is
// the Atvents members' community, for every concert. JSON gives a link per concert id, the
// artist's fanbase group, and "*" for the community:
//   {"*": "https://chat.whatsapp.com/<community>", "evt-boyz2men-dewa19": "https://chat.whatsapp.com/<group>"}
// Anything that is not a WhatsApp invite is ignored. { group, community }, each '' when unset.
export function waLinksFor(setting, eventId) {
  const s = String(setting ?? '').trim(), ok = v => (typeof v === 'string' && WA_GROUP.test(v.trim()) ? v.trim() : '');
  if (!s) return { group: '', community: '' };
  if (WA_GROUP.test(s)) return { group: '', community: s };
  try {
    const map = JSON.parse(s);
    if (!map || typeof map !== 'object' || Array.isArray(map)) return { group: '', community: '' };
    const group = Object.hasOwn(map, eventId) ? ok(map[eventId]) : '';
    const community = ok(map['*']);
    return { group, community: community === group ? '' : community };
  } catch { return { group: '', community: '' }; }
}

// Only the links that are set, for a pass's JSON; null when there are none.
export function waOf(setting, eventId) {
  const { group, community } = waLinksFor(setting, eventId);
  return group || community ? { ...(group ? { group } : {}), ...(community ? { community } : {}) } : null;
}

// One seat shows one Instagram: the first fan to put theirs on a seat keeps it.
export const SEAT_TAKEN = 'Another fan already shows their Instagram on this seat. One seat shows one Instagram. If this is your seat, write to us at halo@atvents.com.';
