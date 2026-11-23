// Front-end settings. When the page is served by server/server.mjs, values from
// GET /api/config override these.
export const CONFIG = {
  brand: 'Atvents',
  contact: {
    whatsapp: '',   // the real number, like '+62 812-3456-7890'. Empty hides the WhatsApp line
    email: 'halo@atvents.com',
  },
  // The affiliate deeplink for tiket.com, from the network's link builder once the program
  // approves the site. {url} is the concert's tiket.com page, {sub} the click id we match
  // sales on, {src} the campaign the fan came from, {event} the concert id. Empty: buttons
  // go straight to tiket.com and earn nothing. Involve Asia, for example:
  // 'https://invol.co/aff_m?offer_id=OFFER&aff_id=AFFILIATE&source=deeplink_generator&url={url}&aff_sub={sub}&aff_sub2={src}&aff_sub3={event}'
  affiliateLink: 'https://invl.app/clo9uqt?aff_sub={sub}&aff_sub2={src}&aff_sub3={event}&url={url}',
  // Involve Asia deeplinks for the other approved brands, by seller name, same placeholders.
  // Traveloka sells some concerts (its buy button goes through here); Klook is the
  // "things to do" link beside hotels and flights. Each link's {url} replaces its landing page.
  sellerLinks: {
    Traveloka: 'https://invl.me/clo9vit?aff_sub={sub}&aff_sub2={src}&aff_sub3={event}&url={url}',
    Klook: 'https://invl.me/clo9viy?aff_sub={sub}&aff_sub2={src}&aff_sub3={event}&url={url}',
  },
};
