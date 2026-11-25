/* Non Stop Flow v2: shared behaviour on every page.
 * Bag (kept in localStorage), quick add, swatches on cards, sheets, toast,
 * checkout hand-off to the store's real Shopify checkout, and the one email
 * adapter used by the sign-up form and the Black Friday deck. */
(() => {
  const NSF = window.NSF;            // data/catalogue.js
  const STORE = NSF.store;
  const FREE = NSF.freeShipping;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2);
  const img = (src, w) => `${src}?width=${w}`;
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: bag lives for this page only */ } },
  };

  // variant id -> { style, colour, variant }
  const index = new Map();
  for (const s of NSF.styles) for (const c of s.colours) for (const v of c.variants) index.set(v.id, { s, c, v });

  /* ---------- Bag ---------- */
  let bag = store.get('nsf-bag', []).filter((l) => index.has(l.id));
  const save = () => { store.set('nsf-bag', bag); render(); };
  const count = () => bag.reduce((n, l) => n + l.qty, 0);
  const subtotal = () => bag.reduce((n, l) => n + index.get(l.id).v.price * l.qty, 0);

  /* ---------- Funnel tracking ----------
   * GA4 ecommerce events into window.dataLayer. Nothing is sent anywhere until
   * the store adds Google Tag Manager or GA4 (README, "Measuring the funnels"). */
  const item = (id, qty = 1) => {
    const { s, c, v } = index.get(id);
    return { item_id: String(id), item_name: s.name, item_variant: `${c.colour} / ${v.size}`, item_category: s.type, item_brand: 'Non Stop Flow', price: v.price, quantity: qty };
  };
  function track(event, data = {}) {
    const dl = (window.dataLayer = window.dataLayer || []);
    if (data.items) dl.push({ ecommerce: null });
    dl.push(data.items ? { event, ecommerce: { currency: 'AUD', ...data } } : { event, ...data });
  }

  let lastAdded = null;
  function add(id, qty = 1, { source = 'quick-add', quiet = false } = {}) {
    const line = bag.find((l) => l.id === id);
    if (line) line.qty += qty; else bag.push({ id, qty });
    lastAdded = id;
    save();
    const it = item(id, qty);
    track('add_to_cart', { value: it.price * qty, items: [{ ...it, item_list_name: source }] });
    document.dispatchEvent(new CustomEvent('nsf:added', { detail: { id } }));
    // The funnel: every add opens the bag, where the next step is offered.
    if (!quiet) openBag(id);
  }
  function setQty(id, qty) {
    const before = bag.find((l) => l.id === id);
    if (before && qty < before.qty) { const it = item(id, before.qty - qty); track('remove_from_cart', { value: it.price * it.quantity, items: [it] }); }
    bag = bag.map((l) => (l.id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0);
    save();
  }
  // The discount only rides checkout once the visitor has given an email for it.
  const dealCode = () => { const d = store.get(deckKey(), null); return d && d.code && d.email && promoLive() ? d.code : ''; };
  /* ---------- A free gift that comes with a card (the gym bag) ----------
   * The prize names a hidden $0 product (promo.js gift). Its variant is looked up
   * on the store itself and added to the winner's checkout, next to their code. */
  const dealGift = () => {
    const d = store.get(deckKey(), null); if (!d || !d.code || !d.email || !promoLive()) return null;
    const p = ((window.NSF_PROMO || {}).prizes || []).find((x) => x.label === d.label);
    return p && p.gift ? p.gift : null;
  };
  let giftId = null;
  function loadGift() {
    const h = dealGift(); if (!h || giftId) return;
    fetch(`${STORE}/products/${h}.js`).then((r) => (r.ok ? r.json() : null)).then((p) => {
      const v = p && p.variants.find((x) => x.available);
      if (v) { giftId = v.id; render(); }
    }).catch(() => {});
  }
  function checkoutUrl(lines = bag) {
    const gift = dealGift() && giftId ? [{ id: giftId, qty: 1 }] : [];
    const items = [...lines, ...gift].map((l) => `${l.id}:${l.qty}`).join(',');
    const code = dealCode();
    return `${STORE}/cart/${items}${code ? `?discount=${encodeURIComponent(code)}` : ''}`;
  }
  function checkout(lines = bag, source = 'bag') {
    const items = lines.map((l) => item(l.id, l.qty));
    track('begin_checkout', { value: items.reduce((n, i) => n + i.price * i.quantity, 0), coupon: dealCode() || undefined, items, checkout_from: source });
    location.href = checkoutUrl(lines);
  }

  /* ---------- Sets: a top finds its bottom, in the same colour ---------- */
  const TOPS = ['Tanks', 'Bras & crops', 'Tees & tops'];
  const BOTTOMS = ['Shorts', 'Leggings'];
  const rangeOf = (s) => s.name.split(' ').slice(0, 2).join(' ');
  const inBag = (styleId) => bag.some((l) => index.get(l.id).s.id === styleId);
  // Up to `n` pieces that make a set with style s in this colour, best sellers first,
  // same range first (Signature Sculpt with Signature Sculpt). Same colour only: a
  // set in two colours is not what anyone means by a set.
  function partners(s, colour, n = 2) {
    const want = TOPS.includes(s.type) ? BOTTOMS : BOTTOMS.includes(s.type) ? TOPS : [];
    return NSF.styles
      .filter((x) => want.includes(x.type) && x.id !== s.id && !inBag(x.id) && (s.womens ? x.womens : x.mens))
      .map((x) => ({ s: x, c: x.colours.find((k) => k.colour === colour && k.variants.some((v) => v.stock)) }))
      .filter((x) => x.c)
      .sort((a, b) => (rangeOf(b.s) === rangeOf(s)) - (rangeOf(a.s) === rangeOf(s)) || a.s.rank - b.s.rank)
      .slice(0, n);
  }
  // Pieces that close the gap to free shipping: the cheapest in-stock styles that clear it.
  function gapFillers(left, n = 2) {
    return NSF.styles.filter((x) => !inBag(x.id))
      .map((x) => ({ s: x, c: x.colours.find((k) => k.variants.some((v) => v.stock)) }))
      .filter((x) => x.c && x.c.price >= left)
      .sort((a, b) => a.c.price - b.c.price || a.s.rank - b.s.rank)
      .slice(0, n);
  }
  const offerHtml = ({ s, c }, size, src) => `<div class="offer">
      <a href="/nsf-preview-314af409/products/${s.id}/?colour=${encodeURIComponent(c.colour)}"><img src="${img(c.images[0].src, 200)}" alt="" width="64" height="85" loading="lazy"></a>
      <div class="offer__main"><a class="offer__name" href="/nsf-preview-314af409/products/${s.id}/?colour=${encodeURIComponent(c.colour)}">${s.name}</a>
        <p class="bag-item__meta">${c.colour} · ${c.was ? `<span class="price--sale">${money(c.price)}</span>` : money(c.price)}</p>
        <div class="sizes offer__sizes" role="group" aria-label="Add ${s.name} in a size">${c.variants.map((v) => `<button type="button" class="size${v.size === size && v.stock ? ' is-suggested' : ''}" data-add="${v.id}" data-src="${src}" ${v.stock ? '' : 'disabled'} aria-label="Add ${v.size}${v.stock ? '' : ', sold out'}">${v.size}</button>`).join('')}</div>
      </div></div>`;
  function promoLive() {
    const P = window.NSF_PROMO; if (!P) return false;
    const now = Date.now();
    const inWindow = now >= Date.parse(P.start) && now < Date.parse(P.end);
    // ?promo=clock: follow the real times on any host (to check the live rule).
    if (/[?&]promo=clock/.test(location.search)) return inWindow;
    // Test hosts (the GitHub preview, localhost) show the sale all the time.
    const host = location.hostname;
    const alwaysOn = (P.alwaysOn || []).some((h) => host === h || host.endsWith('.' + h));
    return !!P.preview || alwaysOn || inWindow;
  }
  // Test hosts (the GitHub preview, localhost) and Shopify's theme preview.
  function testHost() {
    const P = window.NSF_PROMO || {}; const host = location.hostname;
    const shopifyPreview = !!(window.Shopify && Shopify.theme && Shopify.theme.role && Shopify.theme.role !== 'main');
    return shopifyPreview || (P.alwaysOn || []).some((h) => host === h || host.endsWith('.' + h));
  }
  // Practice cards are kept apart from a real card, so a test never carries into the sale.
  function deckKey() { return promoReal() ? 'nsf-deck' : 'nsf-deck-practice'; }
  // Real cards only on the live store, inside the sale. Everywhere else the deck
  // deals practice cards kept in the visitor's own browser, so tests never use one up.
  function promoReal() {
    const P = window.NSF_PROMO; if (!P || P.preview || testHost()) return false;
    const now = Date.now();
    return now >= Date.parse(P.start) && now < Date.parse(P.end);
  }

  // What the bag offers next: the other half of a set, then the cheapest way to free shipping.
  function funnelHtml(left) {
    const base = lastAdded && bag.some((l) => l.id === lastAdded) ? index.get(lastAdded)
      : bag.map((l) => index.get(l.id)).find(({ s, c }) => partners(s, c.colour, 1).length);
    let html = '';
    const set = base ? partners(base.s, base.c.colour, 1) : [];
    if (set.length) {
      const p = set[0];
      html += `<section class="upsell" aria-labelledby="up-set"><h3 class="label" id="up-set">Make it a set</h3>
        <p class="upsell__why">${p.s.type === 'Shorts' || p.s.type === 'Leggings' ? 'The bottoms that go' : 'The top that goes'} with your ${base.s.name.replace(/^Signature Sculpt /, '')} in ${base.c.colour}.${left > 0 && p.c.price >= left ? ' It also gets you free shipping.' : ''}</p>
        ${offerHtml(p, base.v.size, 'bag-set')}</section>`;
    }
    if (left > 0 && left <= 45 && !(set.length && set[0].c.price >= left)) {
      const fill = gapFillers(left);
      if (fill.length) html += `<section class="upsell" aria-labelledby="up-ship"><h3 class="label" id="up-ship">${money(left)} to free shipping</h3>
        ${fill.map((f) => offerHtml(f, base ? base.v.size : '', 'bag-free-shipping')).join('')}</section>`;
    }
    return html;
  }

  function render() {
    const n = count();
    $$('[data-bag-count]').forEach((el) => { el.textContent = n ? String(n) : ''; });
    const body = $('#bag-body'); if (!body) return;
    const sub = subtotal();
    const left = Math.max(0, FREE - sub);
    $('#bag-meter').style.setProperty('--m', Math.min(1, sub / FREE));
    $('#bag-meter-text').textContent = n === 0 ? `Free shipping on orders over $${FREE}.`
      : left > 0 ? `${money(left)} away from free shipping.` : 'You get free shipping.';
    if (!n) {
      body.innerHTML = `<div class="bag-empty"><p>Your bag is empty.</p><a class="btn" href="/nsf-preview-314af409/shop/">Shop now</a></div>`;
    } else {
      body.innerHTML = bag.map((l) => {
        const { s, c, v } = index.get(l.id);
        return `<div class="bag-item">
          <img src="${img(c.images[0].src, 200)}" alt="" width="84" height="112" loading="lazy">
          <div><h3><a href="/nsf-preview-314af409/products/${s.id}/?colour=${encodeURIComponent(c.colour)}">${s.name}</a></h3>
            <p class="bag-item__meta">${c.colour} / ${v.size}</p>
            <div class="qty" role="group" aria-label="Quantity of ${s.name}">
              <button type="button" data-qty="${l.id}:${l.qty - 1}" aria-label="One less">−</button>
              <span aria-live="polite">${l.qty}</span>
              <button type="button" data-qty="${l.id}:${l.qty + 1}" aria-label="One more">+</button></div></div>
          <div class="bag-item__side"><span class="price">${money(v.price * l.qty)}</span>
            <button type="button" class="link bag-small" data-qty="${l.id}:0">Remove</button></div></div>`;
      }).join('') + funnelHtml(left);
    }
    $('#bag-subtotal').textContent = money(sub);
    const deal = store.get(deckKey(), null);
    const codeRow = $('#bag-code');
    if (deal && deal.code && deal.email && promoLive()) {
      codeRow.hidden = false;
      codeRow.innerHTML = `<span>Your card: <strong>${deal.label}</strong></span><span class="mono">${deal.code}</span>${dealGift() ? `<span class="bag-gift">${giftId ? 'Free gym bag: added at checkout' : 'Free gym bag: we\'ll add it to your order'}</span>` : ''}`;
      loadGift();
    } else if (deal && deal.card != null && promoLive()) {
      // Picked a card but gave no email: not applied. One tap goes back to the email step.
      codeRow.hidden = false;
      codeRow.innerHTML = `<span>Your <strong>${deal.label}</strong> card isn't applied yet</span><a class="link" href="/nsf-preview-314af409/?deck">Add email to claim</a>`;
    } else codeRow.hidden = true;
    const go = $('#bag-checkout');
    go.toggleAttribute('disabled', !n);
  }

  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-qty]');
    if (q) { const [id, n] = q.dataset.qty.split(':').map(Number); setQty(id, n); return; }
    if (e.target.closest('#bag-checkout') && bag.length) { checkout(bag, 'bag'); return; }
    if (e.target.closest('[data-open-bag]')) { e.preventDefault(); openBag(); return; }
    if (e.target.closest('[data-open-menu]')) { open('#menu'); return; }
    if (e.target.closest('[data-close]')) { closeAll(); return; }
    // Quick add: any button carrying a variant id.
    const a = e.target.closest('[data-add]');
    if (a && !a.disabled) { add(Number(a.dataset.add), 1, { source: a.dataset.src || (a.closest('.lu-info') ? 'home-lineup' : a.closest('.card') ? 'card-quick-add' : 'quick-add') }); a.classList.add('is-added'); setTimeout(() => a.classList.remove('is-added'), 900); return; }
    // Card swatches swap the card's colour in place.
    const sw = e.target.closest('.card [data-colour]');
    if (sw) { e.preventDefault(); paintCard(sw.closest('.card'), sw.dataset.colour); return; }
    const plus = e.target.closest('.card__plus');
    if (plus) { plus.closest('.card').classList.add('is-adding'); plus.closest('.card').querySelector('.card__add .size:not([disabled])')?.focus(); }
  });

  function paintCard(card, colour) {
    const s = NSF.byId[card.dataset.style];
    const c = s.colours.find((x) => x.colour === colour); if (!c) return;
    const [a, b] = card.querySelectorAll('.card__media img');
    a.src = img(c.images[0].src, 700); a.srcset = `${img(c.images[0].src, 480)} 480w, ${img(c.images[0].src, 800)} 800w`;
    if (b) { const i2 = c.images[1] || c.images[0]; b.src = img(i2.src, 700); b.srcset = `${img(i2.src, 480)} 480w, ${img(i2.src, 800)} 800w`; }
    card.querySelectorAll('[data-colour]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.colour === colour)));
    card.querySelector('.card__title').href = `/nsf-preview-314af409/products/${s.id}/?colour=${encodeURIComponent(colour)}`;
    card.querySelector('.card__colour').textContent = colour;
    card.querySelector('.card__price').outerHTML = priceHtml(c, 'card__price');
    card.querySelector('.card__add .sizes').innerHTML = sizesHtml(c);
    const flag = card.querySelector('.card__flag--sale'); if (flag) flag.hidden = !c.was;
    const fresh = card.querySelector('.card__flag--new'); if (fresh) fresh.hidden = !(c.latest && !c.was);
  }
  const priceHtml = (c, cls = '') => c.was
    ? `<span class="price price--sale ${cls}">${money(c.price)}<s>${money(c.was)}</s></span>`
    : `<span class="price ${cls}">${money(c.price)}</span>`;
  const sizesHtml = (c) => c.variants.map((v) => `<button type="button" class="size" data-add="${v.id}" ${v.stock ? '' : 'disabled'} aria-label="Add ${v.size}${v.stock ? '' : ', sold out'}">${v.size}</button>`).join('');

  /* ---------- Sheets ---------- */
  let lastFocus = null;
  function open(sel) {
    const el = $(sel); if (!el) return;
    lastFocus = document.activeElement;
    el.classList.add('is-open'); el.removeAttribute('inert');
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => el.querySelector('[data-autofocus], button, a, input')?.focus(), 60);
  }
  function closeAll() {
    $$('.sheet.is-open').forEach((el) => { el.classList.remove('is-open'); el.setAttribute('inert', ''); });
    document.documentElement.style.overflow = '';
    lastFocus?.focus?.();
  }
  function openBag() {
    render();
    if (!$('#bag')?.classList.contains('is-open')) {
      track('view_cart', { value: subtotal(), items: bag.map((l) => item(l.id, l.qty)) });
      open('#bag');
    }
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.sheet.is-open')) closeAll(); });

  /* ---------- Toast ---------- */
  let tt;
  function toast(msg, action, fn) {
    const t = $('#toast'); if (!t) return;
    t.innerHTML = `<span>${msg}</span>${action ? `<button type="button">${action}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('is-on'); fn(); };
    t.classList.add('is-on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('is-on'), 3600);
  }

  /* ---------- Bar ---------- */
  const bar = $('.bar');
  const onScroll = () => bar && bar.classList.toggle('is-scrolled', scrollY > 4);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- Email: one adapter for sign-up and the deck ----------
   * mode 'demo'   : kept in this browser only (localStorage 'nsf-emails'). Preview default.
   * mode 'sheet'  : POST to a Google Apps Script web app (tools/email-to-sheet.gs).
   * mode 'shopify': Shopify's own customer form, so the email lands in
   *                 Shopify admin > Customers with tags, ready for Shopify Email. */
  async function sendEmail({ email, source, tags = [], extra = {} }) {
    const P = window.NSF_EMAIL || { mode: 'demo' };
    const row = { email, source, tags: tags.join(','), at: new Date().toISOString(), ...extra };
    track('generate_lead', { lead_source: source });
    if (P.mode === 'sheet' && P.sheetUrl) {
      await fetch(P.sheetUrl, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(row) });
      return true;
    }
    if (P.mode === 'shopify') {
      // A real form post into a hidden frame: Shopify's endpoint does not answer fetch() cross-site.
      const frame = document.createElement('iframe'); frame.name = 'nsf-sink'; frame.hidden = true; document.body.append(frame);
      const f = document.createElement('form'); f.method = 'post'; f.action = `${STORE}/contact#contact_form`; f.target = 'nsf-sink'; f.hidden = true;
      const field = (n, v) => { const i = document.createElement('input'); i.name = n; i.value = v; f.append(i); };
      field('form_type', 'customer'); field('utf8', '✓'); field('contact[email]', email);
      field('contact[tags]', ['newsletter', ...tags].join(','));
      field('contact[accepts_marketing]', 'true');
      document.body.append(f); f.submit(); setTimeout(() => { f.remove(); frame.remove(); }, 8000);
      return true;
    }
    const all = store.get('nsf-emails', []); all.push(row); store.set('nsf-emails', all);
    console.info('[demo] email kept in this browser only:', row);
    return true;
  }

  // Sign-up forms
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-signup]'); if (!f) return;
    e.preventDefault();
    const email = f.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { f.querySelector('[data-msg]').textContent = 'Check the email address.'; f.email.focus(); return; }
    await sendEmail({ email, source: 'signup', tags: ['signup'] });
    f.innerHTML = `<p data-msg role="status">You're in. Watch your inbox for the next drop.</p>`;
  });

  /* ---------- Coming back to a full bag ----------
   * First page of a new visit with something in the bag: the announcement bar
   * says so and opens it. (During Black Friday the deck's own offer takes the bar.) */
  try {
    if (count() && !sessionStorage.getItem('nsf-visit')) {
      const note = $('.note');
      if (note) {
        note.innerHTML = `<button type="button" class="note__deck" data-open-bag>Your bag is waiting: ${count()} ${count() === 1 ? 'item' : 'items'}, ${money(subtotal())}</button>`;
        track('bag_reminder_shown', { items_in_bag: count() });
      }
    }
    sessionStorage.setItem('nsf-visit', '1');
  } catch { /* storage blocked: no reminder */ }

  window.NSFSite = { add, renderBag: render, money, img, store, priceHtml, sizesHtml, toast, openBag, sendEmail, promoLive, promoReal, deckKey, index, partners, offerHtml, checkout, track, item };
  render();
})();

