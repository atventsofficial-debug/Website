# Atvents

Big concerts in Jakarta, bought on tiket.com, with a 3D view from your seat for everyone who buys through the site.

Atvents does not sell tickets or take payments. Every **Buy on tiket.com** button is an affiliate link, and tiket.com pays a commission on the sales that come through it. Fans who bought that way unlock the view from their seat; everyone else can look round the venue from above. The second side of the site, **For partners**, offers the same seat view to ticketing apps, promoters, venues, travel companies and brands.

## How the site earns

- **Affiliate commission.** tiket.com's affiliate program, run through a network such as Involve Asia, pays on sales made through our links. The fan pays the same price.
- **Seat-view licences.** Per ticket, venue licence and white label, on the partner page (`PLANS` in `js/content.js`), with a demo request form.

## The fan's path

1. **Choose.** `#concerts` lists the shows on sale. Each concert page has its categories and announced prices, and a 3D model of the venue to look round from above.
2. **Buy on tiket.com.** The button opens tiket.com in a new tab through the affiliate link, carrying a random 12-character click id as the sub id. The click is kept on the device for 60 days and recorded on the server.
3. **Unlock 3D.** Back on the site, the fan enters the tiket.com order ID, the email used there, the category and the number of tickets. The pass opens straight away as **Checking**, and so do the concert's seat views: the fan can sit in any seat and mark their own.
4. **Checked against the report.** Affiliate networks report sales by sub id, with no names or order IDs. When the admin imports the network's report, a pass whose clicks show a sale (pending or approved) becomes **Confirmed**; one whose sales were all refused becomes **Closed**, and its seat views lock again. The admin can confirm or close any pass by hand, and imports never undo that.
5. **Other devices.** My 3D passes gives each pass a private link that opens it on another phone or laptop. Unlocking again with the same order ID and email works too.

Why it works this way: tiket.com does not tell affiliates who bought. The sub id in the network's report is the only link between a sale and one of our clicks, so a claim is matched through the clicks saved on the fan's device. The pass opens on trust and is confirmed or closed later.

Rules for a claim (`checkClaim` in `js/rules.js`, the same in the browser and on the server):

- One booking (concert and order ID) opens one pass. The same email again gets the same pass with a new key. Another email is refused, unless that pass was closed; then the booking starts again for the new email.
- 1 to 8 tickets, and consent to the privacy policy.
- Clicks recorded for another concert do not count.
- The key that opens a pass on a device is 24 random bytes. The server keeps only its SHA-256 hash, and the last ten keys of each pass.

The 3D lock is a convenience, not a vault: the venue models are public files. What is protected is the data: passes, emails and order IDs.

## Run it

```bash
# 1. Postgres 14 or newer. For example with Docker:
docker run -d --name seatsight-db -e POSTGRES_USER=seatsight -e POSTGRES_PASSWORD=seatsight -p 5432:5432 postgres:16

# 2. Settings
cp .env.example .env          # DATABASE_URL, ADMIN_TOKEN, AFFILIATE_LINK (see below)

# 3. Start
npm install
npm start                     # http://localhost:8080, creates the tables on first start
```

Needs Node 18 or newer. The only runtime dependency is `pg`. three.js 0.160.0 loads from the jsDelivr CDN.

Without the server (any static hosting of `index.html`), the site runs in **demo mode**: clicks, passes, partner requests and sign-ups are kept in the browser, and `#admin` shows what that browser stored.

### Settings

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres connection string. Required. |
| `ADMIN_TOKEN` | Opens `#admin` and the admin API (`Authorization: Bearer …`). Without it the admin stays closed. In production, at least 24 characters: `openssl rand -hex 24`. |
| `AFFILIATE_LINK` | The tiket.com deeplink from the affiliate network. Empty: the buttons use `affiliateLink` in `js/config.js`, or go straight to tiket.com and earn nothing. |
| `PUBLIC_URL` | The site's address. https in production. |
| `NODE_ENV` | `production` on a live server: turns on the start-up checks below. |
| `PORT` | Default 8080. |
| `TRUST_PROXY` | `true` only behind a reverse proxy you control, so rate limits see the real client address. |

In production the server refuses to start without an `ADMIN_TOKEN` of 24+ characters, with an http `PUBLIC_URL`, or with `RATE_LIMITS=off` (a switch for tests).

## Turning on the affiliate link

Once the affiliate program approves the site, build a tiket.com deeplink in the network's link builder and put these placeholders in it:

| Placeholder | Becomes |
|---|---|
| `{url}` | the concert's tiket.com page (required) |
| `{sub}` | our click id, which the network reports back with each sale (required) |
| `{src}` | the campaign the fan came from (`?src=instagram`), or `site` |
| `{event}` | the concert id |

