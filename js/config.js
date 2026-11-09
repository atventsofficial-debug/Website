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
  affiliateLink: '',
};
