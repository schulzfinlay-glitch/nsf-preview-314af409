/* The deck: Black Friday only.
 * One real deck of 52 cards, shared by every visitor (owner, 24 Nov 2026).
 * Each card can be turned over once, by one person. Taken cards grey out on
 * everyone's screen (the open deck re-checks every few seconds); when all 52
 * are gone the deck stops appearing. The shared pool lives in a Google Sheet
 * (tools/deck-pool.gs, set promo.js `pool`); until then a demo pool in this
 * browser stands in, so the preview still works.
 *
 * Tap a card: it lifts to the middle and spins to show the discount. Next:
 * email. Next: into the site, with the code on the bag (it rides the checkout
 * link, see site.js). One card per visitor and per email. No email, no
 * discount: the code is only given once an email is in. Skipping keeps the
 * card (it's still gone from the pool). Cards are dealt on arrival only. */
(() => {
  const P = window.NSF_PROMO;
  const S = window.NSFSite;
  if (!P || !S) return;
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  if (params.get('deck') === 'reset') { try { localStorage.removeItem('nsf-deck'); localStorage.removeItem('nsf-pool-demo'); sessionStorage.removeItem('nsf-deck-skip'); } catch { /* */ } }
  if (!S.promoLive() && !params.has('deck')) return;

  const SUITS = [['♠', 'spades', 0], ['♥', 'hearts', 1], ['♦', 'diamonds', 1], ['♣', 'clubs', 0]];
  const RANKS = [['A', 'Ace'], ['2', 'Two'], ['3', 'Three'], ['4', 'Four'], ['5', 'Five'], ['6', 'Six'], ['7', 'Seven'], ['8', 'Eight'], ['9', 'Nine'], ['10', 'Ten'], ['J', 'Jack'], ['Q', 'Queen'], ['K', 'King']];
  const cards = SUITS.flatMap(([sym, suit, red]) => RANKS.map(([r, name]) => ({ r, sym, red, name: `${name} of ${suit}` })));
  const POLL_MS = 8000;

  // This visitor: an id for the pool, and their card if they have one.
  let vid = S.store.get('nsf-vid', null);
  if (!vid) { vid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); S.store.set('nsf-vid', vid); }
  let state = S.store.get('nsf-deck', null);
  if (!state || state.v !== 2) state = { v: 2, card: null };
  const save = () => S.store.set('nsf-deck', state);

  /* ---------- The pool ---------- */
  const pool = P.pool ? livePool(P.pool) : demoPool();

  function livePool(url) {
    const post = async (body) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) })).json();
    return {
      live: true,
      state: async () => (await fetch(`${url}?a=state`, { cache: 'no-store' })).json(),
      pick: (k) => post({ a: 'pick', k, visitor: vid }),
      claim: (k, token, email) => post({ a: 'claim', k, token, email }),
    };
  }

  // Demo: the same answers as the Sheet, kept in this browser only.
  function demoPool() {
    const load = () => {
      let d = S.store.get('nsf-pool-demo', null);
      if (!d || !Array.isArray(d.order)) {
        const order = P.prizes.flatMap((p, i) => Array(p.cards).fill(i)).slice(0, 52);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        d = { order, taken: {} }; S.store.set('nsf-pool-demo', d);
      }
      return d;
    };
    const view = (d) => { const taken = Object.keys(d.taken).map(Number); return { taken, left: 52 - taken.length }; };
    return {
      live: false,
      state: async () => view(load()),
      pick: async (k) => {
        const d = load();
        const mine = Object.entries(d.taken).find(([, t]) => t.visitor === vid);
        if (mine) return { ok: true, k: +mine[0], prize: P.prizes[d.order[+mine[0]]].label, token: mine[1].token, again: true };
        if (d.taken[k]) return { ok: false, error: 'taken', ...view(d) };
        const token = String(Math.random()).slice(2);
        d.taken[k] = { visitor: vid, token }; S.store.set('nsf-pool-demo', d);
        return { ok: true, k, prize: P.prizes[d.order[k]].label, token };
      },
      claim: async (k, token, email) => {
        const d = load();
        if (!d.taken[k] || d.taken[k].token !== token) return { ok: false, error: 'token' };
        d.taken[k].email = email; S.store.set('nsf-pool-demo', d);
        return { ok: true, code: P.prizes[d.order[k]].code };
      },
    };
  }

  /* ---------- The bar ---------- */
  // Cards are dealt only on arrival. The bar never asks anyone to pick; once a
  // card is turned over it shows that card instead.
  function offerInBar() {
    if (state.done && state.code) { $('.note').textContent = `Black Friday: your ${state.label} is on your bag`; return; }
    if (state.card == null) return; // no card: the bar stays the shipping note
    const note = $('.note');
    note.innerHTML = `<button type="button" class="note__deck">Black Friday: add your email to claim your ${state.label}</button>`;
    note.querySelector('button').addEventListener('click', open);
  }

  let skipped = false;
  try { skipped = !!sessionStorage.getItem('nsf-deck-skip'); } catch { /* */ }
  const force = params.has('deck');
  const mark = () => $('#nsfa-mark')?.innerHTML || '';

  /* ---------- The table ---------- */
  let deck, others, poll = 0, busy = false, left = 52;

  function open(first, pending) {
    if (deck) return;
    deck = document.createElement('section');
    deck.className = 'deck'; deck.setAttribute('role', 'dialog'); deck.setAttribute('aria-modal', 'true'); deck.setAttribute('aria-labelledby', 'deck-h');
    const back = mark();
    deck.innerHTML = `
      <div class="deck__head">
        <div><h2 id="deck-h">${P.name}. Pick a card.</h2></div>
        <p data-deck-left>52 cards, shared by everyone. Once a card is taken, it's gone.</p>
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
    if (state.card != null) { reveal(state.card, true); return; }
    if (first) paintTaken(first);
    if (pending) pending.then((s) => { if (s) paintTaken(s); else refresh(); });
    else if (!first) refresh();
    poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    setTimeout(() => deck?.querySelector('.pc:not(.is-taken)')?.focus({ preventScroll: true }), reduce ? 0 : 520);
  }

  async function refresh() {
    try { paintTaken(await pool.state()); } catch { /* keep what's shown; the next check may work */ }
  }

  function paintTaken(s) {
    if (!deck || !s || !Array.isArray(s.taken) || deck.classList.contains('is-picked')) return;
    left = s.left;
    const gone = new Set(s.taken);
    deck.querySelectorAll('.pc').forEach((pc) => {
      const k = +pc.dataset.k; const was = pc.classList.contains('is-taken');
      if (gone.has(k) && !was) {
        pc.classList.add('is-taken'); pc.disabled = true;
        pc.setAttribute('aria-label', `${cards[k].name}, taken`);
      }
    });
    const line = deck.querySelector('[data-deck-left]');
    if (line) line.textContent = left === 52 ? '52 cards, shared by everyone. Once a card is taken, it\'s gone.' : `${left} of 52 cards left. Once a card is taken, it's gone.`;
    if (left <= 0) soldOut();
  }

  function soldOut() {
    clearInterval(poll);
    const foot = deck.querySelector('.deck__foot');
    foot.innerHTML = '<p class="deck__msg" role="status">All 52 cards have been taken. Thanks for playing.</p><button type="button" class="btn btn--light" data-deck-skip>Continue to the site</button>';
  }

  function onClick(e) {
    if (e.target.closest('[data-deck-skip]')) return close(true);
    const pc = e.target.closest('.pc');
    if (pc && state.card == null && !pc.classList.contains('is-taken')) return pick(+pc.dataset.k);
    if (e.target.closest('[data-deck-next]')) return emailStep();
  }

  async function pick(k) {
    if (busy) return; busy = true;
    const pc = deck.querySelector(`.pc[data-k="${k}"]`);
    const msg = deck.querySelector('.deck__foot .deck__msg');
    pc.classList.add('is-dealing'); deck.classList.add('is-dealing');
    let res;
    try { res = await pool.pick(k); } catch { res = { ok: false, error: 'network' }; }
    pc.classList.remove('is-dealing'); deck?.classList.remove('is-dealing'); busy = false;
    if (!deck) return;
    if (!res.ok) {
      if (res.error === 'taken') {
        paintTaken(res);
        if (msg && left > 0) msg.textContent = `Someone just took the ${cards[k].name}. Pick another.`;
      } else if (msg) msg.textContent = 'Couldn\'t reach the deck. Check your connection and try again.';
      return;
    }
    clearInterval(poll);
    state = { v: 2, card: res.k, label: res.prize, token: res.token, cardName: cards[res.k].name };
    save();
    S.track('deck_card_flip', { card: state.cardName, prize: state.label });
    reveal(res.k, false);
  }

  function reveal(k, instant) {
    const pc = deck.querySelector(`.pc[data-k="${k}"]`);
    const c = cards[k];
    pc.classList.remove('is-taken'); pc.disabled = false;
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
      <p class="bag-small" style="color:inherit;opacity:.75">One card per person. You can unsubscribe any time.</p>
    </form></div>`;
    deck.querySelector('.deck__foot').innerHTML = '';
    const f = table.querySelector('form');
    const msg = f.querySelector('.deck__msg');
    f.email.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Check the email address.'; f.email.focus(); return; }
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; msg.textContent = 'Unlocking your code…';
      let res;
      try { res = await pool.claim(state.card, state.token, email); } catch { res = { ok: false, error: 'network' }; }
      if (!res.ok) {
        btn.disabled = false;
        msg.textContent = res.error === 'email-used' ? `That email already has a card${res.prize ? ` (${res.prize})` : ''}. One card per person.`
          : res.error === 'network' ? 'Couldn\'t reach the deck. Check your connection and try again.'
          : 'Something went wrong with this card. Please try again.';
        return;
      }
      const code = res.code;
      try {
        await S.sendEmail({ email, source: 'black-friday-deck', tags: ['black-friday', 'deck', code], extra: { card: state.cardName, prize: state.label, code } });
      } catch { /* the claim is in; never block the visitor on the mailing list */ }
      state.code = code; state.email = true; state.done = true; save();
      close(false);
    });
  }

  function close(skip) {
    clearInterval(poll);
    // Skipping before the email: no discount. The card stays theirs (it's gone
    // from the pool either way), and the bar and bag offer to claim it.
    if (skip && !state.done) { try { sessionStorage.setItem('nsf-deck-skip', '1'); } catch { /* */ } }
    const finish = () => {
      deck.remove(); deck = null;
      others.forEach((el) => { el.inert = false; });
      document.documentElement.style.overflow = '';
      offerInBar();
      if (state.done && state.code) S.toast(`Your ${state.label} is on your bag. It's applied at checkout.`, 'View bag', S.openBag);
      else if (state.card != null) S.toast(`No discount without an email. Your ${state.label} card is saved if you change your mind.`, 'Claim it', () => open());
      S.renderBag?.();
      dispatchEvent(new Event('nsf-deck-change')); // the home banner shows the card
      document.querySelector('#main h1, #main')?.focus?.({ preventScroll: true });
    };
    if (reduce) return finish();
    deck.classList.add('is-leaving');
    setTimeout(finish, 720);
  }

  window.NSFDeck = { open: () => open() };
  // Ask the pool which cards are gone straight away, while the intro plays
  // (Google takes ~2 s to answer), so the deck can deal the moment it ends.
  const early = state.card == null && (force || !skipped) ? pool.state().catch(() => undefined) : null;
  (window.NSFIntro || Promise.resolve()).then(async () => {
    if (state.card != null) { if (force || (!state.done && !skipped)) open(); else offerInBar(); return; }
    if (!force && skipped) return;
    const quick = await Promise.race([early, new Promise((r) => setTimeout(() => r('wait'), 250))]);
    if (quick === undefined) return; // the pool can't be reached: stay out of the way
    if (quick !== 'wait') { if (quick && quick.left > 0) open(quick); return; }
    // Still waiting on Google: deal now; cards already taken grey out when the answer lands.
    open(null, early);
  });
})();