Involve Asia, for example:

```
https://invol.co/aff_m?offer_id=OFFER&aff_id=AFFILIATE&source=deeplink_generator&url={url}&aff_sub={sub}&aff_sub2={src}&aff_sub3={event}
```

Set it as `AFFILIATE_LINK` on the server, or as `affiliateLink` in `js/config.js` for static hosting. Anything that is not https or lacks `{url}` and `{sub}` is ignored, and the server refuses to start with it. Links out are `target="_blank" rel="noopener sponsored"`.

Then replace each concert's `official.url` in `js/events.js` (a tiket.com search for now) with the show's own tiket.com page, and check one button: it should go through the network and land on that page.

## Confirming passes from the affiliate report

1. In the network's dashboard, export the conversion report as CSV with the sub id and status columns.
2. Open `#admin`, sign in with the admin token, and paste the report or open the file under **Affiliate report**.
3. **Check the report** says how many rows carry one of our click ids, by status, and how many rows were skipped. **Import** stores them and updates the passes.

The sub id column may be called `aff_sub`, `sub_id`, `sub1`, `click_id` or similar; the status column `status` or `conversion status`. Commas, semicolons or tabs all work. Statuses are read loosely: approved, confirmed, paid and similar count as approved; pending, on hold or in review as pending; rejected, declined, cancelled, invalid, refunded or fraud as rejected. The last row for a click wins. Up to 5,000 rows (1 MB) per import; import again any time, it only adds and updates.

A pass is confirmed by a pending sale too: the report shows the fan bought through our link, whether or not the commission is approved yet. Passes nobody can match (a booking made without our link, or on another device) stay **Checking**. After a week or so, confirm or close them by hand in the 3D passes table, where each row shows the order ID, email and click count. The unlock page tells fans we write to them before a pass closes, so email them first.

## Pages

| Hash | Page |
|---|---|
| `#home` | A slide for each show on sale: one concert arena in 3D, seen from the middle of the audience, with that show's poster on the stage screens, and a card with the dates, the price, **Buy on tiket.com** and the concert page. Then how it works, concerts on sale, venues, concert alerts. `#how`, `#venues`, `#news-form` jump to sections |
| `#concerts` | Every concert on sale, with search and sort |
| `#event-<id>` | Concert page: categories and prices, the 3D venue, buy and unlock buttons, show alerts |
| `#seats-<id>`, `#seats-<id>--<category>`, `#seats-<id>@<seat>` | The 3D venue. From above for everyone; seat views with a pass |
| `#demo-<layout>` | Demo venues, fully open: `concert`, `stadium-round`, `stadium-end`, `stadium`, `stadium-tottenham`, `combat`, `combat-studio`, `cinema` |
| `#unlock`, `#unlock-<id>` | Unlock a 3D pass with the tiket.com booking |
| `#passes` | My 3D passes, on this device |
| `#pass-<id>-<key>` | A pass link from another device. Removed from the address bar and history before it is used |
| `#partners` | For partners: why, uses, how it works, live demo, plans, questions, contact form. `#partner-why`, `#partner-uses`, `#partner-how`, `#partner-demo`, `#partner-pricing`, `#partner-faq-sec`, `#partner-contact` jump to sections |
| `#faq`, `#about`, `#contact` | Questions, about us, contact |
| `#privacy`, `#terms`, `#disclosure` | Privacy policy, terms of use, affiliate disclosure |
| `#admin` | Clicks per concert and campaign, the report import, passes, partner requests and sign-ups with CSV export |

The home slides move on every 9 seconds, with arrows, tabs, a swipe or the arrow keys too. They hold while the visitor points at the card or uses the controls, and while the hero is scrolled away or the tab is hidden; the pause button stops them. Visitors who ask for reduced motion get still slides and a play button. Every slide is the same arena (the concert demo) from the same seat; changing slide only puts the next poster on the screens (`SeatScene.setPoster`). The seat is `heroSeat` in `js/layouts.js`: on the hall's centre line, `hero.along` metres from the stage (set per layout), with `hero.look` and `hero.fov` aiming the view at the screens. The picture shifts up so the stage sits in the open part of the hero, between the nav and the card.

The site has two sides, switched with **For fans / For partners** in the nav. The route decides the side, each side has its own menu and call to action, and the last one is remembered. Links from the earlier version of the site (`#events`, `#checkout`, `#tickets`, `#organisers`, `#host`, `#dashboard` and others) land on their nearest page.

Add `?quality=low|medium|high` to force a render quality, and `?src=<campaign>` to any link to count its clicks per campaign.

## API

