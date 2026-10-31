// The server's records in Postgres: clicks out to tiket.com, 3D passes, the affiliate
// network's verdicts, partner requests and sign-ups. Same methods and outcomes as
// LocalStore in js/store.js, which keeps the same records in one browser for the demo,
// and the same checks (js/rules.js).
import crypto from 'node:crypto';
import { tx } from './db.mjs';
import { HttpError, sha256 } from './http.mjs';
import { checkClick, checkClaim, checkSubscription, checkLead, checkConversions, passStatus, PASS_STATUSES, MAX_CLICKS, TAKEN } from '../js/rules.js';

const PASS_ID = /^P-[A-Z0-9]{4,20}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
// Keys kept per pass: one for each time the fan unlocked it, so each device keeps working.
// The oldest is let go first.
const MAX_KEYS = 10;

const newId = prefix => `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
const keyHash = token => sha256(token).toString('hex');
const valid = r => { if (r.error) throw new HttpError(400, r.error, { field: r.field }); return r; };
const passOut = p => ({ id: p.id, eventId: p.event_id, cat: p.cat, qty: p.qty, status: p.status, createdAt: p.created_at.toISOString() });

// A pass's status from the network's verdicts on its clicks.
async function statusOf(q, clickIds) {
  if (!clickIds.length) return 'checking';
  const { rows } = await q.query('SELECT status FROM conversions WHERE sub = ANY($1)', [clickIds]);
  return passStatus(rows.map(r => r.status));
}

export function createStore(pool) {
  return {
    async click(d) {
      const c = checkClick(d);
      if (!c) throw new HttpError(400, 'Unknown click');
      await pool.query('INSERT INTO clicks (id, event_id, src) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [c.id, c.eventId, c.src]);
      return { ok: true };
    },

    // One booking opens one pass (see checkClaim). Every claim returns a new key to it.
    async claim(d) {
      const { claim: c } = valid(checkClaim(d));
      const token = crypto.randomBytes(24).toString('base64url'), key = keyHash(token);
      const pass = await tx(pool, async q => {
        // A click recorded for another concert does not count for this one.
        const { rows: elsewhere } = await q.query('SELECT id FROM clicks WHERE id = ANY($1) AND event_id <> $2', [c.clicks, c.eventId]);
        const clicks = c.clicks.filter(id => !elsewhere.some(r => r.id === id));
        const fresh = [newId('P'), c.email, c.cat, c.qty, clicks, [key]];
        let { rows: [p] } = await q.query(
          `INSERT INTO claims (id, email, cat, qty, click_ids, token_hashes, event_id, order_ref) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (event_id, order_ref) DO NOTHING RETURNING *`, [...fresh, c.eventId, c.orderRef]);
        if (!p) {
          ({ rows: [p] } = await q.query('SELECT * FROM claims WHERE event_id = $1 AND order_ref = $2 FOR UPDATE', [c.eventId, c.orderRef]));
          if (p.email === c.email) {
            ({ rows: [p] } = await q.query('UPDATE claims SET click_ids = $2, token_hashes = $3, updated_at = now() WHERE id = $1 RETURNING *',
              [p.id, [...new Set([...p.click_ids, ...clicks])].slice(-MAX_CLICKS), [...p.token_hashes, key].slice(-MAX_KEYS)]));
          } else if (p.status === 'rejected') {
            // A closed pass no longer holds the booking: it starts again for this email.
            ({ rows: [p] } = await q.query(
              `UPDATE claims SET id = $2, email = $3, cat = $4, qty = $5, click_ids = $6, token_hashes = $7, status = 'checking',
               created_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [p.id, ...fresh]));
          } else throw new HttpError(409, TAKEN);
        }
        // A report imported earlier may already cover these clicks.
        const s = p.status === 'checking' ? await statusOf(q, p.click_ids) : p.status;
        if (s !== p.status) ({ rows: [p] } = await q.query('UPDATE claims SET status = $2, updated_at = now() WHERE id = $1 RETURNING *', [p.id, s]));
        return p;
      });
      return { ...passOut(pass), token };
    },

    // A pass, for a device holding one of its keys. Anything else is "not found", so the
    // answer never tells whether a pass id exists.
    async claimStatus(id, token) {
      if (!PASS_ID.test(id) || !TOKEN.test(token)) throw new HttpError(404, 'Pass not found');
      const { rows: [p] } = await pool.query('SELECT * FROM claims WHERE id = $1 AND $2 = ANY(token_hashes)', [id, keyHash(token)]);
      if (!p) throw new HttpError(404, 'Pass not found');
      return passOut(p);
    },

    async subscribe(d) {
      const { subscription: s } = valid(checkSubscription(d));
      await pool.query('INSERT INTO subscribers (email, kind, event_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [s.email, s.kind, s.eventId]);
      return { ok: true };
    },

    async partnerLead(d) {
      const { lead: l } = valid(checkLead(d));
      const id = newId('L');
      await pool.query(
        `INSERT INTO partner_leads (id, name, company, email, phone, website, kind, volume, message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, l.name, l.company, l.email, l.phone, l.website, l.kind, l.volume, l.message]);
      return { ok: true, id };
    },

    // ---------- admin

    // Per concert: clicks (all time and the last 30 days) and passes by status. Per campaign
    // source: clicks. And how many partner requests and sign-ups there are.
    async summary() {
      const [clicks, passes, sources, counts] = await Promise.all([
        pool.query(`SELECT event_id, count(*)::int AS clicks, (count(*) FILTER (WHERE created_at > now() - interval '30 days'))::int AS clicks30
                    FROM clicks GROUP BY event_id`),
        pool.query('SELECT event_id, status, count(*)::int AS n FROM claims GROUP BY event_id, status'),
        pool.query('SELECT src, count(*)::int AS clicks FROM clicks GROUP BY src ORDER BY clicks DESC, src LIMIT 100'),
        pool.query('SELECT (SELECT count(*) FROM partner_leads)::int AS leads, (SELECT count(*) FROM subscribers)::int AS subscribers'),
      ]);
      const events = {};
      const row = id => (events[id] ||= { eventId: id, clicks: 0, clicks30: 0, checking: 0, confirmed: 0, rejected: 0 });
      for (const r of clicks.rows) Object.assign(row(r.event_id), { clicks: r.clicks, clicks30: r.clicks30 });
      for (const r of passes.rows) row(r.event_id)[r.status] = r.n;
      return { events: Object.values(events), sources: sources.rows, ...counts.rows[0] };
    },

    async claims() {
      const { rows } = await pool.query(
        'SELECT id, event_id, order_ref, email, cat, qty, click_ids, status, created_at FROM claims ORDER BY created_at DESC LIMIT 2000');
      return rows.map(r => ({ ...passOut(r), orderRef: r.order_ref, email: r.email, clicks: r.click_ids }));
    },

    // The admin confirms or closes a pass by hand. Imports never change it after that.
    async setClaim(id, status) {
      if (!PASS_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
      const r = PASS_ID.test(id) ? await pool.query('UPDATE claims SET status = $2, updated_at = now() WHERE id = $1', [id, status]) : { rowCount: 0 };
      if (!r.rowCount) throw new HttpError(404, 'Claim not found');
      return { ok: true };
    },

    // The network's conversion report, as rows of { sub, status }. Passes still being checked
    // whose clicks it covers are confirmed or closed.
    async importConversions(list) {
      const rows = checkConversions(list);
      if (!rows) throw new HttpError(400, 'The report has rows without a click id or status.');
      // The last row for a click wins, as when the report is read top to bottom.
      const latest = new Map(rows.map(r => [r.sub, r.status]));
      const subs = [...latest.keys()];
      return tx(pool, async q => {
        await q.query(
          `INSERT INTO conversions (sub, status) SELECT * FROM unnest($1::text[], $2::text[])
           ON CONFLICT (sub) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`, [subs, [...latest.values()]]);
        const { rows: open } = await q.query(`SELECT id, click_ids FROM claims WHERE status = 'checking' AND click_ids && $1::text[] FOR UPDATE`, [subs]);
        let confirmed = 0, rejected = 0;
        for (const p of open) {
          const s = await statusOf(q, p.click_ids);
          if (s === 'checking') continue;
          await q.query('UPDATE claims SET status = $2, updated_at = now() WHERE id = $1', [p.id, s]);
          if (s === 'confirmed') confirmed++;
          else rejected++;
        }
        return { imported: rows.length, confirmed, rejected };
      });
    },

    async leads() {
      const { rows } = await pool.query(
        'SELECT id, name, company, email, phone, website, kind, volume, message, created_at FROM partner_leads ORDER BY created_at DESC LIMIT 1000');
      return rows.map(({ created_at: at, ...r }) => ({ ...r, createdAt: at.toISOString() }));
    },

    async subscribers() {
      const { rows } = await pool.query('SELECT email, kind, event_id, created_at FROM subscribers ORDER BY id DESC LIMIT 5000');
      return rows.map(r => ({ email: r.email, kind: r.kind, eventId: r.event_id, createdAt: r.created_at.toISOString() }));
    },
  };
}
