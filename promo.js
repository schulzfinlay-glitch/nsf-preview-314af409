/* Black Friday: the 52-card deck.
 *
 * EVERYTHING BELOW IS A PLACEHOLDER until the client confirms it.
 * Each code must exist in Shopify admin > Discounts before launch, set to
 * one use per customer. The deck only shows the code; Shopify enforces it.
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
  prizes: [
    { label: '10% off', code: 'NSFA-BF10', cards: 26 },
    { label: '15% off', code: 'NSFA-BF15', cards: 16 },
    { label: '20% off', code: 'NSFA-BF20', cards: 8 },
    { label: '30% off', code: 'NSFA-BF30', cards: 2 },
  ],
};
