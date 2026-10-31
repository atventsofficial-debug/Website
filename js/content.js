// Copy that pages share: questions and answers, what partners use the seat view for, and
// the partner plans. Answers are our own markup (links into the site), never visitor input.
// `{brand}` becomes the brand name from config.js.
import { state, esc, icon } from './ui.js';

const brand = t => t.replaceAll('{brand}', esc(state.cfg.brand));

export const FAQ_FANS = [
  { id: 'price', q: 'Do I pay more if I buy through {brand}?',
    a: 'No. You pay tiket.com’s price, the same as going there yourself. If tiket.com pays us a commission for the sale, it comes out of their side, not yours.' },
  { id: 'seller', q: 'Who sells the ticket?',
    a: 'tiket.com. Our Buy on tiket.com buttons open the concert on tiket.com, where you choose the category, pay and get the official e-ticket. We never see your payment details.' },
  { id: 'unlock', q: 'How do I unlock the view from my seat?',
    a: 'Buy with one of our Buy on tiket.com buttons. Then come back to <a class="u" href="#unlock">Unlock 3D</a> and enter the tiket.com order ID, the email you used there, the category and the number of tickets. The seat views open straight away.' },
  { id: 'order-id', q: 'Where do I find my tiket.com order ID?',
    a: 'In the confirmation email from tiket.com, and with your orders in the tiket.com app or site. Copy it as it is written; spaces do not matter.' },
  { id: 'locked', q: 'Why can’t I sit in the seats before I buy?',
    a: 'Anyone can look round the venue from above and see where each category is. Sitting in a seat and looking at the stage is for fans who bought through us: it is how we keep the site free. Want to try it first? Sit anywhere in our <a class="u" href="#demo-concert">demo arena</a>.' },
  { id: 'devices', q: 'I bought on my phone. Can I unlock on my laptop?',
    a: 'Yes. Unlock with the same order ID and email on any device. Your pass also has a link you can open on your other devices, under <a class="u" href="#passes">My 3D passes</a>.' },
  { id: 'no-link', q: 'I bought on tiket.com without your link. Can I still unlock?',
    a: 'Seat views are for fans who bought through our links, because that is how tiket.com tells us about the sale. If we cannot find your booking in tiket.com’s report, the pass closes after the check. The view from above stays open to everyone.' },
  { id: 'official', q: 'Is the 3D venue the official seating plan?',
    a: 'No. It is our illustration of the venue and of the category layout the promoter announced, made to compare views. Distances and angles are close, not exact, and the stage on the night can differ. Your ticket decides your seat.' },
  { id: 'seat-number', q: 'Can I choose my seat number here?',
    a: 'No: tiket.com sells these concerts by category. Where seats are numbered, the number comes with your e-ticket. Compare the categories in 3D before you buy, then find your seat and mark it as yours, so the people you go with can see where you are.' },
  { id: 'phone', q: 'Does the 3D view work on my phone?',
    a: 'Yes, in the browser of any recent phone, tablet or laptop, with nothing to install. Older phones get a lighter version of the venue.' },
  { id: 'data', q: 'What do you do with my order ID and email?',
    a: 'We use them to open your pass, to match it with tiket.com’s affiliate report and to write to you about the pass. We never ask for your payment details or your e-ticket. See the <a class="u" href="#privacy">privacy policy</a>.' },
  { id: 'closed', q: 'My pass says Closed. What now?',
    a: 'It means we could not find the booking in tiket.com’s report for our links. If you did buy through us, <a class="u" href="#contact">write to us</a> with the pass number and tiket.com’s confirmation email and we check it by hand.' },
  { id: 'refunds', q: 'Refunds, name changes, a cancelled show?',
    a: 'tiket.com and the promoter handle those, under their terms. Your 3D pass is free, so there is nothing to refund on our side.' },
];