/* Main menu panels (Women, Men). Hover opens on a mouse, tap or Enter toggles,
 * Escape or a click elsewhere closes, and only one is open at a time. */
(() => {
  const btns = [...document.querySelectorAll('[data-mega]')];
  if (!btns.length) return;
  const bar = document.querySelector('.bar');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let openId = null, timer = 0;
  const panel = (id) => document.getElementById(`mega-${id}`);
  function show(id) {
    clearTimeout(timer);
    if (openId === id) return;
    if (openId) hide(false);
    openId = id;
    panel(id).hidden = false;
    btns.forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.mega === id)));
    bar.classList.add('is-mega');
  }
  function hide(focusBtn) {
    if (!openId) return;
    const was = openId;
    panel(was).hidden = true; openId = null;
    btns.forEach((b) => b.setAttribute('aria-expanded', 'false'));
    bar.classList.remove('is-mega');
    if (focusBtn) btns.find((b) => b.dataset.mega === was)?.focus();
  }
  btns.forEach((b) => {
    b.addEventListener('click', () => (openId === b.dataset.mega ? hide(false) : show(b.dataset.mega)));
    b.addEventListener('pointerenter', () => { if (fine.matches) show(b.dataset.mega); });
  });
  bar.addEventListener('pointerleave', () => { if (fine.matches) timer = setTimeout(() => hide(false), 160); });
  bar.addEventListener('pointerenter', () => clearTimeout(timer));
  // Non-menu links in the bar close the panel when hovered, so it never covers what you're aiming at.
  bar.querySelectorAll('.bar__nav a, .bar__tools, .bar__mark').forEach((el) => el.addEventListener('pointerenter', () => { if (fine.matches) hide(false); }));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) hide(true); });
  document.addEventListener('click', (e) => { if (openId && !e.target.closest('.bar')) hide(false); });
  // Tabbing out of the panel closes it.
  bar.addEventListener('focusout', (e) => { if (openId && !bar.contains(e.relatedTarget)) hide(false); });
})();
