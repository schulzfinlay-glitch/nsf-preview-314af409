/* The deck: Black Friday only.
 * 52 cards in suit order. Tap one, it lifts to the middle and spins to show
 * the discount. Next: email. Next: into the site, with the code on the bag
 * (it rides the checkout link, see site.js checkoutUrl). One card per visitor.
 * No email, no discount: the code is only given (and only reaches the bag and
 * checkout) once an email is in. Skipping keeps the card, so it can't be re-dealt. */
(() => {
  const P = window.NSF_PROMO;
  const S = window.NSFSite;
  if (!P || !S) return;
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  if (params.get('deck') === 'reset') { try { localStorage.removeItem('nsf-deck'); sessionStorage.removeItem('nsf-deck-skip'); } catch { /* */ } }
  if (!S.promoLive() && !params.has('deck')) return;

  const SUITS = [['♠', 'spades', 0], ['♥', 'hearts', 1], ['♦', 'diamonds', 1], ['♣', 'clubs', 0]];
  const RANKS = [['A', 'Ace'], ['2', 'Two'], ['3', 'Three'], ['4', 'Four'], ['5', 'Five'], ['6', 'Six'], ['7', 'Seven'], ['8', 'Eight'], ['9', 'Nine'], ['10', 'Ten'], ['J', 'Jack'], ['Q', 'Queen'], ['K', 'King']];
  const cards = SUITS.flatMap(([sym, suit, red]) => RANKS.map(([r, name]) => ({ r, sym, red, name: `${name} of ${suit}` })));

  // The prizes, 52 of them, shuffled once for this visitor.
  let state = S.store.get('nsf-deck', null);
  if (!state || !Array.isArray(state.order)) {
    const pool = P.prizes.flatMap((p, i) => Array(p.cards).fill(i));
    while (pool.length < 52) pool.push(0);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    state = { order: pool.slice(0, 52), card: null };
    S.store.set('nsf-deck', state);
  }
  const save = () => S.store.set('nsf-deck', state);

  // Between the intro and the deck, the announcement bar offers the deck to anyone who skipped it.
  function offerInBar() {
    if (state.done && state.code) { $('.note').textContent = `Black Friday: your ${state.label} is on your bag`; return; }
    const note = $('.note');
    const text = state.card != null ? `Black Friday: add your email to claim your ${state.label}` : 'Black Friday: pick a card for your discount';
    note.innerHTML = `<button type="button" class="note__deck">${text}</button>`;
    note.querySelector('button').addEventListener('click', open);
  }

  let skipped = false;
  try { skipped = !!sessionStorage.getItem('nsf-deck-skip'); } catch { /* */ }
  const force = params.has('deck');

  const mark = () => $('#nsfa-mark')?.innerHTML || '';

  let deck, others;
  function open() {
    if (deck) return;
    deck = document.createElement('section');
    deck.className = 'deck'; deck.setAttribute('role', 'dialog'); deck.setAttribute('aria-modal', 'true'); deck.setAttribute('aria-labelledby', 'deck-h');
    const back = mark();
    deck.innerHTML = `
      <div class="deck__head">
        <div><h2 id="deck-h">${P.name}. Pick a card.</h2></div>
        <p>52 cards. One each. Whatever you turn over is yours.</p>
        <button type="button" class="deck__skip" data-deck-skip>Skip to the site</button>
      </div>
      <div class="deck__table">
        <div class="deck__grid" role="group" aria-label="The deck, 52 face-down cards">
          ${cards.map((c, k) => `<button type="button" class="pc" data-k="${k}" style="--k:${k}" aria-label="${c.name}, face down">
            <span class="pc__back"><span class="pc__idx ${c.red ? 'is-red' : ''}">${c.r}${c.sym}</span>${back}<span class="pc__idx pc__idx--b ${c.red ? 'is-red' : ''}">${c.r}${c.sym}</span></span>
            <span class="pc__face"></span></button>`).join('')}
        </div>
      </div>
      <div class="deck__foot"><p class="deck__msg" aria-live="polite"></p></div>`;
    document.body.append(deck);
    others = [...document.body.children].filter((el) => el !== deck && !el.matches('script'));
    others.forEach((el) => { el.inert = true; });
    document.documentElement.style.overflow = 'hidden';
    deck.addEventListener('click', onClick);
    deck.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
    if (state.card != null) { reveal(state.card, true); }
    else setTimeout(() => deck.querySelector('.pc')?.focus({ preventScroll: true }), reduce ? 0 : 520);
  }

  function onClick(e) {
    if (e.target.closest('[data-deck-skip]')) return close(true);
    const pc = e.target.closest('.pc');
    if (pc && state.card == null) return pick(+pc.dataset.k);
    if (e.target.closest('[data-deck-next]')) return emailStep();
  }

  function pick(k) {
    const prize = P.prizes[state.order[k]];
    // The code itself is held back until the email is in (see emailStep).
    Object.assign(state, { card: k, prize: state.order[k], label: prize.label, cardName: cards[k].name });
    save();
    S.track('deck_card_flip', { card: cards[k].name, prize: prize.label });
    reveal(k, false);
  }

  function reveal(k, instant) {
    const pc = deck.querySelector(`.pc[data-k="${k}"]`);
    const c = cards[k];
    pc.querySelector('.pc__face').innerHTML = `<span class="pc__idx ${c.red ? 'is-red' : ''}">${c.r}${c.sym}</span>
      <span class="pc__prize"><span>Your card</span><b>${state.label}</b>${state.code ? `<code>${state.code}</code>` : '<span>Add your email to claim it</span>'}</span>
      <span class="pc__idx pc__idx--b ${c.red ? 'is-red' : ''}">${c.r}${c.sym}</span>`;
    const table = deck.querySelector('.deck__table').getBoundingClientRect();
    const r = pc.getBoundingClientRect();
    const wide = r.width > r.height;
    const ts = Math.min(4, (table.height * 0.72) / r.height, (table.width * (wide ? 0.8 : 0.5)) / r.width);
    pc.style.setProperty('--tx', `${table.left + table.width / 2 - (r.left + r.width / 2)}px`);
    pc.style.setProperty('--ty', `${table.top + table.height / 2 - (r.top + r.height / 2)}px`);
    pc.style.setProperty('--ts', ts.toFixed(3));
    if (instant) pc.style.transition = 'none';
    deck.classList.add('is-picked');
    pc.classList.add('is-chosen');
    pc.setAttribute('aria-label', `${c.name}: ${state.label}`);
    deck.querySelectorAll('.pc').forEach((x) => { if (x !== pc) x.tabIndex = -1; });
    const foot = deck.querySelector('.deck__foot');
    setTimeout(() => {
      foot.innerHTML = `<p class="vh" aria-live="polite">You turned over the ${c.name}: ${state.label}.</p><button type="button" class="btn btn--light" data-deck-next>Next</button>`;
      foot.querySelector('button').focus({ preventScroll: true });
    }, instant || reduce ? 0 : 950);
  }

  function emailStep() {
    const table = deck.querySelector('.deck__table');
    table.innerHTML = `<div class="deck__step"><form class="deck__email" novalidate>
      <h3>Add your email to claim it</h3>
      <p>Your code unlocks as soon as your email is in. We'll send it to you too, and tell you first about Black Friday drops.</p>
      <div class="deck__code"><span>Your card</span><strong>${state.label}</strong></div>
      <label class="vh" for="deck-email">Email</label>
      <input id="deck-email" name="email" type="email" autocomplete="email" placeholder="Email address" required>
      <p class="deck__msg" role="status"></p>
      <button class="btn btn--light" type="submit">Claim my ${state.label}</button>
      <button type="button" class="link deck__nothanks" data-deck-skip>No thanks, continue without the discount</button>
      <p class="bag-small" style="color:inherit;opacity:.75">You can unsubscribe any time.</p>
    </form></div>`;
    deck.querySelector('.deck__foot').innerHTML = '';
    const f = table.querySelector('form');
    f.email.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { f.querySelector('.deck__msg').textContent = 'Check the email address.'; f.email.focus(); return; }
      f.querySelector('button').disabled = true;
      const code = P.prizes[state.prize].code;
      try {
        await S.sendEmail({ email, source: 'black-friday-deck', tags: ['black-friday', 'deck', code], extra: { card: state.cardName, prize: state.label, code } });
      } catch { /* the email is in; never block the visitor on a network error */ }
      state.code = code; state.email = true; state.done = true; save();
      close(false);
    });
  }

  function close(skip) {
    // Skipping before the email: no discount. The card stays theirs (no re-deal), and
    // the bar and bag offer to claim it with an email until they do.
    if (skip && !state.done) { try { sessionStorage.setItem('nsf-deck-skip', '1'); } catch { /* */ } }
    const finish = () => {
      deck.remove(); deck = null;
      others.forEach((el) => { el.inert = false; });
      document.documentElement.style.overflow = '';
      offerInBar();
      if (state.done && state.code) S.toast(`Your ${state.label} is on your bag. It's applied at checkout.`, 'View bag', S.openBag);
      else if (state.card != null) S.toast(`No discount without an email. Your ${state.label} card is saved if you change your mind.`, 'Claim it', open);
      S.renderBag?.();
      document.querySelector('#main h1, #main')?.focus?.({ preventScroll: true });
    };
    if (reduce) return finish();
    deck.classList.add('is-leaving');
    setTimeout(finish, 720);
  }

  window.NSFDeck = { open };
  (window.NSFIntro || Promise.resolve()).then(() => {
    if (force || (!state.done && !skipped)) open();
    else offerInBar();
  });
})();
