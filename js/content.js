// Copy that pages share: questions and answers, what partners use the seat view for, and
// the partner plans. Answers are our own markup (links into the site), never visitor input.
// `{brand}` becomes the brand name from config.js.
import { state, esc, icon } from './ui.js';

const brand = t => t.replaceAll('{brand}', esc(state.cfg.brand));

export const FAQ_FANS = [
  { id: 'price', q: 'How much is the view from my seat?',
    a: 'Rp25.000 for one seat at one concert. You pay once, and the view stays open until the day after the show.' },
  { id: 'unlock', q: 'How do I get the view from my seat?',
    a: 'Open <a class="u" href="#unlock">Unlock 3D</a>, choose your concert, category, section, row and seat, add your name and email, and pay. Your pass opens straight away and the seat tour starts from there.' },
  { id: 'pay', q: 'How can I pay?',
    a: 'QRIS, GoPay, ShopeePay, bank transfer, card, or cash at Alfamart or Indomaret, right on this site. Midtrans handles the payment: card numbers go only into Midtrans’ own card form, and we never see your card, wallet or bank details. Once it is paid, the pass opens and its link comes to your email.' },
  { id: 'seller', q: 'Do you sell concert tickets?',
    a: 'No. Each concert page names its official seller (tiket.com, Loket, TipTip or Traveloka) and links to it. The 3D view does not include a ticket.' },
  { id: 'tour', q: 'What does the seat tour show?',
    a: 'Three views, in order: the whole venue from above, then your category with your seat marked, then the view from your seat. Drag to look round. At the end you can go back home or make a story video.' },
  { id: 'story', q: 'How does the story video work?',
    a: 'Once your pass is paid, tap Post my seat to story (or Upload to story at the end of the tour). We make a 17-second 9:16 trailer of your show in your browser, cut to music like an event flyer: the artist, the date, the venue and the tour, then the view from your own seat with its block, row and seat number and the days to go, and the Atvents logo at the end. It shows only the show\u2019s published details and your seat, never your name or your pass link. The music is licensed by Atvents for these videos. When it is ready it plays right there, so you can watch it before you post it. On a phone you can share it straight to your story; anywhere else, save it and post it.' },
  { id: 'locked', q: 'Can I look round before I pay?',
    a: 'Yes. Anyone can look round every venue from above and see where each category is. Want to try sitting down first? Use our <a class="u" href="#demo-concert">demo arena</a>.' },
  { id: 'devices', q: 'Can I open my pass on another device?',
    a: 'Yes. Each pass has a link under <a class="u" href="#passes">My 3D passes</a> that opens it on your phone or laptop.' },
  { id: 'official', q: 'Is the 3D venue the official seating plan?',
    a: 'No. It is our illustration of the venue and of the category layout the promoter announced. Distances and angles are close, not exact, and the stage on the night can differ. Your ticket decides your seat.' },
  { id: 'footage', q: 'Will you sell concert footage?',
    a: 'Soon. Clips and photos from the big shows are on the way. <a class="u" href="#footage">Join the list</a> to hear when the first ones go on sale.' },
  { id: 'data', q: 'What do you do with my name and email?',
    a: 'We use them to open your pass, send you its link and receipt, and answer you about it. We never ask for payment details. See the <a class="u" href="#privacy">privacy policy</a>.' },
  { id: 'refunds', q: 'A cancelled show?',
    a: 'Concert tickets are refunded by their seller, under the promoter’s terms. If a show is cancelled after you paid Rp25.000 for its seat view, <a class="u" href="#contact">write to us</a> and we refund it.' },
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
