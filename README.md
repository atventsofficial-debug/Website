# Atvents

Big concerts in Jakarta, bought on tiket.com, with a 3D view from your seat for everyone who buys through the site.

Atvents does not sell tickets or take payments. Every **Buy on tiket.com** button is an affiliate link, and tiket.com pays a commission on the sales that come through it. Fans who bought that way unlock the view from their seat; everyone else can look round the venue from above. The second side of the site, **For partners**, offers the same seat view to ticketing apps, promoters, venues, travel companies and brands.

## The flow since November 2026

- **One way into the seat view: payment.** On `#unlock` the fan picks the concert, category, section, row and seat, adds their name and email, and pays the access fee (`ACCESS_FEE` in `js/order.js`, Rp25.000). The pass opens as soon as the payment is marked paid. There is no more free unlock through our tiket.com links and no e-ticket upload.
- **Payments go through Midtrans** (see [Payments](#payments-midtrans)): the fan picks a way to pay on the site (QRIS, GoPay, ShopeePay, bank transfer, card, Alfamart or Indomaret), a small Worker in front of the static site makes the order, the page shows what to pay with in its own design (the card in Midtrans' own form, inside the page), and the pass email goes out once it is paid. Until its server key is set, the site shows the preview sheet that charges nothing (`LocalStore.pay` / `payDemo`); with a Sandbox key, only devices that opened `#paytest` pay, in the Sandbox.
- **The Node server (`server/`) still has the old claim rules** (order ID, e-ticket) and is not deployed. On Cloudflare run the static front end and the payment Worker (`worker/`); clicks, sign-ups and partner requests still stay in the visitor's browser there.
- **Concert updates** on the home page (`concertNews` in `js/pages.js`) are built from `js/events.js`: sales opening, shows coming up, sold-out categories.
- **Footage** (`#footage`) is a coming-soon page with a waiting list (`kind: 'footage'` sign-ups). Nothing can be bought there yet.
- **Brand**: the Arena emblem lockup, Inter everywhere, and the Backstage / Ember / Flame / Amber / Spotlight / Paper palette (last block of `css/styles.css`).

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

## Payments (Midtrans)

The fan pays without leaving the site, the way a ticket shop's checkout works: they pick a way to pay from the site's own list, with each one's logo, and the page shows what to pay with. Midtrans handles the payment itself, so no card, wallet or bank details touch the site.

The ways to pay are listed once, in `js/paymethods.js`, which the page and the Worker both read: QRIS, GoPay, ShopeePay (on phones only: it pays in its app), virtual accounts at BCA, Mandiri (bill payment), BNI, BRI, Permata and CIMB Niaga, credit and debit cards, Alfamart and Indomaret. Every way but the card is a Midtrans Core API charge: Midtrans answers at once with the account number, the bill key, the QR code or the store code, and the page shows it with the steps to pay. The card goes through Midtrans' own card form (Snap, `enabled_payments: ['credit_card']`), embedded in the page, so card numbers never touch the site. The logos are Midtrans' logo kit for merchants ([github.com/veritrans/logo](https://github.com/veritrans/logo)), trimmed and shrunk into `assets/pay/`. The checkout lays them out like a ticket shop's: the ways in groups that fold, one radio each, on light cards; the order beside them with the total and one Pay button (on a phone, the order in a line on top and Pay pinned to the bottom of the screen).

1. **Unlock.** The fan picks the concert and seat and adds their name and email, then picks a way to pay. The page sends all of it to `POST /api/payments`. The Worker (`worker/index.mjs`) checks it like `checkClaim` does (seats from `worker/catalog.json`, written by the build; the way to pay must be one that is switched on), makes the order at `ACCESS_FEE` (the browser cannot change the amount), open for `PAY_MINUTES` (60), saves it in the order book, and answers with what to pay with (or the card form's token) and a signed pass key. What Midtrans answers is checked before it reaches the page (`payDetails`): numbers are digits, the QR code an image on Midtrans' API host, the app link GoPay's own scheme or ShopeePay's address. The pass waits on the device as *Waiting for payment*.
2. **Checkout** (`#paid-<order id>`). The order, a clock for the hour, and what to pay with: the number with a copy button and the bank's steps, the QR code (on a phone, GoPay and ShopeePay open their app instead), the store code, or the card form (`js/snap.js` loads Midtrans' `snap.js` and embeds it). The page asks `GET /api/passes/<id>` (key in the `x-pass-token` header), which asks Midtrans' status API: settled opens the pass at once ("You're in"), pending keeps asking (every 5 seconds for a QR code or an app, 10 otherwise, and at once on *I have paid* or when the fan comes back to the tab), failed, expired or refunded closes it. *Choose another way* first asks `POST /api/passes/<id>/cancel`, which has Midtrans close the order so its number or code stops taking money; an order paid in the meantime opens its pass instead. If the card form cannot load, the fan pays on Midtrans' own page, which sends them back through `/pay/done`. A reload or another visit to `#paid-<id>` opens the same checkout again.
3. **Notification.** Each order tells Midtrans to report to `/api/midtrans/notify` (header `X-Append-Notification`, so nothing needs setting in the dashboard). The Worker checks Midtrans' SHA-512 signature, reads the status again from Midtrans, and updates the order book.
4. **The email.** Once an order is paid, from the notification or from the page asking, whichever comes first, the Worker sends the pass email (`worker/mail.mjs`, through Resend). It looks like the site: the concert's poster on top, then the pass as a paper ticket with the concert, date, venue, category, seat, name, the way it was paid and the amount, a button that opens the pass on any phone or laptop (`#pass-<id>-<key>`), and the three steps of the seat tour. The poster and the logo are JPEG and PNG copies in `assets/mail/` (`scripts/mail-art.py`), as not every mail app shows WebP or SVG; the build lets any site show that folder's files (the rest of the site's files keep CORP same-origin). The order book takes each email once, so it is never sent twice; if Resend fails, the next notification or check tries again.
5. **The order book** is D1 (`worker/orders.mjs`, binding `DB`, database `atvents-orders`): one row per order with the buyer's name and email, the seat, the status, and when it was paid and emailed. Cloudflare makes the database on the first deploy and the Worker makes the table on first use. Midtrans keeps the payment; look orders up in either by id (`PAY-…`). The pass key carries the order id, concert, category and seat with an HMAC derived from the server key, so a new server key retires earlier keys (passes already open on a device stay open there).

Switching it on, in the Cloudflare dashboard (Workers, `website`, Settings, Variables and Secrets):

| Name | Type | |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | **Secret** | From Midtrans: Settings, Access keys. `SB-Mid-server-…` is the Sandbox, where nothing is charged; `Mid-server-…` is production. Set it as a Secret: a plain variable is visible in the dashboard. |
| `MIDTRANS_CLIENT_KEY` | plain text | From the same page (Client Key: `SB-Mid-client-…` or `Mid-client-…`; newer Sandbox accounts have no `SB-`), the same environment as the server key. A Sandbox one is left out in production. It is public: the page needs it to open the form inside the site. Without it, the fan pays on Midtrans' page and comes back. |
| `RESEND_API_KEY` | **Secret** | From resend.com (API Keys, sending access). Without it, no email goes out; the pass still opens on the device that paid. |
| `MIDTRANS_SIGNATURE_KEY` | **Secret**, optional | From the same page (Signature Secret Key). Once a server key has been made on Midtrans' newer Access keys page, Midtrans signs its notifications with this key instead of the server key; without it those notifications are refused and the pass email waits until the fan's page asks again. |
| `MIDTRANS_ENV` | optional | `sandbox` or `production`, only if the key's prefix does not say which. |
| `MIDTRANS_METHODS` | optional | The ways to pay the checkout lists, by id, comma-separated (`qris,gopay,bca,mandiri,bni,bri,card,alfamart`): only the channels switched on in the Midtrans dashboard. Unknown ids are left out; without it, or with no id the checkout knows, all of them. |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | optional | The sender (default `Atvents <pass@atvents.com>`) and the reply address (default `halo@atvents.com`). |

- **Email domain.** In Resend, add `atvents.com` as a domain and put the DNS records it shows (DKIM and the `send` subdomain's SPF and MX) in Cloudflare DNS. They do not touch the existing mail for `halo@atvents.com`. Resend's free plan sends 3,000 emails a month, 100 a day.
- **Sandbox.** With a Sandbox key, visitors still see the preview. Open `https://atvents.com/#paytest` on your own device to pay in the Sandbox (Midtrans' simulator pays the test orders); `#paytest-off` ends it.
- **Production.** Once Midtrans approves the business, replace both keys with the production ones. Every visitor then pays for real.
- **Channels.** Each way to pay must be switched on in the Midtrans dashboard (Settings, Payment). One that is not answers *not open right now* and the fan picks another; list only the open ones in `MIDTRANS_METHODS`.
- In the Midtrans dashboard you may also set the Finish, Unfinish and Error redirect URLs to `https://atvents.com/pay/done`, used when the form cannot open inside the page. Its "Test notification URL" button sends an unsigned sample, which the Worker refuses (401): that is expected.

Run it locally with `npm run dev` (`wrangler dev`, with the key in `.dev.vars`, which git ignores).

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
assets/events/card/     the same artwork at 5:7, the shape of a ticket card
assets/mail/            the pass email's pictures: each concert's 3:2 artwork as JPEG, the logo as PNG
assets/pay/             the payment logos (Midtrans' logo kit for merchants)

js/                     front end, plain ES modules
  app.js                boot, routing, the two sides
  hero.js               the home page's slides: each show's venue in 3D and its card
  pages.js              home, concerts, concert page, unlock, my passes, questions
  partners.js           the partner page
  admin.js              the admin page
  viewer.js             the 3D venue page: the locked peek, seat views, marking your seat
  passes.js             buy links and click ids, the pass wallet on this device
  store.js              LocalStore (demo, in the browser), PayStore (with Midtrans) and ApiStore (the server)
  rules.js              checks and formats shared by the browser and the server
  order.js              the pass's price, order id and payment window, and the buyer check, shared with the Worker
  paymethods.js         the ways to pay and how what Midtrans answers is checked, shared with the Worker
  snap.js               Midtrans' payment form inside the checkout
  content.js            questions, partner uses and plans
  events.js             concerts and demo venues: dates, categories, prices, branding
  layouts.js            venue templates: seat positions and categories
  venues3d.js, scene3d.js   3D venues, lighting, picking, camera moves
  media.js              cover images: a concert's own artwork, otherwise its venue's render
  when.js               the venue's clock in the fan's time zone
  picker.js             dropdowns (keyboard and screen readers too)
  ui.js                 shared state and DOM helpers
  config.js             brand, contact details, affiliate link for static hosting

worker/                 the Cloudflare Worker: Midtrans payments for 3D passes (wrangler.jsonc)
  index.mjs             routes: /api/config, /api/payments, /api/passes/<id>, /api/passes/<id>/cancel, /api/midtrans/notify, /pay/done
  midtrans.mjs          the Core API charge for each way to pay, Snap for the card, the status and cancel APIs, notification signatures, and what a status means for a pass
  orders.mjs            the order book in D1: each order once, each pass email once
  mail.mjs              the pass email, sent through Resend
  passkey.mjs           signed pass keys
  catalog.mjs           seat lookups in catalog.json (built by scripts/worker-catalog.mjs, not in git)

server/                 API and static files, all state in Postgres
  server.mjs            entry point
  app.mjs               routes and wiring
  store.mjs             the records: clicks, passes, the report, requests, sign-ups
  http.mjs              JSON bodies, security headers, rate limits, admin auth, static files
  config.mjs            settings and start-up checks
  db.mjs, schema.sql    pool, transactions, schema

scripts/build-site.mjs      site/ for Cloudflare, and worker/catalog.json
scripts/worker-catalog.mjs  the concerts and seats the Worker checks orders against
scripts/build-preview.mjs   dist/preview.html for hosts that wrap the page in their own document
scripts/event-art.py        a concert's 3:2 and 5:7 artwork from its poster (Pillow)
scripts/mail-art.py         the JPEG copies of the 3:2 artwork for the pass email (Pillow)
test/                   api.test.mjs (Postgres), pay.test.mjs, venues.test.mjs, when.test.mjs
```

## Adding a concert

Copy an entry in `EVENTS` (`js/events.js`):

- `id` starting with `evt-`, `venue` (a layout from `js/layouts.js`) and `place` (the real venue).
- `dateISO`, `time`, `doors` on the venue's clock; `'TBA'` for anything not announced.
- `cats` with each category's announced price, and `zone(seat)` to map the layout's blocks to them; `soldOut` for categories that sold out.
- `official.url`: the show's tiket.com page.
- `image`: the artwork, with a line in `IMAGES` in `js/media.js`: a 3:2 file in `assets/events/` (1200 px wide with a 640 px copy, or one 480 px file) for the concert page and the stage screens in 3D, and a 5:7 file in `assets/events/card/` (800 px wide with a 480 px copy) for the ticket cards. A poster of another shape goes in whole, over a blurred copy of itself: `scripts/event-art.py` draws both files from the poster. Then run `python3 scripts/mail-art.py` for the pass email's copy. Without one the cards show the venue render and the screens the tour name, and the email has no poster.

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

The test database's tables are wiped at the start. 58 tests:

- Config: a malformed affiliate link is refused and a valid one reaches the page; production refuses a short admin token, http and no rate limits.
- Clicks: stored once, without personal data; unknown concerts and demo venues refused.
- Claims: the key stored only as a hash; one booking one pass; the same email gets the same pass with a new key; another email refused; a closed pass frees the booking; 12 claims at once on one booking make one pass with ten keys; bad claims name the field; clicks for another concert dropped.
- The report: confirms and closes passes, duplicate rows, bad reports refused whole, size limits, manual decisions kept.
- Admin: every admin route needs the token, checked before the body is read, and stays closed when no token is set; the summary's counts.
- Partner requests, sign-ups, body rules (415, 400, 413, 404, 405), rate limits, cross-site POSTs, security headers, the static allow-list, no personal data in logs.
- The demo store in the browser gives the same answers as the server.
- Venues: unique seat ids and known categories everywhere, every concert linked to tiket.com with every category priced, demos for every layout, seat counts, the home hero's seat on each concert's centre line.
- Time zones: the venue's clock read from Jakarta, Singapore and London, daylight saving, shows without times, times after midnight.
- Payments (`pay.test.mjs`, Midtrans and Resend played by stand-ins, D1 by SQLite in memory): off until the key is set; `MIDTRANS_METHODS`; the client key, never a Sandbox one in production; the card's Snap order (card form only) and every other way's Core API charge at the fee whatever the browser sends, open for an hour, with the notification address, and what the page gets to pay with; ways switched off or unknown; a channel Midtrans refuses (409) and answers the page cannot safely show (502); closing an order for another way, an order paid before it could close, an order Midtrans would not close, and who may close one; the same field errors as the page; concerts that are over; origin, JSON and size rules; rate limits; Snap errors logged without the key; settled, pending, challenged, failed and refunded payments; wrong amounts; unpaid orders closing; forged, swapped and old-key pass keys; notifications refused without Midtrans' signature (the signature key's or the server key's) and checked again with Midtrans; keys from the newer Access keys page, with a '~'; the pass email sent once, from the notification or the page, with a link that opens that pass, the concert's poster, the way it was paid and the buyer's name escaped; a failed email tried again; payments working without the order book or the email key; the way back from Midtrans; the Worker's seat list equal to every venue's seats.

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
- Payments: the Midtrans server key and the Resend key are Cloudflare Secrets, sent only to Midtrans and Resend and never logged. The amount is set by the Worker. Pass keys are HMAC-signed and checked in constant time; Midtrans' notifications count only with their SHA-512 signature, and the status is read again from Midtrans before anything changes. The static site's CSP allows scripts and frames from Midtrans' two app hosts only, and images (the QR codes) from its two API hosts (the Node server's allows none); the browser is sent only to Midtrans' own payment page. What Midtrans answers a charge with is checked before the page shows it: digits for numbers, Midtrans' API host for QR codes, GoPay's scheme or ShopeePay's address for app links. Choosing another way to pay closes the old order at Midtrans first, so one pass is never paid twice. Orders and checks are rate-limited per address; orders must come from the site's own origin. The pass email escapes everything the buyer typed and goes only to the buyer, once.
- `npm audit`: 0 vulnerabilities.

## Before going live

- **Affiliate program.** Approval, then the deeplink (above) and each concert's own tiket.com page.
- **Midtrans.** Business approval, then the production server and client keys (see Payments).
- **Email.** A Resend account, `atvents.com` verified there, and `RESEND_API_KEY` (see Payments). Until then the pass opens only on the device that paid (and through Copy pass link).
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