| Route | Rate limit per client | |
|---|---|---|
| `GET /api/config` | 600/min | `{ mode, affiliateLink }` |
| `POST /api/clicks` | 120/min | `{ id, eventId, src }`: a click out to tiket.com |
| `POST /api/claims` | 10 per 10 min | `{ eventId, cat, qty, orderRef, email, consent, clicks }` → the pass and its key. 409 when another email holds the booking |
| `GET /api/claims/:id` | 120/min | The pass, for the key in `x-pass-token`. Any mismatch is a 404 |
| `POST /api/subscribe` | 10 per 10 min | `{ kind: 'newsletter' \| 'alerts', email, eventId? }` |
| `POST /api/partners` | 5 per 10 min | `{ name, company, email, phone?, website?, kind, volume?, message?, consent }` |
| `GET /api/admin/summary` | 60/min | Clicks per concert (all time and 30 days) and campaign, passes by status, counts |
| `GET /api/admin/claims` | 60/min | The latest 2,000 passes |
| `POST /api/admin/claims/:id` | 60/min | `{ status: 'checking' \| 'confirmed' \| 'rejected' }` |
| `POST /api/admin/conversions` | 60/min | `{ rows: [{ sub, status }] }`, up to 5,000 rows |
| `GET /api/admin/leads`, `GET /api/admin/subscribers` | 60/min | Partner requests, sign-ups |

Errors are `{ error, field? }` with a 4xx status. With several server instances, add rate limits at the proxy too.

## Data

`server/schema.sql`, created on start (everything is `IF NOT EXISTS`):

- `clicks`: click id, concert, campaign, time. No IP address or other personal data.
- `claims`: the passes. Booking (concert and order ID, unique), email, category, tickets, click ids, key hashes, status.
- `conversions`: the network's verdict per click id, from the imported reports.
- `partner_leads`: demo requests from the partner page.
- `subscribers`: concert alerts (`newsletter`) and one-show alerts (`alerts`).

Tables from the earlier version, which sold tickets itself, are left alone on databases that have them.

## Structure

```
index.html              every view, the icons and the import map
css/styles.css          design tokens and layout
assets/covers/          renders of each venue's 3D model, 1280 px and 640 px
assets/events/          concert artwork (promoters' posters), 3:2

js/                     front end, plain ES modules
  app.js                boot, routing, the two sides
  hero.js               the home page's slides: each show's venue in 3D and its card
  pages.js              home, concerts, concert page, unlock, my passes, questions
  partners.js           the partner page
  admin.js              the admin page
  viewer.js             the 3D venue page: the locked peek, seat views, marking your seat
  passes.js             buy links and click ids, the pass wallet on this device
  store.js              LocalStore (demo, in the browser) and ApiStore (the server)
  rules.js              checks and formats shared by the browser and the server
  content.js            questions, partner uses and plans
  events.js             concerts and demo venues: dates, categories, prices, branding
  layouts.js            venue templates: seat positions and categories
  venues3d.js, scene3d.js   3D venues, lighting, picking, camera moves
  media.js              cover images: a concert's own artwork, otherwise its venue's render
  when.js               the venue's clock in the fan's time zone
  picker.js             dropdowns (keyboard and screen readers too)
  ui.js                 shared state and DOM helpers
  config.js             brand, contact details, affiliate link for static hosting

server/                 API and static files, all state in Postgres
  server.mjs            entry point
  app.mjs               routes and wiring
  store.mjs             the records: clicks, passes, the report, requests, sign-ups
  http.mjs              JSON bodies, security headers, rate limits, admin auth, static files
  config.mjs            settings and start-up checks
  db.mjs, schema.sql    pool, transactions, schema

scripts/build-preview.mjs   dist/preview.html for hosts that wrap the page in their own document
test/                   api.test.mjs (Postgres), venues.test.mjs, when.test.mjs
```

## Adding a concert

Copy an entry in `EVENTS` (`js/events.js`):

- `id` starting with `evt-`, `venue` (a layout from `js/layouts.js`) and `place` (the real venue).
- `dateISO`, `time`, `doors` on the venue's clock; `'TBA'` for anything not announced.
- `cats` with each category's announced price, and `zone(seat)` to map the layout's blocks to them; `soldOut` for categories that sold out.
- `official.url`: the show's tiket.com page.
- `image`: the artwork in `assets/events/` (480 × 320 JPEG) with a line in `IMAGES` in `js/media.js`. It shows on the cards, on the concert page and on the stage screens in 3D; without one the cards show the venue render and the screens the tour name.

Past concerts drop off the lists a day after the show and stay in the catalogue, so passes still open. Update `LISTED` when you refresh the list.

## Keeping it light

