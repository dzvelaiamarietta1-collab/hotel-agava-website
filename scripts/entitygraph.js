/* Tie every page's structured data to one hotel, and price the services.
 *
 * The site had a Hotel block on 56 pages, a Service block on 24 and rooms on
 * 36 — all of them separate islands. A search engine or an AI model reading
 * them has no way to tell that they describe the same business, and a hotel
 * that reads as six unrelated things is not an entity anyone can be
 * confident about. Everything now points at one @id, and each service says
 * what it costs in machine-readable form, not only in prose.
 *
 *   node scripts/entitygraph.js [--check]
 */
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
process.chdir(ROOT);
const CHECK = process.argv.includes('--check');
const HOTEL_ID = 'https://hotelagava.ge/#hotel';
const esc = s => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/* what each service costs, from the owner's confirmed figures */
const PRICED = {
  'services/parking/':   { price: 0 },
  'services/wifi/':      { price: 0 },
  'services/reception/': { price: 0 },
  'services/breakfast/': { price: 30, unit: { ka: 'ერთ სტუმარზე', en: 'per guest', ru: 'с гостя', tr: 'kişi başı' } },
  'services/laundry/':   { price: 10, unit: { ka: 'ერთ ნივთზე', en: 'per item', ru: 'за вещь', tr: 'parça başı' } },
  'services/transfer/':  { price: 70, max: 70, min: 50, unit: { ka: 'მანქანაზე', en: 'per car', ru: 'за машину', tr: 'araç başına' } },
};

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : e.name === 'index.html' && files.push(p.replace(/^\.\//, ''));
  }
})('.');

let touched = 0;
for (const f of files) {
  let h = fs.readFileSync(f, 'utf8');
  if (/name="robots"[^>]*noindex/.test(h)) continue;
  const lang = (f.match(/^(en|ru|tr)\//) || [, 'ka'])[1];
  const rel = f.replace(/^(en|ru|tr)\//, '').replace(/index\.html$/, '');
  let out = h, changed = false;

  for (const m of [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]) {
    const raw = m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&');
    let d;
    try { d = JSON.parse(raw); } catch { continue; }
    const before = JSON.stringify(d);

    if (d['@type'] === 'Hotel') {
      d['@id'] = HOTEL_ID;                      // one hotel, many pages
    }
    if (d['@type'] === 'HotelRoom' && !d.containedInPlace) {
      d.containedInPlace = { '@id': HOTEL_ID };
    }
    if (d['@type'] === 'Service') {
      d.provider = { '@id': HOTEL_ID };
      const p = PRICED[rel];
      if (p && !d.offers) {
        d.offers = {
          '@type': 'Offer', priceCurrency: 'GEL',
          price: String(p.price),
          ...(p.unit ? { description: p.unit[lang] } : {}),
          availability: 'https://schema.org/InStock',
        };
        if (p.min) {                            // transfer: 70 in, 50 out
          delete d.offers.price;
          d.offers['@type'] = 'AggregateOffer';
          d.offers.lowPrice = String(p.min);
          d.offers.highPrice = String(p.max);
        }
      }
    }
    if (d['@type'] === 'FAQPage' && !d.about) {
      d.about = { '@id': HOTEL_ID };
    }
    if (JSON.stringify(d) !== before) {
      out = out.replace(m[0], '<script type="application/ld+json">' + esc(JSON.stringify(d)) + '</script>');
      changed = true;
    }
  }
  if (changed) { if (!CHECK) fs.writeFileSync(f, out); touched++; }
}
console.log(`  ${CHECK ? 'შეიცვლებოდა' : 'განახლდა'}: ${touched} გვერდი`);
