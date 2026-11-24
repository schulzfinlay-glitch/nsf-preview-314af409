/* Black Friday: the 52-card deck.
 *
 * The prizes are the owner's (24 Nov 2026). The CODES are still placeholders:
 * each must exist in Shopify admin > Discounts before launch, set to one use
 * per customer, with the same start and end times as below. The deck only
 * shows the code; Shopify enforces it.
 *
 * The cards add up to 52. Every visitor gets one card, shuffled for them,
 * and keeps it if they come back.
 */
window.NSF_PROMO = {
  name: 'Black Friday',
  // The sale runs 8pm Thu 26 Nov to 8pm Fri 27 Nov 2026, Brisbane time (the
  // store's own timezone; Queensland has no daylight saving, so +10:00).
  // Outside these times the deck, the bar offer and the bag code all disappear.
  start: '2026-11-26T20:00:00+10:00',
  end: '2026-11-27T20:00:00+10:00',
  // Test sites: on these hosts the deck is on all the time, so the GitHub
  // preview always shows it. The real domain (nonstopflow.com.au) keeps to
  // the times above. Add ?promo=clock to any address to see the real rule.
  alwaysOn: ['github.io', 'localhost', '127.0.0.1'],
  // ONE shared deck for everyone: the web app URL of tools/deck-pool.gs (a
  // Google Sheet). Each card can then be taken once, ever, and taken cards grey
  // out live for every visitor. Empty = demo: a pretend pool in each browser.
  // With the pool on, the prizes and REAL codes live in the Sheet's script, not
  // here (codes below stay empty: they'd be public). Only the demo used them.
  pool: 'https://script.google.com/macros/s/AKfycbyvFTH__fOWmCYZERaeDTMrYz3sr9kMBfd8OX2NsDb8XkxPX9SB4I4o-ppnCa4Ctw9iPQ/exec',
  prizes: [
    { label: '50% off', code: '', cards: 2 },
    // One code for both parts: 15% off the order plus a free gym bag (see README).
    { label: 'Free gym bag + 15% off', code: '', cards: 2 },
    { label: '25% off', code: '', cards: 10 },
    { label: '20% off', code: '', cards: 10 },
    { label: '15% off', code: '', cards: 28 },
  ],
};