export const FAQ_PARTNERS = [
  { id: 'what', q: 'What exactly do we get?',
    a: 'A 3D model of your venue built from its seating plan: every block, row and seat number, the stage and screens of your show, and a viewer that puts buyers in any seat. It runs in the browser. Embed it in your checkout and e-tickets, or link to it from your app.' },
  { id: 'time', q: 'How long does a venue take?',
    a: 'Three to five working days from the seating plan for a typical arena or stadium, less for a cinema. A new show in a venue we have already built needs only its stage and categories.' },
  { id: 'stack', q: 'Does it replace our ticketing system?',
    a: 'No. The viewer shows your categories, and your availability if you send it, then hands the buyer back to your own checkout with the category or seat they chose.' },
  { id: 'brand', q: 'Can it carry our brand?',
    a: 'Yes: your colours and logo in the viewer and your show’s artwork on the stage screens. On the white label licence the {brand} name does not appear at all.' },
  { id: 'weight', q: 'Is it heavy for our buyers’ phones?',
    a: 'The viewer loads after your page, in the browser, and draws a lighter venue on older phones. There is no app to install.' },
  { id: 'data', q: 'How is buyer data handled?',
    a: 'The viewer needs no personal data. What it reports back are counts of the sections buyers open. Where personal data is involved we sign a processing agreement under Indonesia’s Personal Data Protection Law.' },
];

// Who the partner page talks to. `kind` matches the radio values in the partner form.
export const USES = [
  { kind: 'ticketing', ic: 'i-tix', title: 'Ticketing apps', text: 'Show the view beside the category picker and on the e-ticket, so buyers choose the better categories with confidence.' },
  { kind: 'promoter', ic: 'i-people', title: 'Promoters and EOs', text: 'Announce the show with its venue in 3D, and answer “where will I sit?” before it fills your DMs.' },
  { kind: 'venue', ic: 'i-pin', title: 'Venues and stadiums', text: 'One model of your venue, used again for every concert, match and event that books it.' },
  { kind: 'travel', ic: 'i-cal', title: 'Travel and packages', text: 'Sell concert trips with the view from the seats in the package, at home and abroad.' },
  { kind: 'brand', ic: 'i-card', title: 'Banks and loyalty', text: 'Presales and points rewards that show cardholders exactly which seats they are getting.' },
  { kind: 'media', ic: 'i-share', title: 'Media and fan communities', text: 'Put the venue in your guide to the show: the categories, their prices and the view from each.' },
];

// Partner plans. Figures from the pricing research, as on the earlier organiser page.
// Prices exclude VAT.
export const PLANS = [
  { tag: 'No commitment', name: 'Per ticket', price: 'Rp 500–4K', per: 'per ticket sold', for: 'For a first show, or a platform that wants to try it on one event.',
    items: ['Charged only on tickets sold with the seat view', 'Rp 500 under a Rp 100K ticket, Rp 2,000 up to Rp 500K, Rp 4,000 above', 'Your venue built from its seating plan', 'Embed in checkout, site and e-tickets'], cta: 'Start with one show' },
  { tag: 'Own it', name: 'Venue licence', from: true, price: 'Rp 85M', per: 'one-time', for: 'For venues and promoters with a regular calendar in one place.', style: 'coral',
    items: ['Rp 85M up to 5,000 seats, Rp 175M up to 20,000, stadiums from Rp 300M', 'Every event in the venue, with no per-ticket fee', 'Stadiums modelled from plans and site photos', 'Optional upkeep, 18% a year'], cta: 'Talk about your venue' },
  { tag: 'Ticketing platforms', name: 'White label', from: true, price: 'Rp 650M', per: 'one-time', for: 'For platforms that want the seat view as their own feature.', style: 'white',
    items: ['Source code and unlimited venues', 'Your domain and brand, no {brand} name', 'Every layout on this page to start from', 'Optional upkeep, 20% a year'], cta: 'Talk to us' },
];

// Questions as a list of disclosures. `pick` limits it to some, in the order given.
export function faqHtml(list, pick) {
  const items = pick ? pick.map(id => list.find(x => x.id === id)).filter(Boolean) : list;
  return items.map(x => `<details class="faq-item" id="q-${x.id}">
      <summary><span>${brand(x.q)}</span><i class="faq-ic">${icon('i-plus')}</i></summary>
      <div class="faq-a"><p>${brand(x.a)}</p></div>
    </details>`).join('');
}

export const brandText = brand;