- Pages render first. three.js (the minified build) and the 3D viewer load only when the home hero or a venue needs them, and the concert page fetches them ahead of time.
- Shaders compile in the background where the browser supports it, so the page never freezes on the first 3D frame.
- The home hero builds its arena once, at medium quality at most and 30 fps, and pauses while scrolled out of view. A new slide only redraws the screens' artwork and frees the last one from the GPU. Visitors with Save-Data on see the show's poster instead, over a blurred copy of itself.
- The 3D venue caps at 60 fps and 1.5x pixel density, and steps its quality down when frames run 30% over budget.
- The cinema's area-light tables (about 300 KB) load only when a cinema opens.
- Cards use 640 px renders; the 1280 px files are only for page backdrops. Concert artwork is about 100 KB in all.
- The menu, dropdowns and hero slides animate with CSS transitions (opacity and transform only), and stand still for visitors who ask for reduced motion.

## Tests

```bash
TEST_DATABASE_URL=postgres://seatsight:seatsight@localhost/seatsight_test npm test
```

The test database's tables are wiped at the start. 36 tests:

- Config: a malformed affiliate link is refused and a valid one reaches the page; production refuses a short admin token, http and no rate limits.
- Clicks: stored once, without personal data; unknown concerts and demo venues refused.
- Claims: the key stored only as a hash; one booking one pass; the same email gets the same pass with a new key; another email refused; a closed pass frees the booking; 12 claims at once on one booking make one pass with ten keys; bad claims name the field; clicks for another concert dropped.
- The report: confirms and closes passes, duplicate rows, bad reports refused whole, size limits, manual decisions kept.
- Admin: every admin route needs the token, checked before the body is read, and stays closed when no token is set; the summary's counts.
- Partner requests, sign-ups, body rules (415, 400, 413, 404, 405), rate limits, cross-site POSTs, security headers, the static allow-list, no personal data in logs.
- The demo store in the browser gives the same answers as the server.
- Venues: unique seat ids and known categories everywhere, every concert linked to tiket.com with every category priced, demos for every layout, seat counts, the home hero's seat on each concert's centre line.
- Time zones: the venue's clock read from Jakarta, Singapore and London, daylight saving, shows without times, times after midnight.

## Security

- Secrets only in the environment. Production start-up checks as above.
- Every input is checked and length-capped by the same rules in the browser and on the server. Bodies over 32 KB are refused (the report import: 1 MB, read only after the admin token is checked), and so are POSTs that are not JSON.
- Queries are parameterised. Output in the browser is escaped.
- Pass keys are random, stored only as hashes, compared in the database, and sent in a header, not the URL. Wrong id or wrong key: the same 404.
- The admin token is compared in constant time and checked before the body is read. No token set: the admin stays closed.
- Cross-site POSTs are refused by an Origin check. The API uses no cookies.
- Headers: Content-Security-Policy with no inline scripts (the import map is allowed by its hash) and scripts from elsewhere only from the three.js folders the import map names; `nosniff`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, COOP and CORP same-origin, HSTS on https.
- Only `index.html`, `css/`, `js/`, `assets/` and `favicon.ico` are served. Server code, `.env`, tests and `node_modules` are not.
- Request logs hold method, path, status and time only. Bodies (emails, order IDs, phone numbers) are never logged.
- `npm audit`: 0 vulnerabilities.

## Before going live

- **Affiliate program.** Approval, then the deeplink (above) and each concert's own tiket.com page.
- **Brand and contacts** in `js/config.js`; the name also appears in `index.html` (title and meta).
- **Legal pages.** Privacy policy, terms and affiliate disclosure are templates written for Indonesia's Personal Data Protection Law (UU 27/2022). Have a lawyer check them, with your company's name and address.
- **Keeping data only as long as the policy says.** Once a concert is twelve months past, delete its records:

  ```sql
  DELETE FROM claims WHERE event_id = 'evt-…';
  DELETE FROM clicks WHERE event_id = 'evt-…';
  DELETE FROM conversions c WHERE NOT EXISTS (SELECT 1 FROM clicks k WHERE k.id = c.sub);
  ```

  Partner requests: two years after the last contact. Alert sign-ups: until the person leaves the list, so send alerts from an email service with an unsubscribe link (Brevo, Mailjet), using the CSV from `#admin`.
- **Artwork.** The concert covers are the promoters' posters, cropped from their listings. Use the files from their media kits, with permission.
- **Hosting.** Postgres with backups (managed Postgres or Supabase; use the direct connection string), https, `NODE_ENV=production`, rate limits at the proxy, and `TRUST_PROXY=true` behind it.
- **The report.** Import it at least weekly, and settle the passes still checking by hand.

## The earlier version

Version 0.1 sold tickets itself: seat holds, checkout and Midtrans payments, e-tickets and an organiser dashboard. It is kept as `seatsight-v14-own-checkout.zip` in the project files.
