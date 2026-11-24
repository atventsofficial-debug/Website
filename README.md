# Atvents

Big concerts in Jakarta, bought on tiket.com, with a 3D view from your seat for everyone who buys through the site.

Atvents does not sell tickets or take payments. Every **Buy on tiket.com** button is an affiliate link, and tiket.com pays a commission on the sales that come through it. Fans who bought that way unlock the view from their seat; everyone else can look round the venue from above. The second side of the site, **For partners**, offers the same seat view to ticketing apps, promoters, venues, travel companies and brands.

## The flow since November 2026

- **One way into the seat view: payment.** On `#unlock` the fan picks the concert, category, section, row and seat, adds their name and email, and pays the access fee (`ACCESS_FEE` in `js/order.js`, Rp25.000). The pass opens as soon as the payment is marked paid. There is no more free unlock through our tiket.com links and no e-ticket upload.
- **Payments go through Midtrans** (see [Payments](#payments-midtrans)): the fan picks a way to pay on the site (QRIS, GoPay, ShopeePay, bank transfer, card, Alfamart or Indomaret), a small Worker in front of the static site makes the order, the page shows what to pay with in its own design (the card in Midtrans' own form, inside the page), and the pass email goes out once it is paid. Until its server key is set, the site shows the preview sheet that charges nothing (`LocalStore.pay` / `payDemo`); with a Sandbox key, only devices that opened `#paytest` pay, in the Sandbox.
- **One back end: the Worker.** The live site is the static front end (`site/`) and the payment Worker (`worker/`) on Cloudflare, with D1 for orders and seat mates. The old Node server with Postgres (`server/`), built for the free unlock with a tiket.com order ID, was retired in November 2026. Clicks, sign-ups and partner requests stay in the visitor's browser.
- **Concert updates** on the home page (`concertNews` in `js/pages.js`) are built from `js/events.js`: sales opening, shows coming up, sold-out categories.
- **Footage** (`#footage`) is a coming-soon page with a waiting list (`kind: 'footage'` sign-ups). Nothing can be bought there yet.
- **Brand**: the Arena emblem lockup, Inter everywhere, and the Backstage / Ember / Flame / Amber / Spotlight / Paper palette (last block of `css/styles.css`).

## How the site earns

- **Affiliate commission.** tiket.com's affiliate program through Involve Asia (approved November 2026, `affiliateLink` in `js/config.js`) pays on sales made through our links. The fan pays the same price. The event page's Getting there box also links to hotels and flights on tiket.com through the same link (`TRAVEL` / `travelUrl` in `js/passes.js`); those carry `hotel-<event>` or `flight-<event>` as the sub id instead of a click id.
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

## 3D Pass Plus

A second pass beside the seat view (`PLUS_FEE` in `js/order.js`, Rp49.000): everything the seat pass has, and every seat of the concert open in 3D, so the fan can sit anywhere and compare. A fan with a paid seat pass for a concert still to come upgrades it for the difference (`UPGRADE_FEE`, Rp24.000) from the 3D view, My 3D passes or `#upgrade-<pass id>`; the seat stays the pass's own. `#plus-<concert id>` opens the form with Plus chosen.

- **On sale only with `PASS_PLUS` = `on`**, set in `wrangler.jsonc` (`vars`), so each deploy and preview carries it (on since November 2026). Off, `/api/config` says nothing of it, the form and the price list show its card as *Coming soon*, the upgrade buttons stay hidden, and the Worker refuses a Plus order or an upgrade (400, `field: 'plan'`).
- **The team sees it first.** A member signed in on `#admin` sees Plus on sale even with `PASS_PLUS` off, so the form, the checkout and a Plus pass can be checked on the live site before it opens: "Buka gratis (tim)" opens a free Plus pass. A paid Plus order is still refused until `PASS_PLUS` is `on`.
- The order book keeps the plan (`plan`, `seat` or `plus`) and, for an upgrade, the seat pass it was bought on (`base`). The pass key carries the plan and the amount, so the status check holds a Plus order to its own amount; keys made before plans open as seat passes at the access fee.
- Team passes are Plus passes.
- The unlock form also carries a note that the 3D is an illustration built from the promoter's plan, and that changes on the day are not ours to answer for; the consent box says so too.

### Compare seats and show mode

`js/compare.js` measures a seat from the venue's own geometry: metres from the eye to the stage, degrees off the venue's centre line (left out for a stage in the round), eye height and the category's price, and a view score out of 100. `compareSeats` says which of two seats sees more, which is the better value, and what each wins on. Any seat card has Compare; the tray (`js/seatplus.js`) holds two seats and anyone can read it, and a link carries the pair (`#seats-<event>@<seat>~<seat>`). Sitting in either from the tray takes Plus (or a demo venue).

Show mode is the button over a seat view: the light sticks round the seat in a colour the fan picks (or the crowd's own), on the beat, steady or in a wave round the stage, a light-stick ocean, and the house lights up or down. The choice is kept in the browser (`atv-show`). The crowd shader reads it from `uStickCol`, `uStickMix`, `uStickFx`, `uStickAll` and `uStage` (`SeatScene.setShow`). It comes with Plus and is open on the demo venues; a seat pass sees the crowd's own sticks and the Plus offer.

Show mode also has the artist walk the stage (`SeatScene.setRoam`, on by default with Plus, `roam` in `atv-show`). Who walks follows the act (`walkersOf` in `crowd3d.js`): in a band only the singer (the singer at the guitar when nobody else sings out front), and a group without instruments, a boy or girl group or dancers, all together. On an end stage the group keeps its formation and goes from the centre to each front corner and back corner of the deck, and out along a runway or catwalk down the middle (to its B-stage or island) one behind the other; round the 360 stage they follow each other round the edge and out to every runway's end (`stageRoute`). They stop about 4.5 s at each corner to sing to that side (`walkAt`). And it lists the songs of the night (`js/setlists.js`): the set from a recent show of the same tour, labelled as expected and with its source linked. A tour with no set posted yet says so. Song titles only.

### Getting there, on the map

The Getting there button opens the streets round the venue (`js/citymap.js`), pulling back from the venue to its neighbourhood. The map is drawn in Atvents' own night palette from OpenStreetMap data baked into `assets/maps/<area>.json` by `node scripts/bake-maps.mjs <raw-dir>`. The raw files are Overpass extracts named `atv-osm-<area>.json`, and the areas are GBK, JIS, JIExpo, ICE BSD and Graha UNESA. Each baked file holds buildings, roads, green, water, rail, the venues' outlines, the stops round them (MRT, KRL, LRT, TransJakarta, bus, parking) and a walking graph.

A fan picks how they are coming and where they arrive. The walk from there to the venue's nearest door is found on the graph (`js/walk.js`, one search out from the doors), and it lights up in coral while the rest of the city dims. The panel shows the minutes, the metres and the streets along the way. "Then, inside" continues with the way in to the seat in 3D. The walk is part of Plus; anyone can see the map and the stops. The map credits OpenStreetMap contributors (ODbL).

### Getting there

The pin among the viewer's tools opens Getting there (`js/access.js`, painted by `js/seatplus.js`): how to reach the venue by MRT, KRL, TransJakarta, car or ride-hailing, from public information and written as an illustration, keyed by the venue's name (`ACCESS`). With a seat picked it also gives the way in: from the outside of the venue nearest the seat's block (from behind for the floor) to the seat, its metres and about how many minutes on foot (`wayIn`). Drawing that route in 3D (`SeatScene.setRoute`) comes with Plus, or a demo venue. The promoter's announcement on gates, parking and road closures always comes first, and the panel says so.

## Seat mates

Fans with a paid 3D pass for the same concert can find each other before the show. In the 3D view and the seat tour, a **Seat mates** block shows:

- **WhatsApp**, for paid passes only, in the pass email, on the "You're in" page, in My 3D passes and in the 3D view. The links are `FANBASE_WA` in the Cloudflare dashboard (a variable, kept with `keep_vars`). One `https://chat.whatsapp.com/...` link is the Atvents members' community, for every concert. JSON adds the artist's fanbase group per concert id, with `"*"` for the community: `{"*": "https://chat.whatsapp.com/<community>", "evt-boyz2men-dewa19": "https://chat.whatsapp.com/<fanbase group>"}`. A pass then gets both buttons. Anything that is not a WhatsApp invite is ignored, and with nothing set no button shows. The links never reach a page before the payment is confirmed.
- **Fans who show their Instagram on their seat**, as a tag over the seat in 3D (a tap opens their Instagram) and a short list. Nobody is shown by default: the fan types a name and their Instagram and ticks the consent box. They can edit it or take it down at any time.
- Other fans see only the seat, the category, the name typed and the Instagram username: never the email, the name on the order or the order id.

The server side is `GET/PUT/DELETE /api/passes/<id>/fans` in `worker/index.mjs` (the pass key in `x-pass-token`; the order must be paid, by the order book or Midtrans) and the `fans` table in D1 (`worker/fans.mjs`, made on first use). The rules for a profile are `checkFan` in `js/fanrules.js`, the same in the browser and the Worker. A month after the show the concert's rows are deleted the next time anyone asks, as the privacy policy says. In demo mode (no Worker) the profiles stay in the browser.

## Run it

```bash
npm install
npm run build:site            # site/: the static build Cloudflare serves
npm run dev                   # wrangler dev: the site and the Worker on http://localhost:8787
```

Needs Node 18 or newer. three.js 0.160.0 is bundled into the static build. Settings and secrets for the Worker are under [Payments](#payments-midtrans); `.dev.vars` holds them locally.

Without the Worker (any static hosting of `index.html`), the site runs in **demo mode**: passes, partner requests and sign-ups are kept in the browser, payments are the preview sheet that charges nothing, and `#admin` shows what that browser stored.

## Payments (Midtrans)

The fan pays without leaving the site, the way a ticket shop's checkout works: they pick a way to pay from the site's own list, with each one's logo, and the page shows what to pay with. Midtrans handles the payment itself, so no card, wallet or bank details touch the site.

The ways to pay are listed once, in `js/paymethods.js`, which the page and the Worker both read: QRIS, GoPay, ShopeePay (on phones only: it pays in its app), virtual accounts at BCA, Mandiri (bill payment), BNI, BRI, Permata and CIMB Niaga, credit and debit cards, Alfamart and Indomaret. Every way but the card is a Midtrans Core API charge: Midtrans answers at once with the account number, the bill key, the QR code or the store code, and the page shows it with the steps to pay. The card goes through Midtrans' own card form (Snap, `enabled_payments: ['credit_card']`), embedded in the page, so card numbers never touch the site. The logos are Midtrans' logo kit for merchants ([github.com/veritrans/logo](https://github.com/veritrans/logo)), trimmed and shrunk into `assets/pay/`. The checkout lays them out like a ticket shop's: the ways in groups that fold, one radio each, on light cards; the order beside them with the total and one Pay button (on a phone, the order in a line on top and Pay pinned to the bottom of the screen).

1. **Unlock.** The fan picks the concert and seat and adds their name and email, then picks a way to pay. The page sends all of it to `POST /api/payments`. The Worker (`worker/index.mjs`) checks it like `checkClaim` does (seats from `worker/catalog.json`, written by the build; the way to pay must be one that is switched on), makes the order at `ACCESS_FEE` (the browser cannot change the amount), open for `PAY_MINUTES` (60), saves it in the order book, and answers with what to pay with (or the card form's token) and a signed pass key. What Midtrans answers is checked before it reaches the page (`payDetails`): numbers are digits, the QR code an image on Midtrans' API host, the app link GoPay's own scheme or ShopeePay's address. The pass waits on the device as *Waiting for payment*.
2. **Checkout** (`#paid-<order id>`). The order, a clock for the hour, and what to pay with: the number with a copy button and the bank's steps, the QR code (on a phone, GoPay and ShopeePay open their app instead), the store code, or the card form (`js/snap.js` loads Midtrans' `snap.js` and embeds it). The page asks `GET /api/passes/<id>` (key in the `x-pass-token` header), which asks Midtrans' status API: settled opens the pass at once ("You're in"), pending keeps asking (every 5 seconds for a QR code or an app, 10 otherwise, and at once on *I have paid* or when the fan comes back to the tab), failed, expired or refunded closes it. *Choose another way* first asks `POST /api/passes/<id>/cancel`, which has Midtrans close the order so its number or code stops taking money; an order paid in the meantime opens its pass instead. If the card form cannot load, the fan pays on Midtrans' own page, which sends them back through `/pay/done`. A reload or another visit to `#paid-<id>` opens the same checkout again.
3. **Notification.** Each order tells Midtrans to report to `/api/midtrans/notify` (header `X-Append-Notification`, so nothing needs setting in the dashboard). The Worker checks Midtrans' SHA-512 signature, reads the status again from Midtrans, and updates the order book.
4. **The email.** Once an order is paid, from the notification or from the page asking, whichever comes first, the Worker sends the pass email (`worker/mail.mjs`, through Resend). It looks like the site: the concert's poster on top, then the pass as a paper ticket with the concert, date, venue, category, seat, name, the way it was paid and the amount, a button that opens the pass on any phone or laptop (`#pass-<id>-<key>`), and the three steps of the seat tour. The poster and the logo are JPEG and PNG copies in `assets/mail/` (`scripts/mail-art.py`), as not every mail app shows WebP or SVG; the build lets any site show that folder's files (the rest of the site's files keep CORP same-origin). The order book takes each email once, so it is never sent twice; if Resend fails, the next notification or check tries again.
5. **The order book** is D1 (`worker/orders.mjs`, binding `DB`, database `atvents-orders`): one row per order with the buyer's name and email, the seat, the status, and when it was paid and emailed. Cloudflare makes the database on the first deploy and the Worker makes the table on first use. Midtrans keeps the payment; look orders up in either by id (`PAY-…`). The pass key carries the order id, concert, category and seat with an HMAC derived from the server key, so a new server key retires earlier keys (passes already open on a device stay open there).
6. **Who opens a pass.** The site has no accounts, so the buyer's email stands for the buyer. The browser's wallet (localStorage) never opens anything by itself: with live payments, a pass opens only once `GET /api/passes/<id>` has said it is paid on this page view, so a pass written into the wallet by hand, or with a key the Worker never signed, closes (`js/passes.js`). A paid pass opens on **two devices** (browsers) at a time (`worker/devices.mjs`, tables `pass_devices` and `pass_codes` in the order book): each browser keeps a random id it sends as `x-device`, and the device that paid is the first. A third one gets a 403 (`code: 'device'`) and the card asks for a code: `POST /api/passes/<id>/code` emails a 6-digit code to the buyer (once a minute, 15 minutes, 5 tries), and `POST /api/passes/<id>/device` with it lets that device in and signs out the device used least recently. A pass link passed round a group therefore opens for two people at most, and only the buyer can move it. Clearing the browser's data counts as a new device.
7. **Taking a pass back.** A paid pass does not run out, after the show too. A refund at Midtrans closes it (its notification). To close one by hand, after abuse say: `npx wrangler d1 execute atvents-orders --remote --command "UPDATE orders SET status = 'revoked' WHERE id = 'PAY-…'"`. A revoked pass stays closed whatever Midtrans says later. To sign out all of a pass's devices (the buyer lost a phone): `DELETE FROM pass_devices WHERE order_id = 'PAY-…'`.

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
| `GOOGLE_CLIENT_ID` | plain text, optional | Shows *Continue with Google* on the form. The client ID (`….apps.googleusercontent.com`) of a Google Cloud OAuth client, see *Sign-in buttons* below. Public, not a secret; never paste the client secret here. |
| `MICROSOFT_CLIENT_ID` | plain text, optional | Shows *Continue with Microsoft*. The Application (client) ID, a GUID, of a Microsoft Entra app registration, see below. Public. |

- **Sign-in buttons** (`js/sso.js`, `auth.html`). They fill the fan's name and an email that works, without typing. Nothing loads from Google or Microsoft until the fan presses one: a small window opens at their sign-in page and comes back to `https://atvents.com/auth` with an ID token, which hands it to the form and closes. The page checks the token's issuer, that it was made for this client ID, its one-time number and its time, and takes only the name and the email; nothing else is kept. Without a client ID, its button does not show; with neither, the form asks for the name and email as before. Every way in still needs the name, the email and the terms before *Continue* works.
  - *Google*: Google Cloud console, APIs and services. OAuth consent screen: External, app name Atvents, scopes `openid`, `email`, `profile` only (no review needed), published. Credentials, Create OAuth client ID, Web application: Authorized JavaScript origin `https://atvents.com`, Authorized redirect URI `https://atvents.com/auth`.
  - *Microsoft*: Microsoft Entra admin center, App registrations, New registration: name Atvents, *Accounts in any organizational directory and personal Microsoft accounts*, redirect URI of the Web platform `https://atvents.com/auth`. Then Authentication: tick *ID tokens (used for implicit and hybrid flows)*. No client secret and no API permissions beyond the default sign-in are needed.

- **Email domain.** In Resend, add `atvents.com` as a domain and put the DNS records it shows (DKIM and the `send` subdomain's SPF and MX) in Cloudflare DNS. They do not touch the existing mail for `halo@atvents.com`. Resend's free plan sends 3,000 emails a month, 100 a day.
- **Sandbox.** With a Sandbox key, visitors still see the preview. Open `https://atvents.com/#paytest` on your own device to pay in the Sandbox (Midtrans' simulator pays the test orders); `#paytest-off` ends it.
- **Production.** Once Midtrans approves the business, replace both keys with the production ones. Every visitor then pays for real.
- **Channels.** Each way to pay must be switched on in the Midtrans dashboard (Settings, Payment). One that is not answers *not open right now* and the fan picks another; list only the open ones in `MIDTRANS_METHODS`.
- In the Midtrans dashboard you may also set the Finish, Unfinish and Error redirect URLs to `https://atvents.com/pay/done`, used when the form cannot open inside the page. Its "Test notification URL" button sends an unsigned sample, which the Worker refuses (401): that is expected.

Run it locally with `npm run dev` (`wrangler dev`, with the key in `.dev.vars`, which git ignores).

## Signing in to My 3D passes

With live payments, **My 3D passes** (#passes) shows nothing until the fan signs in (js/account.js, worker/account.mjs): with Google (the token is checked on the Worker, as for the team) or with a 6-digit code sent to the email they paid with. Only an email with a paid order in the order book can sign in; any other is told it has no paid 3D pass. Signed in, every paid pass of that email comes to the device, wherever it was bought, and opens there (a device that signs in takes a pass's place the way the device code does, signing out the one used least recently).

The fan key lasts 30 days, but after **30 minutes with no tap, click, key or scroll** on the site the fan is signed out, and the passes that signing in brought leave the device again. Passes bought on the device stay, but stay hidden until the fan signs in. It needs the order book (DB) and email (RESEND_API_KEY) for the code, and GOOGLE_CLIENT_ID for Google. Endpoints: `POST /api/me/code`, `POST /api/me/session`, `GET /api/me/passes`.

## The team

The owner and the people they name open every 3D pass without paying, to watch the live site and check changes from any phone or laptop (`worker/team.mjs`, `js/team.js`).

- **Who.** `ADMIN_EMAILS` in the Cloudflare dashboard (Workers, `website`, Settings, Variables and Secrets): Google addresses, comma-separated, as the account shows them. Plain text is fine. Taking an address off ends that person's access at once, on every device.
- **Signing in.** Open `#admin` and press *Masuk dengan Google*. The page sends Google's ID token to `POST /api/team/session`; the Worker checks it itself: Google's signature against its published keys, that it was made for `GOOGLE_CLIENT_ID`, that it is in time and the email verified, and that the address is on the list. Only then it answers with a team key (the email and an end date, 30 days, HMAC-signed with a key derived from the Midtrans server key). The browser keeps it; the Worker checks it, list included, on every use (`x-team-key`), so a key written in by hand opens nothing.
- **Opening a pass.** Signed in, the device takes live payments even with a Sandbox key (no `#paytest` needed), and the checkout shows *Buka gratis (tim)* above the ways to pay. `POST /api/team/passes` checks the concert, category and seat like an order, then writes a row in the order book that is paid at 0 (`method = 'team'`), with no Midtrans and no pass email. From there it is a paid pass like any other: the seat tour, seat mates, the story, the two-device rule. Team passes are easy to find: `SELECT * FROM orders WHERE method = 'team'`.
- Needs `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`, the server key and the order book; without any of them the box does not show and the endpoints answer 503.

## Staging

A second copy of the site, for checking changes before they reach atvents.com: its own Worker (`website-staging`), its own order book (D1 `atvents-orders-staging`) and its own variables, so it never touches live orders or keys. It always takes Sandbox payments (no `#paytest` needed), shows a yellow *STAGING · Sandbox* badge, and tells search engines to leave it out (`x-robots-tag: noindex`, set by the Worker, which runs before every file there). `wrangler.jsonc`, `env.staging`.

Setting it up, once, in the Cloudflare dashboard:

1. **Branch.** Push a `staging` branch to GitHub (from `main`).
2. **Worker.** Workers & Pages, Create, Import a repository: this repository. Name `website-staging`. Build: production branch `staging`, build command empty (the deploy runs it), deploy command `npx wrangler deploy --env staging`.
3. **Variables** (the new Worker, Settings, Variables and Secrets): `MIDTRANS_SERVER_KEY` (Secret) and `MIDTRANS_CLIENT_KEY`, both **Sandbox**; `GOOGLE_CLIENT_ID` (the same as the live site); `ADMIN_EMAILS`. `RESEND_API_KEY` only if staging should send pass emails too.
4. **Address.** The Worker, Settings, Domains & Routes, Add, Custom domain: `staging.atvents.com`. Cloudflare makes the DNS record and the certificate.
5. **Google.** Google Cloud console, Credentials, the Atvents OAuth client: add `https://staging.atvents.com` to the JavaScript origins and `https://staging.atvents.com/auth` to the redirect URIs.
6. **Locked (recommended).** Zero Trust, Access, Applications, Add, Self-hosted: `staging.atvents.com`, a policy *Allow* with the team's emails (One-time PIN or Google login). Then only the team can open staging at all.

Working with it: changes go to `staging` first; check them on staging.atvents.com; when they are right, merge `staging` into `main`, which deploys the live site. Locally, `npx wrangler dev --env staging` runs the staging copy with `.dev.vars`.

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

Set it as `affiliateLink` in `js/config.js`. Anything that is not https or lacks `{url}` and `{sub}` is ignored. Links out are `target="_blank" rel="noopener sponsored"`.

Then replace each concert's `official.url` in `js/events.js` (a tiket.com search for now) with the show's own tiket.com page, and check one button: it should go through the network and land on that page.

## Confirming passes from the affiliate report

1. In the network's dashboard, export the conversion report as CSV with the sub id and status columns.
2. Open `#admin` and paste the report or open the file under **Affiliate report**.
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

The Worker's routes are listed at the top of `worker/index.mjs` (payments, pass status, seat mates, devices, the team). Errors are `{ error, field? }` with a 4xx status.

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
  store.js              LocalStore (demo, in the browser) and PayStore (with Midtrans)
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

scripts/build-site.mjs      site/ for Cloudflare, and worker/catalog.json
scripts/security-headers.mjs  the CSP and other headers written into site/_headers
scripts/worker-catalog.mjs  the concerts and seats the Worker checks orders against
scripts/build-preview.mjs   dist/preview.html for hosts that wrap the page in their own document
scripts/event-art.py        a concert's 3:2 and 5:7 artwork from its poster (Pillow)
scripts/mail-art.py         the JPEG copies of the 3:2 artwork for the pass email (Pillow)
test/                   pay.test.mjs, venues.test.mjs, when.test.mjs and the feature tests
```

## Adding a concert

Copy an entry in `EVENTS` (`js/events.js`):

- `id` starting with `evt-`, `venue` (a layout from `js/layouts.js`) and `place` (the real venue).
- `dateISO`, `time`, `doors` on the venue's clock; `'TBA'` for anything not announced.
- `cats` with each category's announced price, and `zone(seat)` to map the layout's blocks to them; `soldOut` for categories that sold out.
- `official.url`: the show's tiket.com page.
- `image`: the artwork (the promoter's poster; for a match, the match poster), with a line in `IMAGES` in `js/media.js`: a 3:2 file in `assets/events/` (1200 px wide with a 640 px copy, or one 480 px file) for the concert page and the stage screens in 3D, and a 5:7 file in `assets/events/card/` (800 px wide with a 480 px copy) for the ticket cards. A poster of another shape goes in whole, over a blurred copy of itself: `scripts/event-art.py` draws both files from the poster. Then run `python3 scripts/mail-art.py` for the pass email's copy. Without one the cards show the venue render and the screens the tour name, and the email has no poster.
- The act, for the story video (`js/artists.js`, keyed by the show's `theme`): `about`, two short facts (what the act is and where from, since when). Also `shots`, three photos of the act on stage at earlier shows (for a match, the athlete or both teams playing), cut on the beat in the video's second scene. Use only photos whose licence lets them be changed and used to promote the show: CC BY or CC0, never NC, ND or SA. Wikimedia Commons is the place to look, and each file page shows its licence under "Licensing". Skip photos with a watermark or words on clothing you would not put in an ad. Save each one 1600 px wide as `assets/artists/<theme>-<n>-live.webp`, set `box` to the part with the act (faces in its top half, since the type covers the lower part), and give `credit` as `'Author / CC BY 2.0 / Wikimedia Commons'`. Add the file page's URL in a comment above the entry. Without `shots` the scene shows the act's face from the poster (`photo`), or else the name set in type.

Past concerts drop off the lists (Events, My seat 3D, the home page and its venues) a day after the show and stay in the catalogue: nothing is deleted, a paid pass opens for good and shows **Event ended** in My 3D passes, and the unlock form no longer sells a pass for them. Update `LISTED` when you refresh the list.

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
npm test
```

No database needed: the Worker's tests play D1 with SQLite in memory, and Midtrans and Resend with stand-ins.

- Venues: unique seat ids and known categories everywhere, every concert linked to tiket.com with every category priced, demos for every layout, seat counts, the home hero's seat on each concert's centre line.
- Time zones: the venue's clock read from Jakarta, Singapore and London, daylight saving, shows without times, times after midnight.
- Payments (`pay.test.mjs`, Midtrans and Resend played by stand-ins, D1 by SQLite in memory): off until the key is set; `MIDTRANS_METHODS`; the client key, never a Sandbox one in production; the card's Snap order (card form only) and every other way's Core API charge at the fee whatever the browser sends, open for an hour, with the notification address, and what the page gets to pay with; ways switched off or unknown; a channel Midtrans refuses (409) and answers the page cannot safely show (502); closing an order for another way, an order paid before it could close, an order Midtrans would not close, and who may close one; the same field errors as the page; concerts that are over; origin, JSON and size rules; rate limits; Snap errors logged without the key; settled, pending, challenged, failed and refunded payments; wrong amounts; unpaid orders closing; forged, swapped and old-key pass keys; notifications refused without Midtrans' signature (the signature key's or the server key's) and checked again with Midtrans; keys from the newer Access keys page, with a '~'; the pass email sent once, from the notification or the page, with a link that opens that pass, the concert's poster, the way it was paid and the buyer's name escaped; a failed email tried again; payments working without the order book or the email key; the way back from Midtrans; the Worker's seat list equal to every venue's seats.

## Security

- Every input is checked and length-capped by the same rules in the browser and in the Worker. The Worker refuses bodies over its size limit (`MAX_BODY`) and POSTs that are not JSON.
- Queries are parameterised. Output in the browser is escaped.
- Cross-site POSTs are refused by an Origin check. The API uses no cookies.
- Headers: Content-Security-Policy with no inline scripts (the import map is allowed by its hash) and scripts from elsewhere only from the three.js folders the import map names; `nosniff`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, COOP and CORP same-origin, HSTS on https.
- Payments: the Midtrans server key and the Resend key are Cloudflare Secrets, sent only to Midtrans and Resend and never logged. The amount is set by the Worker. Pass keys are HMAC-signed and checked in constant time; Midtrans' notifications count only with their SHA-512 signature, and the status is read again from Midtrans before anything changes. The static site's CSP allows scripts and frames from Midtrans' two app hosts only, and images (the QR codes) from its two API hosts; the browser is sent only to Midtrans' own payment page. What Midtrans answers a charge with is checked before the page shows it: digits for numbers, Midtrans' API host for QR codes, GoPay's scheme or ShopeePay's address for app links. Choosing another way to pay closes the old order at Midtrans first, so one pass is never paid twice. Orders and checks are rate-limited per address; orders must come from the site's own origin. The pass email escapes everything the buyer typed and goes only to the buyer, once.
- `npm audit`: 0 vulnerabilities.

## Before going live

- **Affiliate program.** Approval, then the deeplink (above) and each concert's own tiket.com page.
- **Midtrans.** Business approval, then the production server and client keys (see Payments).
- **Email.** A Resend account, `atvents.com` verified there, and `RESEND_API_KEY` (see Payments). Until then the pass opens only on the device that paid (and through Copy pass link).
- **Brand and contacts** in `js/config.js`; the name also appears in `index.html` (title and meta).
- **Legal pages.** Privacy policy, terms and affiliate disclosure are templates written for Indonesia's Personal Data Protection Law (UU 27/2022). Have a lawyer check them, with your company's name and address.
- **Keeping data only as long as the policy says.** Once a concert is twelve months past, delete its records:

  ```bash
  npx wrangler d1 execute atvents-orders --remote --command "DELETE FROM orders WHERE event_id = 'evt-…'"
  ```

  Partner requests: two years after the last contact. Alert sign-ups: until the person leaves the list, so send alerts from an email service with an unsubscribe link (Brevo, Mailjet), using the CSV from `#admin`.
- **Artwork.** The concert covers are the promoters' posters, cropped from their listings. Use the files from their media kits, with permission.
- **The report.** Import it at least weekly, and settle the passes still checking by hand.

## The earlier version

Version 0.1 sold tickets itself: seat holds, checkout and Midtrans payments, e-tickets and an organiser dashboard. It is kept as `seatsight-v14-own-checkout.zip` in the project files.
